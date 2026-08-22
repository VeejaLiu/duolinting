import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  CatalogExerciseSummary,
  CreateExerciseRequest,
  ExerciseCategory,
  ListeningExercise,
  MaterialCategory,
  ContentLocale,
  AdminRole,
} from '@duolinting/shared'
import type { AdminNoticeTone } from './admin/AdminFeedback'
import { MediaCourseForm } from './admin/MediaCourseForm'
import { MediaWaveform } from './admin/MediaWaveform'
import { MediaWaveformErrorBoundary } from './admin/MediaWaveformErrorBoundary'
import { SubtitleImporter } from './admin/SubtitleImporter'
import { SubtitleEditorInspector } from './admin/SubtitleEditorInspector'
import {
  apiClient,
  resolveApiUrl,
  type FileUploadProgress,
} from '../lib/apiClient'
import { ADMIN_TOKEN_STORAGE_KEY } from '../lib/contentTools'
import { useMediaPlayback } from '../hooks/useMediaPlayback'
import {
  analyzeSubtitleDraft,
  createEmptyDraftLine,
  draftLinesToSrt,
  mergeDraftLines,
  parseSubtitleDraft,
  TRANSLATION_LOCALE_LABELS,
  TRANSLATION_TARGET_LOCALES,
  type SubtitleDraftAnalysis,
  type SubtitleImportMode,
  toTranscriptLines,
  type DraftLine,
} from '../lib/mediaDraftTools'

type AudioLessonImporterProps = {
  adminToken: string
  categoryGroups: MaterialCategory[]
  categories: ExerciseCategory[]
  exercises: CatalogExerciseSummary[]
  draft:
    | {
        mode: 'create'
        categoryId: number
      }
    | {
        mode: 'edit'
        exercise: CatalogExerciseSummary
  }
    | null
  onRefreshCatalog: () => Promise<void>
  onStatusChange: (message: string, tone?: AdminNoticeTone) => void
  onDraftConsumed: () => void
  onUnsavedChangesChange: (hasUnsavedChanges: boolean) => void
  onRegisterSaveBeforeLeave: (
    handler: (() => Promise<boolean>) | null,
  ) => void
  adminRole: AdminRole
}

type ClipboardPanelState =
  | { mode: 'hidden' }
  | { mode: 'copy'; content: string; label?: string }
  | { mode: 'paste'; content: string }

const roundToMilliseconds = (seconds: number) =>
  Math.round(seconds * 1000) / 1000

// 后端媒体上传上限 120MB，前端选择文件时预检，超限直接拒绝
const MAX_MEDIA_FILE_SIZE = 120 * 1024 * 1024
const EMPTY_SUBTITLE_ANALYSIS: SubtitleDraftAnalysis = {
  blockCount: 0,
  bilingualBlockCount: 0,
  isLikelyBilingual: false,
  suggestedMode: 'single',
}
// 与后端翻译接口上限保持一致；智谱免费档并发很低，顺序提交比并发排队更稳定。
// 批次保持较小（6 行）：大批次更容易触发模型合并/漏行，小批失败重试代价也低。
const TRANSLATE_REQUEST_BATCH_SIZE = 6

const createImporterSnapshot = (
  courseForm: CreateExerciseRequest,
  draftLines: DraftLine[],
  subtitleDraft: string,
) =>
  JSON.stringify({
    courseForm: {
      audioUrl: courseForm.audioUrl,
      categoryId: courseForm.categoryId,
      coverImageUrl: courseForm.coverImageUrl,
      difficulty: courseForm.difficulty,
      durationLabel: courseForm.durationLabel,
      id: courseForm.id,
      mediaType: courseForm.mediaType,
      sortOrder: courseForm.sortOrder,
      source: courseForm.source,
      sourceUrl: courseForm.sourceUrl,
      status: courseForm.status,
      summary: courseForm.summary,
      title: courseForm.title,
    },
    draftLines: draftLines.map((line) => ({
      end: roundToMilliseconds(line.end),
      id: line.id,
      answers: line.answers ?? [],
      keywordsText: line.keywordsText,
      start: roundToMilliseconds(line.start),
      text: line.text,
      translation: line.translation,
      translations: line.translations,
    })),
    subtitleDraft,
  })

const exportToDltjson = (
  draftLines: DraftLine[],
): string => {
  // dltjson 只承载字幕编辑所需的稳定字段，便于文件和剪切板共用同一份格式。
  const dltjson = {
    version: '2.0',
    type: 'dltjson',
    lines: draftLines.map((line) => ({
      start: line.start,
      end: line.end,
      text: line.text,
      translation: line.translation,
      translations: line.translations,
      answers: line.answers ?? [],
      keywordsText: line.keywordsText,
    })),
  }
  return JSON.stringify(dltjson, null, 2)
}

