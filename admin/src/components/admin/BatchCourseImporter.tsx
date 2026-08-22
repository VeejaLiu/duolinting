import { Layers, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
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
  analyzeSubtitleDraft,
  formatDurationLabel,
  parseSubtitleDraft,
  toTranscriptLines,
} from '../../lib/mediaDraftTools'

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

type BatchItemStatus =
  | 'pending'
  | 'uploading-media'
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

// 读取媒体文件的元数据时长（秒）。失败返回 null，由调用方回退到字幕时长或 00:00。
const readMediaDuration = (file: File): Promise<number | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const element = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio')
    element.preload = 'metadata'
    const cleanup = () => URL.revokeObjectURL(url)
    element.onloadedmetadata = () => {
      const duration = Number.isFinite(element.duration) ? element.duration : null
      cleanup()
      resolve(duration)
    }
    element.onerror = () => {
      cleanup()
      resolve(null)
    }
    element.src = url
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
  const [open, setOpen] = useState(false)
  const [categoryId, setCategoryId] = useState<number>(0)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [subtitleFiles, setSubtitleFiles] = useState<SubtitleFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const idSeqRef = useRef(0)

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

  const openModal = () => {
    setCategoryId((current) => current || initialCategoryId || categories[0]?.id || 0)
    setOpen(true)
  }

  const updateItem = (id: string, patch: Partial<MediaItem>) => {
    setMediaItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  const removeItem = (id: string) => {
    setMediaItems((current) => current.filter((item) => item.id !== id))
  }

  const clearAll = () => {
    setMediaItems([])
    setSubtitleFiles([])
  }

  // 一次混选所有文件：先按类型拆成媒体与字幕，去重后合并到现有列表，
  // 再按文件名重新自动匹配（仅补齐尚未匹配的媒体，不覆盖用户已手动调整的结果）。
  const addFiles = (files: File[]) => {
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
      onNotify(`已跳过超过 120MB 的文件：${skippedOversized.join('、')}`, 'error')
    }
    if (newMediaItems.length === 0 && newSubtitles.length === 0) {
      if (skippedOversized.length === 0) onNotify('没有新增文件（可能已重复选择）', 'info')
      return
    }

    const mergedSubtitles = [...subtitleFiles, ...newSubtitles]
    const mergedMedia = autoMatchSubtitles([...mediaItems, ...newMediaItems], mergedSubtitles)
    setSubtitleFiles(mergedSubtitles)
    setMediaItems(mergedMedia)
  }

  const startUpload = async () => {
    if (!categoryId) {
      onNotify('请先选择课程所属的学习系列', 'error')
      return
    }
    const pendingItems = sortedMediaItems.filter((item) => item.status !== 'done')
    if (pendingItems.length === 0) {
      onNotify('没有待上传的媒体', 'info')
      return
    }

    setIsUploading(true)
    let successCount = 0
    let failedCount = 0
    try {
      // 计算下一个排序值：同系列内追加，避免与已有课程 sortOrder 冲突。
      // 后端创建时还有二次兜底（冲突时自动落到 max+10），这里失败不阻断上传。
      let nextSortOrder = 10
      try {
        const allExercises = await apiClient.getAdminExercises(adminToken)
        const maxOrder = allExercises
          .filter((exercise) => exercise.categoryId === categoryId)
          .reduce((max, exercise) => Math.max(max, exercise.sortOrder), 0)
        nextSortOrder = maxOrder + 10
      } catch {
        // 忽略：排序值仅用于追加顺序，失败时使用默认值。
      }

      for (const item of pendingItems) {
        updateItem(item.id, {
          status: 'uploading-media',
          progress: { loaded: 0, total: item.mediaFile.size || null, percent: 0 },
          error: undefined,
        })
        try {
          // 1) 上传媒体文件（逐个，串行）。
          const uploaded = await apiClient.uploadMedia(item.mediaFile, adminToken, (progress) =>
            updateItem(item.id, { progress }),
          )
          updateItem(item.id, { status: 'creating-course', progress: null })

          // 2) 解析关联字幕（若有），自动识别双语结构。
          let transcript: CreateTranscriptLineRequest[] = []
          let subtitleEnd: number | null = null
          const subtitle = subtitleFiles.find((entry) => entry.id === item.subtitleFileId)
          if (subtitle) {
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
            } catch (error) {
              onNotify(
                `字幕解析失败：${subtitle.file.name}（${error instanceof Error ? error.message : '格式错误'}）`,
                'error',
              )
              transcript = []
            }
          }

          // 3) 时长标签：优先媒体元数据，其次字幕末句结束时间，最后 00:00。
          const mediaDuration = await readMediaDuration(item.mediaFile)
          const durationLabel = formatDurationLabel(mediaDuration ?? subtitleEnd ?? 0)

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
          const result = await apiClient.createExercise(payload, adminToken)
          const exerciseId = result.id
          if (!exerciseId) {
            throw new Error('课程创建后未返回 ID')
          }
          nextSortOrder += 10

          // 4) 写入字幕。
          if (transcript.length > 0) {
            updateItem(item.id, { status: 'uploading-subtitle' })
            await apiClient.replaceTranscript(exerciseId, transcript, adminToken)
          }

          updateItem(item.id, { status: 'done', error: undefined })
          successCount += 1
        } catch (error) {
          updateItem(item.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : '上传失败',
          })
          failedCount += 1
        }
      }
    } finally {
      setIsUploading(false)
      try {
        await onRefreshCatalog()
      } catch {
        // 刷新失败由父层提示；不阻断批量上传结果的汇总提示。
      }
    }

    if (failedCount > 0) {
      onNotify(`批量上传完成：成功 ${successCount} 门，失败 ${failedCount} 门`, 'error')
    } else {
      onNotify(`批量上传完成：成功 ${successCount} 门课程`, 'success')
    }
  }

  const matchedCount = sortedMediaItems.filter((item) => item.subtitleFileId).length
  const unmatchedCount = sortedMediaItems.length - matchedCount
  const canStartUpload = sortedMediaItems.length > 0 && Boolean(categoryId) && !isUploading

  const columns: ColumnsType<MediaItem> = [
    {
      title: '课程标题',
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
      title: '媒体文件',
      dataIndex: 'mediaFile',
      width: 260,
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Typography.Text ellipsis={{ tooltip: item.mediaFile.name }} style={{ maxWidth: 240 }}>
            {item.mediaFile.name}
          </Typography.Text>
          <Typography.Text style={{ fontSize: 12 }} type="secondary">
            {formatFileSize(item.mediaFile.size)}
            {item.mediaFile.type.startsWith('video/') ? ' · 视频' : ' · 音频'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '匹配字幕',
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
          placeholder="选择字幕（自动匹配）"
          size="small"
          style={{ width: '100%' }}
          value={item.subtitleFileId ?? undefined}
        />
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 200,
      render: (_, item) => {
        const meta = statusMeta[item.status]
        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Tag color={meta.color}>{meta.label}</Tag>
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
      title: '操作',
      key: 'actions',
      width: 64,
      render: (_, item) => (
        <Tooltip title="移除该媒体">
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
    ? '后台正在保存、删除或调整课程顺序，请等待当前操作完成。'
    : categories.length === 0
      ? '当前还没有学习系列，请先到“目录结构”中新建学习系列。'
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
            批量上传
          </Button>
        </span>
      </Tooltip>

      <Modal
        closable={!isUploading}
        footer={[
          <Button disabled={isUploading} key="clear" onClick={clearAll}>
            清空列表
          </Button>,
          <Button disabled={isUploading} key="close" onClick={() => setOpen(false)}>
            关闭
          </Button>,
          <Button
            disabled={!canStartUpload}
            key="upload"
            loading={isUploading}
            onClick={() => void startUpload()}
            type="primary"
          >
            开始上传
          </Button>,
        ]}
        maskClosable={false}
        onCancel={() => {
          if (!isUploading) setOpen(false)
        }}
        open={open}
        title="批量上传媒体与字幕"
        width={1200}
      >
        <Space className="batch-importer-toolbar" direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Typography.Text strong>课程所属系列：</Typography.Text>
            <Select
              disabled={isUploading}
              onChange={(value) => setCategoryId(Number(value))}
              options={categoryOptions}
              placeholder="选择学习系列"
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
              选择媒体与字幕文件（可多选）
            </Button>
            <Typography.Text type="secondary">
              媒体 {mediaItems.length} · 字幕 {subtitleFiles.length} · 已匹配 {matchedCount} · 未匹配 {unmatchedCount}
            </Typography.Text>
          </Space>
          <Typography.Text type="secondary">
            一次性选择所有媒体和字幕文件（先后顺序、是否分次选择均可），系统每次选择后都会按文件名前缀重新自动配对（如 1-01.Muddy.Puddles.mp4 ↔ 1-01.Muddy.Puddles (transcribed on …).srt），可在表格中手动调整。点击「开始上传」后逐个上传媒体并写入字幕。
          </Typography.Text>
        </Space>

        <Table
          className="batch-importer-table"
          columns={columns}
          dataSource={sortedMediaItems}
          locale={{ emptyText: '请先选择媒体与字幕文件；系统会按文件名自动配对。' }}
          pagination={false}
          rowKey="id"
          scroll={{ x: 1100 }}
          size="small"
        />
      </Modal>
    </>
  )
}
