import { Scissors } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  CatalogExerciseSummary,
  CreateExerciseRequest,
  ExerciseCategory,
  ListeningExercise,
  MaterialCategory,
  ContentLocale,
} from '@duolinting/shared'
import type { AdminNoticeTone } from './admin/AdminFeedback'
import { MediaCourseForm } from './admin/MediaCourseForm'
import { MediaWaveform } from './admin/MediaWaveform'
import { SubtitleImporter } from './admin/SubtitleImporter'
import { apiClient, resolveApiUrl } from '../lib/apiClient'
import { ADMIN_TOKEN_STORAGE_KEY } from '../lib/contentTools'
import { useMediaPlayback } from '../hooks/useMediaPlayback'
import {
  analyzeSubtitleDraft,
  createEmptyDraftLine,
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
}

type ClipboardPanelState =
  | { mode: 'hidden' }
  | { mode: 'copy'; content: string }
  | { mode: 'paste'; content: string }

const roundToMilliseconds = (seconds: number) =>
  Math.round(seconds * 1000) / 1000

// 后端媒体上传上限 120MB，前端选择文件时预检，超限直接拒绝
const MAX_MEDIA_FILE_SIZE = 120 * 1024 * 1024
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

const exportToHtjson = (
  draftLines: DraftLine[],
): string => {
  // htjson 只承载字幕编辑所需的稳定字段，便于文件和剪切板共用同一份格式。
  const htjson = {
    version: '2.0',
    type: 'htjson',
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
  return JSON.stringify(htjson, null, 2)
}

type HtjsonV2 = {
  version: '2.0'
  type: 'htjson'
  lines: Array<{
    start: number
    end: number
    text: string
    translation: string
    translations?: Partial<Record<ContentLocale, string>>
    answers: string[]
    keywordsText: string
  }>
}

// htjson 格式说明：
// - version: "2.0"
// - 时间格式：统一使用秒（seconds），例如 2.56 秒表示 2.56
// - lines 数组：每个元素包含 start、end（秒）、text、translation 等字段

const importFromHtjson = (content: string): { lines: HtjsonV2['lines'] } => {
  const parsed = JSON.parse(content)
  if (parsed.type !== 'htjson') {
    throw new Error('无效的 htjson 格式')
  }
  if (!parsed.lines || !Array.isArray(parsed.lines)) {
    throw new Error('htjson 缺少 lines 字段')
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
}: AudioLessonImporterProps) {
  const canWriteClipboard =
    typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
  const emptySubtitleAnalysis: SubtitleDraftAnalysis = {
    blockCount: 0,
    bilingualBlockCount: 0,
    isLikelyBilingual: false,
    suggestedMode: 'single',
  }
  const navigate = useNavigate()
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [localMediaUrl, setLocalMediaUrl] = useState('')
  const [uploadedMediaUrl, setUploadedMediaUrl] = useState('')
  const [mediaSize, setMediaSize] = useState<number | null>(null)
  const [activeLineIndex, setActiveLineIndex] = useState(0)
  const [subtitleDraft, setSubtitleDraft] = useState('')
  const [subtitleAnalysis, setSubtitleAnalysis] =
    useState<SubtitleDraftAnalysis>(emptySubtitleAnalysis)
  const [subtitleImportMode, setSubtitleImportMode] =
    useState<SubtitleImportMode>('single')
  const [subtitleTimeOffset, setSubtitleTimeOffset] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
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
  // 左侧基础信息栏折叠状态：折叠后侧栏收成窄图标轨，主编辑区占满横向空间。
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const currentImporterSnapshot = useMemo(
    () => createImporterSnapshot(courseForm, draftLines, subtitleDraft),
    [courseForm, draftLines, subtitleDraft],
  )
  const [savedImporterSnapshot, setSavedImporterSnapshot] = useState('')
  const hasUnsavedChanges = Boolean(
    savedImporterSnapshot && currentImporterSnapshot !== savedImporterSnapshot,
  )
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
      setSubtitleAnalysis(emptySubtitleAnalysis)
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
    const nextDraftLines =
      exercise.lines.length > 0
        ? exercise.lines.map((line, index) => ({
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
    // 课程详情接口不返回媒体大小，载入已有课程时重置为空
    setMediaSize(null)
    setSubtitleDraft('')
    setSubtitleAnalysis(emptySubtitleAnalysis)
    setSubtitleImportMode('single')
    setActiveLineIndex(0)
    setDraftLines(nextDraftLines)
    setCourseForm(nextCourseForm)
    setSavedImporterSnapshot(
      createImporterSnapshot(nextCourseForm, nextDraftLines, ''),
    )
    onStatusChange(`已载入课程：${exercise.title}`, 'success')
    onDraftConsumed()
  }, [draft, loadedExercise, onDraftConsumed, onStatusChange])

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

  const uploadMediaFile = async (file: File) => {
    onStatusChange('正在上传媒体...', 'info')
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken)
    const result = await apiClient.uploadMedia(file, adminToken)
    setUploadedMediaUrl(result.publicUrl)
    setMediaSize(result.size)
    setCourseForm((current) => ({
      ...current,
      mediaType: result.mediaType,
      audioUrl: result.publicUrl,
    }))
    onStatusChange(`媒体已上传：${result.objectName}`, 'success')
    return result
  }

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
      setSubtitleAnalysis(emptySubtitleAnalysis)
      setSubtitleImportMode('single')
    }
  }

  const handleHtjsonExport = () => {
    const htjson = exportToHtjson(draftLines)
    const blob = new Blob([htjson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${courseForm.title.trim() || 'untitled'}.htjson`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    onStatusChange('字幕已导出为 htjson 文件', 'success')
  }

  const applyImportedHtjson = (content: string) => {
    const imported = importFromHtjson(content)
    const nextDraftLines = imported.lines.map((line, index) => ({
      ...createEmptyDraftLine(index),
      start: line.start,
      end: line.end,
      text: line.text,
      translation: line.translation,
      translations: line.translations ?? (line.translation ? { 'zh-CN': line.translation } : {}),
      answers: line.answers,
      keywordsText: line.keywordsText,
    }))

    setDraftLines(nextDraftLines)
    setActiveLineIndex(0)
    return imported.lines.length
  }

  const handleHtjsonImport = async (file: File) => {
    try {
      const content = await file.text()
      const lineCount = applyImportedHtjson(content)
      onStatusChange(`已从文件导入 ${lineCount} 句字幕`, 'success')
    } catch (error) {
      onStatusChange(error instanceof Error ? error.message : 'htjson 导入失败', 'error')
    }
  }

  const handleHtjsonCopyToClipboard = async () => {
    if (!canWriteClipboard) {
      setClipboardPanel({
        mode: 'copy',
        content: exportToHtjson(draftLines),
      })
      onStatusChange('当前环境不支持直接写入剪切板，请在面板中手动复制', 'info')
      return
    }

    try {
      await navigator.clipboard.writeText(exportToHtjson(draftLines))
      onStatusChange('htjson 已复制到剪切板', 'success')
    } catch (error) {
      onStatusChange(error instanceof Error ? error.message : '复制 htjson 失败', 'error')
    }
  }

  const handleHtjsonPasteFromClipboard = () => {
    setClipboardPanel({
      mode: 'paste',
      content: '',
    })
    onStatusChange('请把 htjson 粘贴到输入框后再导入', 'info')
  }

  const handleManualHtjsonImport = () => {
    if (clipboardPanel.mode !== 'paste') {
      return
    }

    try {
      const content = clipboardPanel.content.trim()
      if (!content) {
        throw new Error('请先粘贴 htjson 内容')
      }
      const lineCount = applyImportedHtjson(content)
      setClipboardPanel({ mode: 'hidden' })
      onStatusChange(`已从粘贴面板导入 ${lineCount} 句字幕`, 'success')
    } catch (error) {
      onStatusChange(error instanceof Error ? error.message : '粘贴面板导入 htjson 失败', 'error')
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
    }
  }, [
    adminToken,
    courseForm,
    draftLines,
    exercises,
    loadedExercise,
    mediaFile,
    onRefreshCatalog,
    onStatusChange,
    saveDisabledReason,
    subtitleDraft,
    uploadedMediaUrl,
  ])

  useEffect(() => {
    onRegisterSaveBeforeLeave(saveImportedLesson)
    return () => onRegisterSaveBeforeLeave(null)
  }, [onRegisterSaveBeforeLeave, saveImportedLesson])

  return (
    <section className="admin-section import-workbench">
      <div className="panel-title">
        <Scissors size={17} aria-hidden="true" />
        <span>真实媒体制课工作台</span>
      </div>

      <div
        className={
          isSidebarCollapsed ? 'import-layout sidebar-collapsed' : 'import-layout'
        }
      >
        <MediaCourseForm
          adminToken={adminToken}
          categoriesByGroup={categoriesByGroup}
          courseForm={courseForm}
          isSaving={isSaving}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed((current) => !current)}
          saveDisabledReason={saveDisabledReason}
          localMediaUrl={localMediaUrl}
          mediaSize={mediaSize}
          mediaFile={mediaFile}
          mediaRef={mediaRef}
          onNotify={onStatusChange}
          statusBar={
            <div className="admin-footer media-workbench-status">
              <span>{validLineCount} 句可保存</span>
              <span>
                {isUploadingMedia
                  ? '媒体上传中'
                  : courseForm.audioUrl
                    ? '媒体已就绪'
                    : '媒体未上传'}
              </span>
              <span>{courseForm.status === 'published' ? '发布后学习端可见' : '草稿仅后台保存'}</span>
            </div>
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
            />
          }
          waveform={
            <MediaWaveform
              activeLineIndex={activeLineIndex}
              draftLines={draftLines}
              mediaRef={mediaRef}
              sourceUrl={localMediaUrl}
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
          }
          onCourseFormChange={setCourseForm}
          clipboardPanel={clipboardPanel}
          onClipboardPanelChange={setClipboardPanel}
          onHtjsonCopy={handleHtjsonCopyToClipboard}
          onHtjsonExport={handleHtjsonExport}
          onHtjsonImport={(file) => {
            void handleHtjsonImport(file)
          }}
          onHtjsonPaste={handleHtjsonPasteFromClipboard}
          onManualHtjsonImport={handleManualHtjsonImport}
          onFileChange={(file) => {
            void handleFileChange(file)
          }}
          onSaveLesson={() => void saveImportedLesson()}
        />
      </div>
    </section>
  )
}