// 专家分段提示词：把「提示词 + 当前英文字幕(SRT)」复制到 ChatGPT 等外部模型，
// 让模型做语义分段优化后返回 SRT，再通过字幕导入功能导回系统。
// 基于 1Ntb 提供的「英语学习视频字幕语义与时间轴优化专家」提示词改编：
// 外部模型拿不到视频/音频，故把「先分析视频音频」改为「按时间戳推算停顿与语速」；
// 输出统一约束为 SRT（原始规则 13–15 针对 HTJSON 结构，此处不适用）。
const SEGMENT_EXPERT_PROMPT = `你是一个英语学习视频字幕语义与时间轴优化专家。
输入是一个 SRT 字幕文件（见文末），包含英文文本与每句的 start/end 时间戳。你无法直接访问视频或音频，请根据文本与时间戳推算语音节奏：句间停顿 = 下一句 start − 上一句 end，语速 = 文本长度 ÷ (end − start)。
你的目标不是把字幕切得越碎越好，而是生成适合英语学习视频阅读的"语义文本块"。
请严格遵循以下优先级：语义完整性 > 语音节奏 > 教学结构 > 时间戳绝对不重叠 > 字幕长度。

规则：
1. 先根据时间戳推算停顿与语速，再修改字幕；不要只按原字幕机械切分。
2. 短句如果属于同一个自然表达/教学单元，应合并。
3. 中间存在明显长停顿时，即使两边很短也应拆分。参考阈值：≥0.8 秒强烈倾向拆分，≥1 秒通常拆分。
4. 很短的碎片（尤其 <0.8 秒）如果没有明显停顿，不要让它单独成为字幕块，应并入邻近语义单元。
5. 绝不能把姓名、单词、固定短语、phrasal verb、介词结构等从中间切开。例如 "German Rolf Buchholz" 必须保持完整。
6. 破折号/连字符不一定代表断句，口语中的停顿、犹豫、修正不能机械拆开。
7. 长句只有在自然语义边界上才拆分；字符数只作辅助判断，约 100–120 字符开始检查，超过 120–140 字符应认真判断是否需要拆分。
8. 英语快速语流存在连读、弱读、吞音时，不要把词从中间切开；把完整单词归入相邻块，边界落在单词边界。各字幕块时间轴应连续且不重叠（下一块 start ≥ 上一块 end）。
9. 识别教学阶段：讲解、示例、发音练习、跟读、倒数准备、正式朗读等，不要把不同教学动作随意合成一个巨大文本块。
10. 重复朗读/练习不是错误，不要去重。
11. 每个文本块的 start/end 应尽量贴合实际发音，避免把明显长静音包含进去，也不要过度截短弱音。
12. 全片复核，不要只修用户指出的一处。检查：孤立碎片、残句、姓名断裂、长停顿、时间整体偏移、字幕覆盖静音、连续语流边界、重复朗读的时间偏移。

最终判断标准：
每个文本块都应该是一个用户在英语学习视频中"自然可以一起读、一起理解"的单位，并且时间轴与视频中的实际说话基本同步。

输出要求：
- 直接输出完整的标准 SRT 字幕，不要输出任何解释、前言、后缀或 Markdown 代码块。
- 每个字幕块严格按「序号 / 时间轴 / 英文文本」排列，时间轴格式为 HH:MM:SS,mmm。
- 不要改动英文原文文字：合并时只用单个空格连接，不得重写、增删、改标点、改大小写。
- 如果全片复核没有发现实际问题，按原字幕原样输出即可。`

// 拼接「提示词 + 当前英文字幕(SRT)」的完整可复制文本。
const buildSegmentPromptPayload = (draftLines: DraftLine[]): string =>
  `${SEGMENT_EXPERT_PROMPT}\n\n以下是当前字幕（SRT 格式，仅英文）：\n\n${draftLinesToSrt(draftLines)}`

type DltjsonV2 = {
  version: '2.0'
  type: 'dltjson' | 'htjson'
  lines: Array<{
    id?: string
    start: number
    end: number
    text: string
    translation: string
    translations?: Partial<Record<ContentLocale, string>>
    answers?: string[]
    // 旧编辑器文件保存为逗号文本；开放 API 的 dltjson 使用结构化 keywords 数组。
    keywordsText?: string
    keywords?: string[]
  }>
}

// dltjson 格式说明：
// - version: "2.0"
// - 时间格式：统一使用秒（seconds），例如 2.56 秒表示 2.56
// - lines 数组：每个元素包含 start、end（秒）、text、translation 等字段

const importFromDltjson = (content: string): { lines: DltjsonV2['lines'] } => {
  const parsed = JSON.parse(content)
  // 新文件统一使用 dltjson；兼容历史 htjson，避免旧字幕文件无法继续使用。
  if (parsed.type !== 'dltjson' && parsed.type !== 'htjson') {
    throw new Error('无效的 dltjson 格式')
  }
  if (!parsed.lines || !Array.isArray(parsed.lines)) {
    throw new Error('dltjson 缺少 lines 字段')
  }
  return { lines: parsed.lines }
}

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  )
}

const getNextExerciseSortOrder = (
  exercises: CatalogExerciseSummary[],
  categoryId: number,
  excludeId?: number,
) =>
  exercises
    .filter(
      (exercise) =>
        exercise.categoryId === categoryId && exercise.id !== excludeId,
    )
    .reduce((maxOrder, exercise) => Math.max(maxOrder, exercise.sortOrder), 0) +
  10

