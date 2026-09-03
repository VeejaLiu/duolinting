import { Layers, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type {
  CreateExerciseRequest,
  CreateTranscriptLineRequest,
  ExerciseCategory,
  MaterialCategory,
} from '@duolinting/shared'
import type { AdminNoticeTone } from './AdminFeedback'
import { apiClient, type FileUploadProgress } from '../../lib/apiClient'
import {
  createAdminOperationId,
  getAdminErrorDetails,
  logAdminError,
  logAdminInfo,
  logAdminWarn,
} from '../../lib/adminLogger'
import {
  analyzeSubtitleDraft,
  formatDurationLabel,
  parseSubtitleDraft,
  toTranscriptLines,
} from '../../lib/mediaDraftTools'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type BatchCourseImporterProps = {
  adminToken: string
  categoryGroups: MaterialCategory[]
  categories: ExerciseCategory[]
  // 打开弹窗时默认选中的学习系列（沿用课程管理页当前筛选的系列）。
  initialCategoryId?: number
  isSaving: boolean
  onRefreshCatalog: () => Promise<void>
  onNotify: (message: string, tone?: AdminNoticeTone) => void
}

// 后端媒体上传上限 120MB；选择文件时预检，超限直接拒绝，避免上传到最后才失败。
const MAX_MEDIA_FILE_SIZE = 120 * 1024 * 1024
// 媒体元数据读取不是网络请求，某些浏览器/文件组合可能既不触发成功也不触发失败事件。
// 批量任务是串行执行的，因此必须设置上限，避免单个文件永久阻塞后续课程。
const MEDIA_METADATA_TIMEOUT_MS = 10_000

type BatchItemStatus =
  | 'pending'
  | 'uploading-media'
  | 'preparing-course'
  | 'creating-course'
  | 'uploading-subtitle'
  | 'done'
  | 'failed'

type SubtitleFile = {
  id: string
  file: File
}

type MediaItem = {
  id: string
  mediaFile: File
  /** 关联的字幕文件 id；null 表示该媒体不导入字幕。 */
  subtitleFileId: string | null
  status: BatchItemStatus
  progress: FileUploadProgress | null
  error?: string
}

const statusMeta: Record<BatchItemStatus, { label: string; color: string }> = {
  pending: { label: '待上传', color: 'default' },
  'uploading-media': { label: '上传媒体', color: 'processing' },
  'preparing-course': { label: '准备课程信息', color: 'processing' },
  'creating-course': { label: '创建课程', color: 'processing' },
  'uploading-subtitle': { label: '写入字幕', color: 'processing' },
  done: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

// 把文件名归一化为「词干」用于前缀匹配：去掉最后一个扩展名、转小写，
// 括号/引号与 `.`/`_`/`-` 等分隔符统一折叠成空格，最后压缩空白。
// 例："1-01.Muddy.Puddles (transcribed on 20-Aug-2026 17-26-40).srt"
//   → "1 01 muddy puddles transcribed on 20 aug 2026 17 26 40"
const stemOf = (fileName: string) =>
  fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/\[|\]|[（）()【】'"“”]/g, ' ')
    .replace(/[._ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// 把词干按空格拆成词元，供前缀比较使用。
const tokenizeStem = (stem: string) => stem.split(' ').filter(Boolean)

// 前缀匹配得分：若 media 词元是 subtitle 词元的前缀（或反之），返回共同前缀词元数；
// 否则返回 0（不匹配）。要求其中一方必须整体是另一方的前缀，
// 可避免 "1-1" 误配 "1-10"、以及两个不相关文件因首个词相同而误配。
const matchScore = (mediaFileName: string, subtitleFileName: string): number => {
  const mediaTokens = tokenizeStem(stemOf(mediaFileName))
  const subtitleTokens = tokenizeStem(stemOf(subtitleFileName))
  const shorterLength = Math.min(mediaTokens.length, subtitleTokens.length)
  let common = 0
  while (common < shorterLength && mediaTokens[common] === subtitleTokens[common]) {
    common += 1
  }
  if (common === mediaTokens.length || common === subtitleTokens.length) return common
  return 0
}

// 课程标题与媒体文件名保持一致：仅去掉最后一个扩展名（如 episode-01.mp4 → episode-01），
// 其余部分原样保留，不做大小写、分隔符改写。
const titleFromFileName = (fileName: string) => fileName.replace(/\.[^.]+$/, '')

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// 媒体与字幕一次性混选后，按扩展名或 MIME 类型区分：字幕文件只可能是
// srt/vtt/ass/lrc/txt 或 text/* 类型，其余按媒体（音/视频）处理。
const SUBTITLE_EXTENSIONS = new Set(['srt', 'vtt', 'ass', 'lrc', 'txt'])

const isSubtitleFile = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return SUBTITLE_EXTENSIONS.has(extension) || file.type.startsWith('text/')
}

// 读取媒体文件的元数据时长（秒）。失败或超时返回 null，由调用方回退到字幕时长或 00:00。
// 这里的超时很重要：如果浏览器没有为损坏/不支持的文件派发任何媒体事件，
// 不回退的话会让串行批量导入永远停在当前项。
const readMediaDuration = (file: File, operationId: string): Promise<number | null> =>
  new Promise((resolve) => {
    logAdminInfo('BatchUpload', 'media-duration-start', {
      operationId,
      fileName: file.name,
      fileSize: file.size,
      mediaKind: file.type.startsWith('video/') ? 'video' : 'audio',
      timeoutMs: MEDIA_METADATA_TIMEOUT_MS,
    })
    const url = URL.createObjectURL(file)
    const element = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio')
    element.preload = 'metadata'
    let settled = false
    const timeoutRef: { id?: number } = {}
    const finish = (duration: number | null, reason: 'loaded' | 'error' | 'timeout') => {
      if (settled) return
      settled = true
      if (timeoutRef.id !== undefined) window.clearTimeout(timeoutRef.id)
      element.onloadedmetadata = null
      element.onerror = null
      // 移除 blob URL 和媒体引用，避免批量导入后继续占用文件资源。
      element.removeAttribute('src')
      element.load()
      URL.revokeObjectURL(url)
      resolve(duration)
      const details = {
        operationId,
        fileName: file.name,
        durationSeconds: duration,
        reason,
      }
      if (reason === 'timeout') {
        logAdminWarn('BatchUpload', 'media-duration-timeout', details)
      } else if (reason === 'error') {
        logAdminWarn('BatchUpload', 'media-duration-fallback', details)
      } else {
        logAdminInfo('BatchUpload', 'media-duration-success', details)
      }
    }

    element.onloadedmetadata = () => finish(Number.isFinite(element.duration) ? element.duration : null, 'loaded')
    element.onerror = () => finish(null, 'error')
    timeoutRef.id = window.setTimeout(() => finish(null, 'timeout'), MEDIA_METADATA_TIMEOUT_MS)
    element.src = url
    element.load()
  })

// 自然排序：数字按数值比较（episode2 排在 episode10 之前），大小写不敏感。
const naturalCompare = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })

// 媒体列表按文件名自然排序；同文件名（不同大小）时用 id 兜底保持稳定顺序。
const sortMediaItems = (items: MediaItem[]): MediaItem[] =>
  [...items].sort(
    (left, right) =>
      naturalCompare(left.mediaFile.name, right.mediaFile.name) || naturalCompare(left.id, right.id),
  )

// 自动配对：把每个「尚未匹配字幕」的媒体与「尚未被占用」的字幕做前缀匹配，
// 并按得分从高到低全局贪心配对（而不是按媒体顺序逐个贪心）。
// 全局按得分排序能正确处理 "1-13.Secrets.mp4" 与 "1-13.Secrets[www.19937.com].mp4"
// 这类前缀歧义：共同前缀更长的配对优先，避免同名前缀媒体串台到别的字幕。
const autoMatchSubtitles = (items: MediaItem[], subtitleFiles: SubtitleFile[]): MediaItem[] => {
  if (subtitleFiles.length === 0) return items

  const assignedSubtitleIds = new Set<string>()
  for (const item of items) {
    if (item.subtitleFileId && subtitleFiles.some((subtitle) => subtitle.id === item.subtitleFileId)) {
      assignedSubtitleIds.add(item.subtitleFileId)
    }
  }

  type Candidate = {
    itemId: string
    subtitleId: string
    itemName: string
    subtitleName: string
    score: number
  }
  const candidates: Candidate[] = []
  for (const item of items) {
    if (item.subtitleFileId && subtitleFiles.some((subtitle) => subtitle.id === item.subtitleFileId)) {
      continue
    }
    for (const subtitle of subtitleFiles) {
      if (assignedSubtitleIds.has(subtitle.id)) continue
      const score = matchScore(item.mediaFile.name, subtitle.file.name)
      if (score > 0) {
        candidates.push({
          itemId: item.id,
          subtitleId: subtitle.id,
          itemName: item.mediaFile.name,
          subtitleName: subtitle.file.name,
          score,
        })
      }
    }
  }

  // 得分降序；同分时按媒体名、字幕名自然排序，保证结果确定且更贴近直觉。
  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      naturalCompare(left.itemName, right.itemName) ||
      naturalCompare(left.subtitleName, right.subtitleName),
  )

  const itemById = new Map(items.map((item) => [item.id, item]))
  for (const candidate of candidates) {
    if (assignedSubtitleIds.has(candidate.subtitleId)) continue
    const item = itemById.get(candidate.itemId)
    if (!item || item.subtitleFileId) continue
    assignedSubtitleIds.add(candidate.subtitleId)
    itemById.set(candidate.itemId, { ...item, subtitleFileId: candidate.subtitleId })
  }

  return items.map((item) => itemById.get(item.id) ?? item)
}

export function BatchCourseImporter({
  adminToken,
  categoryGroups,
  categories,
  initialCategoryId,
  isSaving,
  onRefreshCatalog,
  onNotify,
}: BatchCourseImporterProps) {
  const { t } = useAdminLanguage()
  const [open, setOpen] = useState(false)
  const [categoryId, setCategoryId] = useState<number>(0)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [subtitleFiles, setSubtitleFiles] = useState<SubtitleFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const idSeqRef = useRef(0)
  const renderedStatusRef = useRef(new Map<string, BatchItemStatus>())

  const nextId = () => {
    idSeqRef.current += 1
    return `batch-${Date.now()}-${idSeqRef.current}`
  }

  const categoryOptions = useMemo(
    () =>
      categoryGroups.map((group) => ({
        label: group.name,
        options: categories
          .filter((category) => category.groupId === group.id)
          .map((category) => ({ label: category.name, value: category.id })),
      })),
    [categories, categoryGroups],
  )

  // 列表与上传顺序都按媒体文件名自然排序；排序是派生的，不写回原始状态，
  // 这样编辑标题/字幕匹配时不会引起行重排。
  const sortedMediaItems = useMemo(() => sortMediaItems(mediaItems), [mediaItems])

  useEffect(() => {
    // 记录已经真正渲染到界面的状态，而不只是记录调用了哪个 setState，
    // 这样可以区分“状态更新请求了”与“组件实际显示已更新”。
    const nextStatuses = new Map<string, BatchItemStatus>()
    for (const item of mediaItems) {
      const previousStatus = renderedStatusRef.current.get(item.id)
      if (previousStatus !== item.status) {
        logAdminInfo('BatchUpload', 'item-status-rendered', {
          itemId: item.id,
          fileName: item.mediaFile.name,
          previousStatus: previousStatus ?? null,
          status: item.status,
          error: item.error ?? null,
        })
      }
      nextStatuses.set(item.id, item.status)
    }
    renderedStatusRef.current = nextStatuses
  }, [mediaItems])

  const openModal = () => {
    const nextCategoryId = categoryId || initialCategoryId || categories[0]?.id || 0
    logAdminInfo('BatchUpload', 'modal-opened', {
      categoryId: nextCategoryId,
      existingMediaCount: mediaItems.length,
      existingSubtitleCount: subtitleFiles.length,
    })
    setCategoryId(nextCategoryId)
    setOpen(true)
  }

  const updateItem = (id: string, patch: Partial<MediaItem>) => {
    setMediaItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  const removeItem = (id: string) => {
    const item = mediaItems.find((entry) => entry.id === id)
    logAdminInfo('BatchUpload', 'item-removed', {
      itemId: id,
      fileName: item?.mediaFile.name ?? null,
    })
    setMediaItems((current) => current.filter((item) => item.id !== id))
  }

  const clearAll = () => {
    logAdminInfo('BatchUpload', 'queue-cleared', {
      mediaCount: mediaItems.length,
      subtitleCount: subtitleFiles.length,
    })
    setMediaItems([])
    setSubtitleFiles([])
  }

  // 一次混选所有文件：先按类型拆成媒体与字幕，去重后合并到现有列表，
  // 再按文件名重新自动匹配（仅补齐尚未匹配的媒体，不覆盖用户已手动调整的结果）。
  const addFiles = (files: File[]) => {
    logAdminInfo('BatchUpload', 'files-selected', {
      selectedCount: files.length,
      files: files.slice(0, 50).map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type || null,
      })),
      omittedFileCount: Math.max(0, files.length - 50),
    })
    const mediaKeys = new Set(mediaItems.map((item) => `${item.mediaFile.name}:${item.mediaFile.size}`))
    const subtitleKeys = new Set(subtitleFiles.map((subtitle) => `${subtitle.file.name}:${subtitle.file.size}`))
    const skippedOversized: string[] = []
    const newMediaItems: MediaItem[] = []
    const newSubtitles: SubtitleFile[] = []

    for (const file of files) {
      const key = `${file.name}:${file.size}`
      if (isSubtitleFile(file)) {
        if (!subtitleKeys.has(key)) {
          subtitleKeys.add(key)
          newSubtitles.push({ id: nextId(), file })
        }
      } else {
        if (file.size > MAX_MEDIA_FILE_SIZE) {
          skippedOversized.push(file.name)
          continue
        }
        if (!mediaKeys.has(key)) {
          mediaKeys.add(key)
          newMediaItems.push({
            id: nextId(),
            mediaFile: file,
            subtitleFileId: null,
            status: 'pending',
            progress: null,
          })
        }
      }
    }

    if (skippedOversized.length > 0) {
      logAdminWarn('BatchUpload', 'oversized-files-skipped', {
        skippedCount: skippedOversized.length,
        fileNames: skippedOversized,
        maxBytes: MAX_MEDIA_FILE_SIZE,
      })
      onNotify(`已跳过超过 120MB 的文件：${skippedOversized.join('、')}`, 'error')
    }
    if (newMediaItems.length === 0 && newSubtitles.length === 0) {
      logAdminInfo('BatchUpload', 'files-added-none', {
        selectedCount: files.length,
        skippedOversizedCount: skippedOversized.length,
      })
      if (skippedOversized.length === 0) onNotify('没有新增文件（可能已重复选择）', 'info')
      return
    }

    const mergedSubtitles = [...subtitleFiles, ...newSubtitles]
    const mergedMedia = autoMatchSubtitles([...mediaItems, ...newMediaItems], mergedSubtitles)
    logAdminInfo('BatchUpload', 'files-added', {
      addedMediaCount: newMediaItems.length,
      addedSubtitleCount: newSubtitles.length,
      totalMediaCount: mergedMedia.length,
      totalSubtitleCount: mergedSubtitles.length,
      matchedMediaCount: mergedMedia.filter((item) => item.subtitleFileId).length,
    })
    setSubtitleFiles(mergedSubtitles)
    setMediaItems(mergedMedia)
  }

  const startUpload = async () => {
    if (!categoryId) {
      logAdminWarn('BatchUpload', 'upload-blocked-no-category')
      onNotify('请先选择课程所属的学习系列', 'error')
      return
    }
    const pendingItems = sortedMediaItems.filter((item) => item.status !== 'done')
    if (pendingItems.length === 0) {
      logAdminInfo('BatchUpload', 'upload-skipped-no-pending-items', {
        categoryId,
        totalMediaCount: sortedMediaItems.length,
      })
      onNotify('没有待上传的媒体', 'info')
      return
    }

    const operationId = createAdminOperationId('batch-upload')
    const operationStartedAt = Date.now()
    logAdminInfo('BatchUpload', 'upload-start', {
      operationId,
      categoryId,
      pendingCount: pendingItems.length,
      pendingFiles: pendingItems.slice(0, 50).map((item) => ({
        itemId: item.id,
        fileName: item.mediaFile.name,
        fileSize: item.mediaFile.size,
        subtitleFileId: item.subtitleFileId,
      })),
      omittedItemCount: Math.max(0, pendingItems.length - 50),
    })
    setIsUploading(true)
    let successCount = 0
    let failedCount = 0
    try {
      // 计算下一个排序值：同系列内追加，避免与已有课程 sortOrder 冲突。
      // 后端创建时还有二次兜底（冲突时自动落到 max+10），这里失败不阻断上传。
      let nextSortOrder = 10
      try {
        logAdminInfo('BatchUpload', 'sort-order-fetch-start', { operationId, categoryId })
        const allExercises = await apiClient.getAdminExercises(adminToken)
        const maxOrder = allExercises
          .filter((exercise) => exercise.categoryId === categoryId)
          .reduce((max, exercise) => Math.max(max, exercise.sortOrder), 0)
        nextSortOrder = maxOrder + 10
        logAdminInfo('BatchUpload', 'sort-order-fetch-success', {
          operationId,
          categoryId,
          totalExerciseCount: allExercises.length,
          categoryExerciseCount: allExercises.filter((exercise) => exercise.categoryId === categoryId).length,
          maxOrder,
          nextSortOrder,
        })
      } catch (error) {
        logAdminWarn('BatchUpload', 'sort-order-fetch-fallback', {
          operationId,
          categoryId,
          ...getAdminErrorDetails(error),
        })
        // 忽略：排序值仅用于追加顺序，失败时使用默认值。
      }

      for (const [itemIndex, item] of pendingItems.entries()) {
        const itemStartedAt = Date.now()
        const subtitle = subtitleFiles.find((entry) => entry.id === item.subtitleFileId)
        let itemStage = 'media-upload'
        logAdminInfo('BatchUpload', 'item-start', {
          operationId,
          itemId: item.id,
          itemIndex: itemIndex + 1,
          itemCount: pendingItems.length,
          fileName: item.mediaFile.name,
          fileSize: item.mediaFile.size,
          subtitleFileName: subtitle?.file.name ?? null,
        })
        updateItem(item.id, {
          status: 'uploading-media',
          progress: { loaded: 0, total: item.mediaFile.size || null, percent: 0 },
          error: undefined,
        })
        logAdminInfo('BatchUpload', 'item-status-requested', {
          operationId,
          itemId: item.id,
          fileName: item.mediaFile.name,
          status: 'uploading-media',
        })
        try {
          // 1) 上传媒体文件（逐个，串行）。
          logAdminInfo('BatchUpload', 'media-upload-start', {
            operationId,
            itemId: item.id,
            fileName: item.mediaFile.name,
            fileSize: item.mediaFile.size,
          })
          let lastProgressBucket = ''
          const uploaded = await apiClient.uploadMedia(item.mediaFile, adminToken, (progress) => {
            updateItem(item.id, { progress })
            const progressBucket = progress.percent === null
              ? 'indeterminate'
              : String(Math.floor(progress.percent / 25))
            if (progressBucket !== lastProgressBucket) {
              lastProgressBucket = progressBucket
              logAdminInfo('BatchUpload', 'media-upload-progress', {
                operationId,
                itemId: item.id,
                fileName: item.mediaFile.name,
                loaded: progress.loaded,
                total: progress.total,
                percent: progress.percent,
              })
            }
          })
          logAdminInfo('BatchUpload', 'media-upload-success', {
            operationId,
            itemId: item.id,
            fileName: item.mediaFile.name,
            elapsedMs: Date.now() - itemStartedAt,
            mediaType: uploaded.mediaType,
            hasPublicUrl: Boolean(uploaded.publicUrl),
          })
          updateItem(item.id, { status: 'preparing-course', progress: null })
          logAdminInfo('BatchUpload', 'item-status-requested', {
            operationId,
            itemId: item.id,
            fileName: item.mediaFile.name,
            status: 'preparing-course',
          })

          // 2) 解析关联字幕（若有），自动识别双语结构。
          itemStage = 'subtitle-parse'
          let transcript: CreateTranscriptLineRequest[] = []
          let subtitleEnd: number | null = null
          if (subtitle) {
            logAdminInfo('BatchUpload', 'subtitle-parse-start', {
              operationId,
              itemId: item.id,
              fileName: item.mediaFile.name,
              subtitleFileName: subtitle.file.name,
            })
            try {
              const text = await subtitle.file.text()
              const analysis = analyzeSubtitleDraft(text)
              const mode = analysis.isLikelyBilingual ? analysis.suggestedMode : 'single'
              const draftLines = parseSubtitleDraft(text, mode)
              transcript = toTranscriptLines(draftLines).filter(
                (line) => line.text.trim() && line.end > line.start,
              )
              if (transcript.length > 0) {
                subtitleEnd = Math.max(...transcript.map((line) => line.end))
              }
              logAdminInfo('BatchUpload', 'subtitle-parse-success', {
                operationId,
                itemId: item.id,
                fileName: item.mediaFile.name,
                subtitleFileName: subtitle.file.name,
                detectedMode: mode,
                transcriptLineCount: transcript.length,
                subtitleEnd,
              })
            } catch (error) {
              logAdminError('BatchUpload', 'subtitle-parse-failed', {
                operationId,
                itemId: item.id,
                fileName: item.mediaFile.name,
                subtitleFileName: subtitle.file.name,
                ...getAdminErrorDetails(error),
              })
              onNotify(
                `字幕解析失败：${subtitle.file.name}（${error instanceof Error ? error.message : '格式错误'}）`,
                'error',
              )
              transcript = []
            }
          } else {
            logAdminInfo('BatchUpload', 'subtitle-parse-skipped', {
              operationId,
              itemId: item.id,
              fileName: item.mediaFile.name,
              reason: 'no-matched-subtitle',
            })
          }

          // 3) 时长标签：优先媒体元数据，其次字幕末句结束时间，最后 00:00。
          itemStage = 'media-duration'
          const mediaDuration = await readMediaDuration(item.mediaFile, operationId)
          const durationLabel = formatDurationLabel(mediaDuration ?? subtitleEnd ?? 0)
          logAdminInfo('BatchUpload', 'duration-resolved', {
            operationId,
            itemId: item.id,
            fileName: item.mediaFile.name,
            mediaDurationSeconds: mediaDuration,
            subtitleEndSeconds: subtitleEnd,
            durationLabel,
            usedFallback: mediaDuration === null,
          })

          itemStage = 'create-course'
          updateItem(item.id, { status: 'creating-course' })
          logAdminInfo('BatchUpload', 'item-status-requested', {
            operationId,
            itemId: item.id,
            fileName: item.mediaFile.name,
            status: 'creating-course',
          })
          const title = titleFromFileName(item.mediaFile.name)
          const payload: CreateExerciseRequest = {
            categoryId,
            title,
            source: item.mediaFile.name,
            sourceUrl: '',
            difficulty: 'intermediate',
            durationLabel,
            mediaType: uploaded.mediaType,
            audioUrl: uploaded.publicUrl,
            coverImageUrl: '',
            summary: '',
            sortOrder: nextSortOrder,
            status: 'draft',
          }
          logAdminInfo('BatchUpload', 'course-create-start', {
            operationId,
            itemId: item.id,
            fileName: item.mediaFile.name,
            categoryId,
            title,
            sortOrder: nextSortOrder,
            durationLabel,
            mediaType: uploaded.mediaType,
            transcriptLineCount: transcript.length,
            hasAudioUrl: Boolean(uploaded.publicUrl),
          })
          const result = await apiClient.createExercise(payload, adminToken)
          const exerciseId = result.id
          if (!exerciseId) {
            throw new Error('课程创建后未返回 ID')
          }
          logAdminInfo('BatchUpload', 'course-create-success', {
            operationId,
            itemId: item.id,
            fileName: item.mediaFile.name,
            exerciseId,
            elapsedMs: Date.now() - itemStartedAt,
          })
          nextSortOrder += 10

          // 4) 写入字幕。
          if (transcript.length > 0) {
            itemStage = 'subtitle-upload'
            updateItem(item.id, { status: 'uploading-subtitle' })
            logAdminInfo('BatchUpload', 'item-status-requested', {
              operationId,
              itemId: item.id,
              fileName: item.mediaFile.name,
              status: 'uploading-subtitle',
            })
            logAdminInfo('BatchUpload', 'subtitle-upload-start', {
              operationId,
              itemId: item.id,
              fileName: item.mediaFile.name,
              exerciseId,
              transcriptLineCount: transcript.length,
            })
            await apiClient.replaceTranscript(exerciseId, transcript, adminToken)
            logAdminInfo('BatchUpload', 'subtitle-upload-success', {
              operationId,
              itemId: item.id,
              fileName: item.mediaFile.name,
              exerciseId,
              transcriptLineCount: transcript.length,
            })
          } else {
            logAdminInfo('BatchUpload', 'subtitle-upload-skipped', {
              operationId,
              itemId: item.id,
              fileName: item.mediaFile.name,
              exerciseId,
              reason: 'no-valid-transcript-lines',
            })
          }

          updateItem(item.id, { status: 'done', error: undefined })
          logAdminInfo('BatchUpload', 'item-status-requested', {
            operationId,
            itemId: item.id,
            fileName: item.mediaFile.name,
            status: 'done',
          })
          logAdminInfo('BatchUpload', 'item-success', {
            operationId,
            itemId: item.id,
            itemIndex: itemIndex + 1,
            fileName: item.mediaFile.name,
            exerciseId,
            elapsedMs: Date.now() - itemStartedAt,
          })
          successCount += 1
        } catch (error) {
          logAdminError('BatchUpload', 'item-failed', {
            operationId,
            itemId: item.id,
            itemIndex: itemIndex + 1,
            fileName: item.mediaFile.name,
            stage: itemStage,
            elapsedMs: Date.now() - itemStartedAt,
            ...getAdminErrorDetails(error),
          })
          updateItem(item.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : '上传失败',
          })
          logAdminInfo('BatchUpload', 'item-status-requested', {
            operationId,
            itemId: item.id,
            fileName: item.mediaFile.name,
            status: 'failed',
            error: error instanceof Error ? error.message : '上传失败',
          })
          failedCount += 1
        }
      }
    } finally {
      setIsUploading(false)
      logAdminInfo('BatchUpload', 'catalog-refresh-start', {
        operationId,
        successCount,
        failedCount,
      })
      try {
        await onRefreshCatalog()
        logAdminInfo('BatchUpload', 'catalog-refresh-success', { operationId })
      } catch (error) {
        logAdminWarn('BatchUpload', 'catalog-refresh-failed', {
          operationId,
          ...getAdminErrorDetails(error),
        })
        // 刷新失败由父层提示；不阻断批量上传结果的汇总提示。
      }
    }

    logAdminInfo('BatchUpload', 'upload-finished', {
      operationId,
      categoryId,
      successCount,
      failedCount,
      elapsedMs: Date.now() - operationStartedAt,
    })
    if (failedCount > 0) {
      onNotify(t('批量上传完成：成功 {{success}} 门，失败 {{failed}} 门', { success: successCount, failed: failedCount }), 'error')
    } else {
      onNotify(t('批量上传完成：成功 {{success}} 门课程', { success: successCount }), 'success')
    }
  }

  const matchedCount = sortedMediaItems.filter((item) => item.subtitleFileId).length
  const unmatchedCount = sortedMediaItems.length - matchedCount
  const canStartUpload = sortedMediaItems.length > 0 && Boolean(categoryId) && !isUploading

  const columns: ColumnsType<MediaItem> = [
    {
      title: t('课程标题'),
      key: 'title',
      width: 340,
      render: (_, item) => (
        <Typography.Text
          ellipsis={{ tooltip: titleFromFileName(item.mediaFile.name) }}
          style={{ maxWidth: 320 }}
        >
          {titleFromFileName(item.mediaFile.name)}
        </Typography.Text>
      ),
    },
    {
      title: t('媒体文件'),
      dataIndex: 'mediaFile',
      width: 260,
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Typography.Text ellipsis={{ tooltip: item.mediaFile.name }} style={{ maxWidth: 240 }}>
            {item.mediaFile.name}
          </Typography.Text>
          <Typography.Text style={{ fontSize: 12 }} type="secondary">
            {formatFileSize(item.mediaFile.size)}
            {item.mediaFile.type.startsWith('video/') ? ` · ${t('视频')}` : ` · ${t('音频')}`}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('匹配字幕'),
      dataIndex: 'subtitleFileId',
      width: 220,
      render: (_, item) => (
        <Select
          allowClear
          disabled={isUploading}
          onChange={(value: string | undefined) =>
            updateItem(item.id, { subtitleFileId: value ?? null })
          }
          options={subtitleFiles.map((subtitle) => ({
            label: subtitle.file.name,
            value: subtitle.id,
          }))}
          placeholder={t('选择字幕（自动匹配）')}
          size="small"
          style={{ width: '100%' }}
          value={item.subtitleFileId ?? undefined}
        />
      ),
    },
    {
      title: t('状态'),
      key: 'status',
      width: 200,
      render: (_, item) => {
        const meta = statusMeta[item.status]
        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Tag color={meta.color}>{t(meta.label)}</Tag>
            {item.status === 'uploading-media' && (
              <Progress percent={item.progress?.percent ?? 0} size="small" />
            )}
            {item.status === 'failed' && item.error && (
              <Typography.Text
                ellipsis={{ tooltip: item.error }}
                style={{ fontSize: 12, maxWidth: 180 }}
                type="danger"
              >
                {item.error}
              </Typography.Text>
            )}
          </Space>
        )
      },
    },
    {
      title: t('操作'),
      key: 'actions',
      width: 64,
      render: (_, item) => (
        <Tooltip title={t('移除该媒体')}>
          <Button
            danger
            disabled={isUploading}
            icon={<Trash2 size={14} />}
            onClick={() => removeItem(item.id)}
            size="small"
            type="text"
          />
        </Tooltip>
      ),
    },
  ]

  const disabledReason = isSaving
    ? t('后台正在保存、删除或调整课程顺序，请等待当前操作完成。')
    : categories.length === 0
      ? t('当前还没有学习系列，请先到“目录结构”中新建学习系列。')
      : ''

  return (
    <>
      <Tooltip title={disabledReason || undefined}>
        <span>
          <Button
            disabled={Boolean(disabledReason)}
            icon={<Layers size={15} />}
            onClick={openModal}
          >
            {t('批量上传')}
          </Button>
        </span>
      </Tooltip>

      <Modal
        closable={!isUploading}
        footer={[
          <Button disabled={isUploading} key="clear" onClick={clearAll}>
            {t('清空列表')}
          </Button>,
          <Button disabled={isUploading} key="close" onClick={() => setOpen(false)}>
            {t('关闭')}
          </Button>,
          <Button
            disabled={!canStartUpload}
            key="upload"
            loading={isUploading}
            onClick={() => void startUpload()}
            type="primary"
          >
            {t('开始上传')}
          </Button>,
        ]}
        maskClosable={false}
        onCancel={() => {
          if (!isUploading) setOpen(false)
        }}
        open={open}
        title={t('批量上传媒体与字幕')}
        width={1200}
      >
        <Space className="batch-importer-toolbar" direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Typography.Text strong>{t('课程所属系列：')}</Typography.Text>
            <Select
              disabled={isUploading}
              onChange={(value) => setCategoryId(Number(value))}
              options={categoryOptions}
              placeholder={t('选择学习系列')}
              style={{ minWidth: 260 }}
              value={categoryId || undefined}
            />
          </Space>
          <Space wrap>
            <input
              ref={fileInputRef}
              accept="video/*,audio/*,.srt,.vtt,.ass,.lrc,.txt,text/plain"
              hidden
              multiple
              onChange={(event) => {
                const files = event.target.files ? Array.from(event.target.files) : []
                if (files.length > 0) addFiles(files)
                event.target.value = ''
              }}
              type="file"
            />
            <Button
              disabled={isUploading}
              icon={<Upload size={15} />}
              onClick={() => fileInputRef.current?.click()}
              type="primary"
            >
              {t('选择媒体与字幕文件（可多选）')}
            </Button>
            <Typography.Text type="secondary">
              {t('媒体 {{media}} · 字幕 {{subtitles}} · 已匹配 {{matched}} · 未匹配 {{unmatched}}', { media: mediaItems.length, subtitles: subtitleFiles.length, matched: matchedCount, unmatched: unmatchedCount })}
            </Typography.Text>
          </Space>
          <Typography.Text type="secondary">
            {t('一次性选择所有媒体和字幕文件（先后顺序、是否分次选择均可），系统每次选择后都会按文件名前缀重新自动配对（如 1-01.Muddy.Puddles.mp4 ↔ 1-01.Muddy.Puddles (transcribed on …).srt），可在表格中手动调整。点击「开始上传」后逐个上传媒体并写入字幕。')}
          </Typography.Text>
        </Space>

        <Table
          className="batch-importer-table"
          columns={columns}
          dataSource={sortedMediaItems}
          locale={{ emptyText: t('请先选择媒体与字幕文件；系统会按文件名自动配对。') }}
          pagination={false}
          rowKey="id"
          scroll={{ x: 1100 }}
          size="small"
        />
      </Modal>
    </>
  )
}