export function AudioLessonImporter({
  adminToken,
  categoryGroups,
  categories,
  exercises,
  draft,
  onRefreshCatalog,
  onStatusChange,
  onDraftConsumed,
  onUnsavedChangesChange,
  onRegisterSaveBeforeLeave,
  adminRole,
}: AudioLessonImporterProps) {
  const canWriteClipboard =
    typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
  const navigate = useNavigate()
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [localMediaUrl, setLocalMediaUrl] = useState('')
  const [uploadedMediaUrl, setUploadedMediaUrl] = useState('')
  const [mediaSize, setMediaSize] = useState<number | null>(null)
  const [activeLineIndex, setActiveLineIndex] = useState(0)
  const [subtitleDraft, setSubtitleDraft] = useState('')
  const [subtitleAnalysis, setSubtitleAnalysis] =
    useState<SubtitleDraftAnalysis>(EMPTY_SUBTITLE_ANALYSIS)
  const [subtitleImportMode, setSubtitleImportMode] =
    useState<SubtitleImportMode>('single')
  const [subtitleTimeOffset, setSubtitleTimeOffset] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const [mediaUploadProgress, setMediaUploadProgress] =
    useState<FileUploadProgress | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  // AI 翻译失败的持久错误信息（渲染为 MediaWaveform 内的横幅，不自动消失，可手动关闭；
  // 每次开始新一轮翻译时清除）。成功/无内容的轻提示仍走 onStatusChange。
  const [translateError, setTranslateError] = useState<string | null>(null)
  const [loadedExercise, setLoadedExercise] = useState<ListeningExercise | null>(null)
  const [clipboardPanel, setClipboardPanel] = useState<ClipboardPanelState>({
    mode: 'hidden',
  })
  const [courseForm, setCourseForm] = useState<CreateExerciseRequest>({
    categoryId: categories[0]?.id ?? 0,
    title: '',
    source: '',
    sourceUrl: '',
    difficulty: 'intermediate',
    durationLabel: '',
    mediaType: 'audio',
    audioUrl: '',
    coverImageUrl: '',
    summary: '',
    sortOrder: getNextExerciseSortOrder(exercises, categories[0]?.id ?? 0),
    status: 'draft',
  })
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    createEmptyDraftLine(),
  ])
  const currentImporterSnapshot = useMemo(
    () => createImporterSnapshot(courseForm, draftLines, subtitleDraft),
    [courseForm, draftLines, subtitleDraft],
  )
  const [savedImporterSnapshot, setSavedImporterSnapshot] = useState('')
  const [isSubmittingSubtitleDraft, setIsSubmittingSubtitleDraft] = useState(false)
  const hasUnsavedChanges = Boolean(
    savedImporterSnapshot && currentImporterSnapshot !== savedImporterSnapshot,
  )
  const ownSubtitleDraft = adminRole === 'subtitle_contributor'
    ? loadedExercise?.subtitleDrafts?.[0]
    : undefined
  const isSubmittedSubtitleDraft = ownSubtitleDraft?.status === 'submitted'
  const isApprovedSubtitleDraft = ownSubtitleDraft?.status === 'approved'
  const { playMedia, playMediaRange, stopPlayback } = useMediaPlayback({
    mediaRef,
  })

  useEffect(() => {
    if (!savedImporterSnapshot) {
      setSavedImporterSnapshot(currentImporterSnapshot)
    }
  }, [currentImporterSnapshot, savedImporterSnapshot])

  useEffect(() => {
    onUnsavedChangesChange(hasUnsavedChanges)
  }, [hasUnsavedChanges, onUnsavedChangesChange])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) {
        return
      }

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (!localMediaUrl || !localMediaUrl.startsWith('blob:')) {
      return
    }

    return () => URL.revokeObjectURL(localMediaUrl)
  }, [localMediaUrl])

  useEffect(() => {
    const handleGlobalSpace = (event: KeyboardEvent) => {
      if (
        event.code !== 'Space' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTypingTarget(event.target)
      ) {
        return
      }

      const media = mediaRef.current
      if (!media || !courseForm.audioUrl) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (media.paused) {
        void playMedia()
        return
      }

      stopPlayback()
    }

    window.addEventListener('keydown', handleGlobalSpace, true)
    return () => window.removeEventListener('keydown', handleGlobalSpace, true)
  }, [courseForm.audioUrl, playMedia, stopPlayback])

  useEffect(() => {
    if (
      categories.length > 0 &&
      !categories.some((category) => category.id === courseForm.categoryId)
    ) {
      setCourseForm((current) => {
        const nextCourseForm = {
          ...current,
          categoryId: categories[0].id,
        }

        if (!hasUnsavedChanges) {
          setSavedImporterSnapshot(
            createImporterSnapshot(nextCourseForm, draftLines, subtitleDraft),
          )
        }

        return nextCourseForm
      })
    }
  }, [
    categories,
    courseForm.categoryId,
    draftLines,
    hasUnsavedChanges,
    subtitleDraft,
  ])

  useEffect(() => {
    if (!draft) {
      return
    }

    if (draft.mode === 'create') {
      const targetCategory = categories.find((category) => category.id === draft.categoryId)
      const nextDraftLines = [createEmptyDraftLine()]
      const nextCourseForm: CreateExerciseRequest = {
        categoryId: draft.categoryId,
        title: '',
        source: targetCategory?.name ?? '真实媒体导入',
        sourceUrl: '',
        difficulty: 'intermediate',
        durationLabel: '00:00',
        mediaType: 'audio',
        audioUrl: '',
        coverImageUrl: '',
        summary: '',
        sortOrder: getNextExerciseSortOrder(exercises, draft.categoryId),
        status: 'draft',
      }
      setMediaFile(null)
      setLocalMediaUrl('')
      setUploadedMediaUrl('')
      setMediaSize(null)
      setSubtitleDraft('')
      setSubtitleAnalysis(EMPTY_SUBTITLE_ANALYSIS)
      setSubtitleImportMode('single')
      setActiveLineIndex(0)
      setDraftLines(nextDraftLines)
      setCourseForm(nextCourseForm)
      setSavedImporterSnapshot(
        createImporterSnapshot(nextCourseForm, nextDraftLines, ''),
      )
    onStatusChange('已切换到制课工作台，请继续创建课程', 'info')
    onDraftConsumed()
    return
    }

    setLoadedExercise(null)
    void (async () => {
      try {
        const exercise = await apiClient.getAdminExercise(draft.exercise.id, adminToken)
        setLoadedExercise(exercise)
      } catch (error) {
        onStatusChange(error instanceof Error ? error.message : '课程加载失败', 'error')
        onDraftConsumed()
      }
    })()
  }, [adminToken, categories, draft, exercises, onDraftConsumed, onStatusChange])

  useEffect(() => {
    if (!draft || draft.mode !== 'edit' || !loadedExercise) {
      return
    }

    const { exercise } = { exercise: loadedExercise }
    // 贡献者重开课程时优先载入自己的工作稿（包括被退回的版本），
    // 而不是再次显示课程当前的正式字幕，避免保存后看似“丢稿”。
    const editableLines = adminRole === 'subtitle_contributor' && exercise.subtitleDrafts?.[0]
      ? exercise.subtitleDrafts[0].lines
      : exercise.lines
    const nextDraftLines =
      editableLines.length > 0
        ? editableLines.map((line, index) => ({
            id: line.id || `l${index + 1}`,
            start: Number(line.start),
            end: Number(line.end),
            text: line.text,
            translation: line.translation,
            translations: line.translations ?? (line.translation ? { 'zh-CN': line.translation } : {}),
            answers: line.answers ?? [],
            keywordsText: line.keywords.join(', '),
          }))
        : [createEmptyDraftLine()]
    const nextCourseForm: CreateExerciseRequest = {
      id: exercise.id,
      categoryId: exercise.categoryId,
      title: exercise.title,
      source: exercise.source,
      sourceUrl: exercise.sourceUrl ?? '',
      difficulty: exercise.difficulty,
      durationLabel: exercise.durationLabel,
      mediaType: exercise.mediaType,
      audioUrl: exercise.audioUrl,
      coverImageUrl: exercise.coverImageUrl ?? '',
      summary: exercise.summary,
      sortOrder: exercise.sortOrder,
      // 透传原状态，避免把 archived 课程改回 published
      status: exercise.status,
    }
    setMediaFile(null)
    setLocalMediaUrl(resolveApiUrl(exercise.audioUrl))
    setUploadedMediaUrl(exercise.audioUrl)
    // 课程详情接口会按媒体对象统计文件大小；编辑已有课程时保留该元数据，
    // 让工作台可以完整展示当前媒体，而不是退化成“媒体已加载”的笼统提示。
    setMediaSize(exercise.mediaSize ?? null)
    setSubtitleDraft('')
    setSubtitleAnalysis(EMPTY_SUBTITLE_ANALYSIS)
    setSubtitleImportMode('single')
    setActiveLineIndex(0)
    setDraftLines(nextDraftLines)
    setCourseForm(nextCourseForm)
    setSavedImporterSnapshot(
      createImporterSnapshot(nextCourseForm, nextDraftLines, ''),
    )
    const returnedNote = adminRole === 'subtitle_contributor' && exercise.subtitleDrafts?.[0]?.status === 'returned'
      ? `；审核意见：${exercise.subtitleDrafts[0].reviewNote ?? '请按意见修改后重新提交'}`
      : ''
    onStatusChange(`已载入课程：${exercise.title}${returnedNote}`, 'success')
    onDraftConsumed()
  }, [adminRole, draft, loadedExercise, onDraftConsumed, onStatusChange])

  const activeLine = draftLines[activeLineIndex] ?? draftLines[0]
  const validLineCount = useMemo(() => {
    try {
      return toTranscriptLines(draftLines).filter(
        (line) => line.text && line.end > line.start,
      ).length
    } catch {
      return 0
    }
  }, [draftLines])
  const categoriesByGroup = useMemo(
    () =>
      categoryGroups.map((group) => ({
        group,
        categories: categories.filter((category) => category.groupId === group.id),
      })),
    [categories, categoryGroups],
  )
  const saveDisabledReason = useMemo(() => {
    if (isSubmittedSubtitleDraft) {
      return '该字幕稿已提交审核，等待审核结果后才能继续修改或重新提交'
    }
    if (isApprovedSubtitleDraft) {
      return '该字幕稿已审核通过并发布，不能再次修改或提交'
    }
    if (isUploadingMedia) {
      return '媒体上传中，请稍候'
    }
    if (!mediaFile && !courseForm.audioUrl) {
      return '请先选择音频或视频文件'
    }
    if (!courseForm.categoryId) {
      return '请先创建并选择学习系列'
    }
    if (!courseForm.title.trim()) {
      return '请填写课程标题'
    }
    return ''
  }, [
    courseForm.audioUrl,
    courseForm.categoryId,
    courseForm.title,
    isUploadingMedia,
    isSubmittedSubtitleDraft,
    isApprovedSubtitleDraft,
    mediaFile,
  ])

  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setDraftLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    )
  }

  const addLineAfterActive = (range?: { start: number; end: number }) => {
    const currentTime = roundToMilliseconds(
      range?.start ?? mediaRef.current?.currentTime ?? activeLine?.end ?? 0,
    )
    const nextLine: DraftLine = {
      ...createEmptyDraftLine(draftLines.length),
      start: currentTime,
      end: roundToMilliseconds(range?.end ?? currentTime + 5),
    }

    setDraftLines((current) => {
      const next = [...current]
      if (range) {
        const insertIndex = next.findIndex((line) => line.start > nextLine.start)
        next.splice(insertIndex >= 0 ? insertIndex : next.length, 0, nextLine)
      } else {
        next.splice(activeLineIndex + 1, 0, nextLine)
      }

      const indexedLines = next.map((line, index) => ({
        ...line,
        id: `l${index + 1}`,
      }))
      const insertedIndex = indexedLines.findIndex(
        (line) => line.start === nextLine.start && line.end === nextLine.end,
      )
      setActiveLineIndex(insertedIndex >= 0 ? insertedIndex : activeLineIndex + 1)
      return indexedLines
    })
  }

  const removeLine = (index: number) => {
    setDraftLines((current) => {
      const next = current
        .filter((_, lineIndex) => lineIndex !== index)
        .map((line, lineIndex) => ({ ...line, id: `l${lineIndex + 1}` }))
      return next.length ? next : [createEmptyDraftLine()]
    })
    setActiveLineIndex((current) => Math.max(0, current - 1))
  }

  // 合并第 index 行与第 index+1 行：合并结果保留前一行 id（mergeDraftLines 内实现），
  // 之后与 removeLine 一样整体重排 id，保持 id 始终为 l1..ln（addLineAfterActive 依赖该约定生成新 id）。
  // activeLineIndex 指向合并后的行；若当前正编辑被合并的第二行，也会回落到合并后的行，不留悬空状态。
  const mergeLineWithNext = (index: number) => {
    setDraftLines((current) => {
      if (index < 0 || index + 1 >= current.length) {
        return current
      }
      const merged = mergeDraftLines(current[index], current[index + 1])
      const next = current
        .map((line, lineIndex) => (lineIndex === index ? merged : line))
        .filter((_, lineIndex) => lineIndex !== index + 1)
        .map((line, lineIndex) => ({ ...line, id: `l${lineIndex + 1}` }))
      return next
    })
    setActiveLineIndex(index)
  }

  const setPointFromPlayer = (field: 'start' | 'end', lineIndex = activeLineIndex) => {
    const currentTime = roundToMilliseconds(mediaRef.current?.currentTime ?? 0)
    updateLine(lineIndex, { [field]: currentTime })
  }

  const playLine = async (line: DraftLine) => {
    await playMediaRange({
      end: line.end,
      start: line.start,
    })
  }

  const persistDraftExercise = async (
    nextCourseForm: CreateExerciseRequest,
    options?: {
      mediaUrl?: string
      mediaType?: CreateExerciseRequest['mediaType']
      forceDraft?: boolean
    },
  ) => {
    const payload: CreateExerciseRequest = {
      ...nextCourseForm,
      sortOrder:
        nextCourseForm.sortOrder > 0
          ? nextCourseForm.sortOrder
          : getNextExerciseSortOrder(
              exercises,
              nextCourseForm.categoryId,
              nextCourseForm.id,
            ),
      mediaType: options?.mediaType ?? nextCourseForm.mediaType,
      audioUrl: options?.mediaUrl ?? nextCourseForm.audioUrl,
      title: nextCourseForm.title.trim() || '未命名课程',
      source: nextCourseForm.source.trim() || '真实媒体导入',
      summary: nextCourseForm.summary.trim(),
      status: options?.forceDraft ? 'draft' : nextCourseForm.status,
    }

    const result = await apiClient.createExercise(payload, adminToken)
    const savedId = result.id ?? payload.id
    // 函数式更新：上传/保存期间用户可能仍在编辑表单（标题、系列等），
    // 这里只回写服务端返回的 id 与本次绑定的媒体字段，保留其余字段的当前值，
    // 避免用旧快照整体覆盖掉用户期间的编辑。
    setCourseForm((current) => ({
      ...current,
      ...(savedId ? { id: savedId } : {}),
      mediaType: payload.mediaType,
      audioUrl: payload.audioUrl,
    }))
    if (savedId && savedId !== payload.id) {
      navigate(`/importer/${savedId}`, { replace: true })
    }
    await onRefreshCatalog()
  }

  const uploadMediaFile = useCallback(async (file: File) => {
    onStatusChange('正在上传媒体...', 'info')
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken)
    // 先用文件大小建立 0% 状态，即使浏览器尚未触发第一条进度事件，界面也能立即反馈。
    setMediaUploadProgress({ loaded: 0, total: file.size || null, percent: 0 })
    const result = await apiClient.uploadMedia(file, adminToken, setMediaUploadProgress)
    // 请求完成即代表服务端已确认媒体；后续只是在把媒体地址绑定到课程，不再显示上传进度。
    setMediaUploadProgress(null)
    setUploadedMediaUrl(result.publicUrl)
    setMediaSize(result.size)
    setCourseForm((current) => ({
      ...current,
      mediaType: result.mediaType,
      audioUrl: result.publicUrl,
    }))
    onStatusChange(`媒体已上传：${result.objectName}`, 'success')
    return result
  }, [adminToken, onStatusChange])

  const handleFileChange = async (file: File | null) => {
    // 选择文件时预检大小：超过后端 120MB 上限直接拒绝，避免上传到最后才失败
    if (file && file.size > MAX_MEDIA_FILE_SIZE) {
      onStatusChange('文件超过 120MB 上传上限，请压缩或拆分后再试', 'error')
      return
    }

    setMediaFile(file)
    setUploadedMediaUrl('')
    if (!file) {
      setLocalMediaUrl('')
      setMediaSize(null)
      setCourseForm((current) => ({
        ...current,
        audioUrl: '',
      }))
      return
    }

    const mediaType = file.type.startsWith('video/') ? 'video' : 'audio'
    setLocalMediaUrl(URL.createObjectURL(file))
    setMediaSize(file.size)

    // 用户文件名只用于浏览器选择文件，不写入课程标题；新课程标题保持当前值，
    // 为空时后台草稿使用“未命名课程”占位，用户后续自行填写真实课程名。
    const isEditing = Boolean(courseForm.id)
    const nextCourseForm: CreateExerciseRequest = {
      ...courseForm,
      mediaType,
      audioUrl: '',
      ...(isEditing
        ? {}
        : {
            sortOrder: getNextExerciseSortOrder(
              exercises,
              courseForm.categoryId,
              courseForm.id,
            ),
          }),
    }
    setCourseForm(nextCourseForm)

    setIsUploadingMedia(true)
    try {
      const uploaded = await uploadMediaFile(file)
      if (courseForm.id) {
        await apiClient.updateExerciseMedia(
          courseForm.id,
          { mediaType: uploaded.mediaType, audioUrl: uploaded.publicUrl },
          adminToken,
        )
        await onRefreshCatalog()
        onStatusChange('媒体已替换，课程信息、发布状态和字幕保持不变', 'success')
      } else {
        await persistDraftExercise(nextCourseForm, {
          mediaUrl: uploaded.publicUrl,
          mediaType: uploaded.mediaType,
          forceDraft: true,
        })
        onStatusChange('媒体已绑定到草稿课程，刷新后不会丢失', 'success')
      }
    } catch (error) {
      onStatusChange(error instanceof Error ? error.message : '媒体上传失败', 'error')
    } finally {
      setIsUploadingMedia(false)
      setMediaUploadProgress(null)
    }
  }

  const importSubtitleDraft = () => {
    const parsed = parseSubtitleDraft(subtitleDraft, subtitleImportMode)
    const offsetSeconds = subtitleTimeOffset / 1000
    const adjusted = offsetSeconds !== 0
      ? parsed.map((line) => ({
          ...line,
          start: Math.max(0, line.start + offsetSeconds),
          end: Math.max(0, line.end + offsetSeconds),
        }))
      : parsed
    setDraftLines(adjusted)
    setActiveLineIndex(0)
    onStatusChange(`已导入 ${parsed.length} 句字幕草稿`, 'success')
  }

  const handleTranslateLines = async (mode: 'empty' | 'all') => {
    setTranslateError(null)
    setIsTranslating(true)
    try {
      // 按目标语言串行执行（每种语言内部仍按批处理），避免对翻译服务造成并发压力。
      // 每种语言只写回自己的 translations[locale] 键，因此跨语言共用调用开始时的 draftLines 快照是安全的。
      const failedByLocale: { label: string; lineNumbers: number[] }[] = []
      let translatedSegmentCount = 0

      for (const targetLocale of TRANSLATION_TARGET_LOCALES) {
        const candidates = draftLines
          .map((line, index) => ({ index, line }))
          .filter(({ line }) => line.text.trim())
          .filter(({ line }) => mode === 'all' || !(line.translations[targetLocale] ?? '').trim())

        if (candidates.length === 0) {
          continue
        }

        translatedSegmentCount += candidates.length
        const failedLineNumbers: number[] = []
        for (let start = 0; start < candidates.length; start += TRANSLATE_REQUEST_BATCH_SIZE) {
          const batch = candidates.slice(start, start + TRANSLATE_REQUEST_BATCH_SIZE)
          try {
            const result = await apiClient.translateLines(
              batch.map(({ line }) => line.text),
              adminToken,
              'en-US',
              targetLocale,
            )
            setDraftLines((current) => {
              const next = [...current]
              batch.forEach(({ index }, batchIndex) => {
                if (!result.failedIndexes.includes(batchIndex)) {
                  next[index] = {
                    ...next[index],
                    translations: {
                      ...next[index].translations,
                      [targetLocale]: result.translations[batchIndex] ?? '',
                    },
                  }
                }
              })
              return next
            })
            result.failedIndexes.forEach((failedIndex) => {
              failedLineNumbers.push(batch[failedIndex].index + 1)
            })
          } catch {
            // 单批网络或网关失败不阻断后续字幕，最后统一提示人工处理的行号。
            batch.forEach(({ index }) => failedLineNumbers.push(index + 1))
          }
        }

        if (failedLineNumbers.length > 0) {
          failedByLocale.push({
            label: TRANSLATION_LOCALE_LABELS[targetLocale],
            lineNumbers: failedLineNumbers,
          })
        }
      }

      if (translatedSegmentCount === 0) {
        onStatusChange(
          mode === 'all' ? '没有可翻译的字幕' : '所有语言的译文均已填写，无需补齐',
          'info',
        )
      } else if (failedByLocale.length > 0) {
        const failureSummary = failedByLocale
          .map(({ label, lineNumbers }) => `${label}：第 ${lineNumbers.join(', ')} 行`)
          .join('；')
        setTranslateError(`批量翻译未全部成功，${failureSummary} 失败，请人工检查这些行后重试。`)
      } else {
        onStatusChange(`成功为 ${translatedSegmentCount} 句次字幕生成译文（中文/ไทย/日本語）`, 'success')
      }
    } catch (error) {
      setTranslateError(error instanceof Error ? error.message : 'AI 翻译失败，请稍后重试')
    } finally {
      setIsTranslating(false)
    }
  }

  // 单句 AI 翻译：为该句一次性生成全部目标语言译文，返回 { locale: 译文 } 供调用方整体合并。
  // 各语言顺序请求，任一语言失败时跳过该语言（对应译文保持原值），其余语言照常返回。
  const handleTranslateSingleLine = async (
    text: string,
  ): Promise<Partial<Record<ContentLocale, string>>> => {
    setTranslateError(null)
    const translations: Partial<Record<ContentLocale, string>> = {}
    const failedLabels: string[] = []
    for (const targetLocale of TRANSLATION_TARGET_LOCALES) {
      try {
        // 单句翻译任务很快（通常几秒内完成），用 2 秒轮询避免界面长时间无反馈。
        const result = await apiClient.translateLines([text], adminToken, 'en-US', targetLocale, 2_000)
        if (!result.failedIndexes.includes(0) && result.translations[0]) {
          translations[targetLocale] = result.translations[0]
        } else {
          failedLabels.push(TRANSLATION_LOCALE_LABELS[targetLocale])
        }
      } catch {
        failedLabels.push(TRANSLATION_LOCALE_LABELS[targetLocale])
      }
    }
    if (failedLabels.length > 0) {
      setTranslateError(`单句翻译部分语言失败（${failedLabels.join('、')}），对应译文未更新，请人工检查。`)
    }
    return translations
  }

  const importSubtitleFile = async (file: File) => {
    try {
      const text = await file.text()
      const analysis = analyzeSubtitleDraft(text)
      setSubtitleDraft(text)
      setSubtitleAnalysis(analysis)
      setSubtitleImportMode(analysis.suggestedMode)
      if (analysis.isLikelyBilingual) {
        onStatusChange('检测到双语字幕，请先确认中文行位置，再点击导入', 'info')
        return
      }

      const parsed = parseSubtitleDraft(text, 'single')
      setDraftLines(parsed)
      setActiveLineIndex(0)
      onStatusChange(`已从文件导入 ${parsed.length} 句字幕`, 'success')
    } catch (error) {
      onStatusChange(
        error instanceof Error ? error.message : '字幕文件读取失败',
        'error',
      )
    }
  }

  const handleSubtitleDraftChange = (value: string) => {
    setSubtitleDraft(value)
    try {
      const analysis = analyzeSubtitleDraft(value)
      setSubtitleAnalysis(analysis)
      setSubtitleImportMode((current) =>
        current === 'single'
          ? analysis.suggestedMode
          : analysis.isLikelyBilingual
            ? current
            : 'single',
      )
    } catch {
      setSubtitleAnalysis(EMPTY_SUBTITLE_ANALYSIS)
      setSubtitleImportMode('single')
    }
  }

  const handleDltjsonExport = () => {
    const dltjson = exportToDltjson(draftLines)
    const blob = new Blob([dltjson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${courseForm.title.trim() || 'untitled'}.dltjson`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    onStatusChange('字幕已导出为 dltjson 文件', 'success')
  }

  const applyImportedDltjson = (content: string) => {
    const imported = importFromDltjson(content)
    const nextDraftLines = imported.lines.map((line, index) => ({
      ...createEmptyDraftLine(index),
      ...(line.id ? { id: line.id } : {}),
      start: line.start,
      end: line.end,
      text: line.text,
      translation: line.translation,
      translations: line.translations ?? (line.translation ? { 'zh-CN': line.translation } : {}),
      answers: line.answers ?? [],
      keywordsText: line.keywordsText ?? (line.keywords ?? []).join(', '),
    }))

    setDraftLines(nextDraftLines)
    setActiveLineIndex(0)
    return imported.lines.length
  }

  const handleDltjsonImport = async (file: File) => {
    try {
      const content = await file.text()
      const lineCount = applyImportedDltjson(content)
      onStatusChange(`已从文件导入 ${lineCount} 句字幕`, 'success')
    } catch (error) {
      onStatusChange(error instanceof Error ? error.message : 'dltjson 导入失败', 'error')
    }
  }

  const handleDltjsonCopyToClipboard = async () => {
    if (!canWriteClipboard) {
      setClipboardPanel({
        mode: 'copy',
        content: exportToDltjson(draftLines),
      })
      onStatusChange('当前环境不支持直接写入剪切板，请在面板中手动复制', 'info')
      return
    }

    try {
      await navigator.clipboard.writeText(exportToDltjson(draftLines))
      onStatusChange('dltjson 已复制到剪切板', 'success')
    } catch (error) {
      onStatusChange(error instanceof Error ? error.message : '复制 dltjson 失败', 'error')
    }
  }

  // 一键复制「专家分段提示词 + 当前英文字幕(SRT)」到剪切板，
  // 供粘贴到 ChatGPT 等外部模型做语义分段优化。不支持直接写入剪切板时，
  // 复用剪贴板面板（带自定义标题）让用户手动复制。
  const handleCopySegmentPrompt = async () => {
    const hasEnglishText = draftLines.some((line) => line.text.trim())
    if (!hasEnglishText) {
      onStatusChange('当前没有可复制的英文字幕', 'error')
      return
    }

    const payload = buildSegmentPromptPayload(draftLines)
    if (!canWriteClipboard) {
      setClipboardPanel({
        mode: 'copy',
        label: '复制分段提示词',
        content: payload,
      })
      onStatusChange('当前环境不支持直接写入剪切板，请在面板中手动复制', 'info')
      return
    }

    try {
      await navigator.clipboard.writeText(payload)
      onStatusChange('分段提示词 + 英文字幕已复制到剪切板，可粘贴到 ChatGPT 等模型', 'success')
    } catch (error) {
      onStatusChange(error instanceof Error ? error.message : '复制分段提示词失败', 'error')
    }
  }

  const handleDltjsonPasteFromClipboard = () => {
    setClipboardPanel({
      mode: 'paste',
      content: '',
    })
    onStatusChange('请把 dltjson 粘贴到输入框后再导入', 'info')
  }

  const handleManualDltjsonImport = () => {
    if (clipboardPanel.mode !== 'paste') {
      return
    }

    try {
      const content = clipboardPanel.content.trim()
      if (!content) {
        throw new Error('请先粘贴 dltjson 内容')
      }
      const lineCount = applyImportedDltjson(content)
      setClipboardPanel({ mode: 'hidden' })
      onStatusChange(`已从粘贴面板导入 ${lineCount} 句字幕`, 'success')
    } catch (error) {
      onStatusChange(error instanceof Error ? error.message : '粘贴面板导入 dltjson 失败', 'error')
    }
  }

  const saveImportedLesson = useCallback(async () => {
    setIsSaving(true)
    try {
      if (saveDisabledReason) {
        throw new Error(saveDisabledReason)
      }

      const transcript = toTranscriptLines(draftLines)
      const hasTranscriptContent = transcript.some((line) => line.text.trim())
      if (hasTranscriptContent) {
        const invalid = transcript.find((line) => !line.text || line.end <= line.start)
        if (invalid) {
          throw new Error(`请检查 ${invalid.id} 的文本或时间范围`)
        }
      }

      // 字幕贡献者只有被分配课程的字幕写入权。跳过课程元数据和媒体保存，
      // 避免其本地表单中的标题、媒体或状态意外覆盖超级管理员维护的课程信息。
      if (adminRole === 'subtitle_contributor') {
        if (!courseForm.id) {
          throw new Error('字幕贡献者只能编辑超级管理员已创建并分配的课程')
        }
        if (!hasTranscriptContent) {
          throw new Error('请至少保留一条有效字幕后再保存校对草稿')
        }
        await apiClient.replaceTranscript(courseForm.id, transcript, adminToken)
        setSavedImporterSnapshot(
          createImporterSnapshot(courseForm, draftLines, subtitleDraft),
        )
        onStatusChange(`已保存校对草稿：${courseForm.title}`, 'success')
        return true
      }

      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken)
      onStatusChange(
        hasTranscriptContent ? '正在保存课程和字幕...' : '正在保存课程...',
        'info',
      )
      const uploaded = uploadedMediaUrl
        ? { publicUrl: uploadedMediaUrl, mediaType: courseForm.mediaType }
        : mediaFile
          ? await uploadMediaFile(mediaFile)
          : { publicUrl: courseForm.audioUrl, mediaType: courseForm.mediaType }
      const nextCourseForm: CreateExerciseRequest = {
        ...courseForm,
        mediaType: uploaded.mediaType,
        audioUrl: uploaded.publicUrl,
        sortOrder:
          courseForm.sortOrder > 0
            ? courseForm.sortOrder
            : getNextExerciseSortOrder(exercises, courseForm.categoryId, courseForm.id),
      }

      onStatusChange('媒体已就绪，正在写入课程...', 'info')
      const saveResult = await apiClient.createExercise(nextCourseForm, adminToken)
      const savedExerciseId = saveResult.id ?? nextCourseForm.id
      if (!savedExerciseId) {
        throw new Error('课程保存后没有返回有效 ID')
      }
      const persistedCourseForm = { ...nextCourseForm, id: savedExerciseId }
      setCourseForm(persistedCourseForm)
      if (savedExerciseId !== courseForm.id) {
        navigate(`/importer/${savedExerciseId}`, { replace: true })
      }
      if (hasTranscriptContent) {
        onStatusChange('课程已保存，正在写入字幕...', 'info')
        await apiClient.replaceTranscript(savedExerciseId, transcript, adminToken)
      }
      await onRefreshCatalog()
      setSavedImporterSnapshot(
        createImporterSnapshot(persistedCourseForm, draftLines, subtitleDraft),
      )
      onStatusChange(
        courseForm.status === 'published'
          ? `已发布课程：${courseForm.title}`
          : `已保存草稿：${courseForm.title}`,
        'success',
      )
      return true
    } catch (error) {
      onStatusChange(error instanceof Error ? error.message : '制课保存失败', 'error')
      return false
    } finally {
      setIsSaving(false)
      setMediaUploadProgress(null)
    }
  }, [
    adminToken,
    adminRole,
    courseForm,
    draftLines,
    exercises,
    mediaFile,
    navigate,
    onRefreshCatalog,
    onStatusChange,
    saveDisabledReason,
    subtitleDraft,
    uploadMediaFile,
    uploadedMediaUrl,
  ])

  const submitSubtitleDraftForReview = useCallback(async () => {
    if (adminRole !== 'subtitle_contributor') return
    setIsSubmittingSubtitleDraft(true)
    try {
      if (!courseForm.id) {
        throw new Error('字幕贡献者只能提交已分配的课程')
      }
      if (saveDisabledReason) {
        throw new Error(saveDisabledReason)
      }
      const transcript = toTranscriptLines(draftLines)
      const invalid = transcript.find((line) => !line.text || line.end <= line.start)
      if (invalid || transcript.length === 0) {
        throw new Error('请至少保留一条时间范围和文本都有效的字幕后再提交')
      }
      // 提交时携带当前编辑内容，避免用户忘记先保存而丢失最后一次微调。
      await apiClient.submitSubtitleDraft(courseForm.id, transcript, adminToken)
      // 重新读取后端状态：首次提交时此前可能不存在草稿，本地不能凭空构造草稿 ID。
      setLoadedExercise(await apiClient.getAdminExercise(courseForm.id, adminToken))
      setSavedImporterSnapshot(
        createImporterSnapshot(courseForm, draftLines, subtitleDraft),
      )
      onStatusChange(`已提交二次审核：${courseForm.title}`, 'success')
      await onRefreshCatalog()
    } catch (error) {
      onStatusChange(error instanceof Error ? error.message : '字幕稿提交失败', 'error')
    } finally {
      setIsSubmittingSubtitleDraft(false)
    }
  }, [adminRole, adminToken, courseForm, draftLines, onRefreshCatalog, onStatusChange, saveDisabledReason, subtitleDraft])

  useEffect(() => {
    onRegisterSaveBeforeLeave(saveImportedLesson)
    return () => onRegisterSaveBeforeLeave(null)
  }, [onRegisterSaveBeforeLeave, saveImportedLesson])

  return (
    <section className="admin-section import-workbench">
      <div
        className="import-layout"
      >
        <MediaCourseForm
          adminToken={adminToken}
          categoriesByGroup={categoriesByGroup}
          courseForm={courseForm}
          isSaving={isSaving || isSubmittingSubtitleDraft}
          isSubtitleContributor={adminRole === 'subtitle_contributor'}
          saveDisabledReason={saveDisabledReason}
          localMediaUrl={localMediaUrl}
          mediaSize={mediaSize}
          mediaFile={mediaFile}
          mediaUploadProgress={mediaUploadProgress}
          mediaRef={mediaRef}
          previewLines={draftLines}
          onNotify={onStatusChange}
          statusBar={
            <div className="admin-footer media-workbench-status">
              <span>{validLineCount} 句可保存</span>
              <span>
                {isUploadingMedia
                  ? mediaUploadProgress
                    ? mediaUploadProgress.percent === 100
                      ? '文件已发送，正在等待服务器确认'
                      : `媒体上传中${mediaUploadProgress.percent === null ? '' : ` ${mediaUploadProgress.percent}%`}`
                    : '正在将媒体绑定到课程'
                  : courseForm.audioUrl
                    ? '媒体已就绪'
                    : '媒体未上传'}
              </span>
              <span>
                {isSubmittedSubtitleDraft
                  ? '已提交审核，当前不可继续修改或重复提交'
                  : isApprovedSubtitleDraft
                    ? '已审核通过并发布，本次校对工作已完成'
                  : ownSubtitleDraft?.status === 'returned'
                    ? '审核已退回，请按意见修改后重新提交'
                    : courseForm.status === 'published'
                      ? '已完成二次审核，学习端公开可见'
                      : courseForm.status === 'proofread'
                        ? '已校对，志愿者可预览'
                        : '草稿，志愿者可预览'}
              </span>
            </div>
          }
          subtitleEditor={
            <SubtitleEditorInspector
              activeLineIndex={activeLineIndex}
              draftLines={draftLines}
              onTranslateSingle={handleTranslateSingleLine}
              onUpdateLine={updateLine}
            />
          }
          subtitleImporter={
            <SubtitleImporter
              analysis={subtitleAnalysis}
              importMode={subtitleImportMode}
              subtitleDraft={subtitleDraft}
              timeOffset={subtitleTimeOffset}
              onImportSubtitleFile={(file) => {
                void importSubtitleFile(file)
              }}
              onImportModeChange={setSubtitleImportMode}
              onImportSubtitle={importSubtitleDraft}
              onSubtitleDraftChange={handleSubtitleDraftChange}
              onTimeOffsetChange={setSubtitleTimeOffset}
              onCopySegmentPrompt={() => void handleCopySegmentPrompt()}
              copySegmentPromptDisabled={!draftLines.some((line) => line.text.trim())}
              onDltjsonCopy={handleDltjsonCopyToClipboard}
              onDltjsonExport={handleDltjsonExport}
              onDltjsonImport={(file) => {
                void handleDltjsonImport(file)
              }}
              onDltjsonPaste={handleDltjsonPasteFromClipboard}
              isModal
            />
          }
          waveform={
            <MediaWaveformErrorBoundary>
              <MediaWaveform
                activeLineIndex={activeLineIndex}
                draftLines={draftLines}
                mediaRef={mediaRef}
                sourceUrl={localMediaUrl}
                showInspector={false}
                onActiveLineChange={setActiveLineIndex}
                onAddLine={addLineAfterActive}
                isTranslating={isTranslating}
                onBatchAdjustTiming={(deltaMs) => {
                  const deltaSeconds = deltaMs / 1000
                  setDraftLines((lines) =>
                    lines.map((line) => ({
                      ...line,
                      start: Math.max(0, line.start + deltaSeconds),
                      end: Math.max(0, line.end + deltaSeconds),
                    })),
                  )
                }}
                onPlayLine={playLine}
                onRemoveLine={removeLine}
                onMergeLine={mergeLineWithNext}
                onSetPointFromPlayer={setPointFromPlayer}
                onTranslate={handleTranslateLines}
                onTranslateSingle={handleTranslateSingleLine}
                translateError={translateError}
                onDismissTranslateError={() => setTranslateError(null)}
                onUpdateLine={updateLine}
              />
            </MediaWaveformErrorBoundary>
          }
          onCourseFormChange={setCourseForm}
          clipboardPanel={clipboardPanel}
          onClipboardPanelChange={setClipboardPanel}
          onManualDltjsonImport={handleManualDltjsonImport}
          onFileChange={(file) => {
            void handleFileChange(file)
          }}
          onSaveLesson={() => void saveImportedLesson()}
          // 已提交或已通过的版本不再显示提交入口；只有审核退回后的工作稿可以重新提交。
          onSubmitSubtitleDraft={isSubmittedSubtitleDraft || isApprovedSubtitleDraft
            ? undefined
            : () => void submitSubtitleDraftForReview()}
        />
      </div>
    </section>
  )
}
