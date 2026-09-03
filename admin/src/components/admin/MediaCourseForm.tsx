import * as Select from '@radix-ui/react-select'
import { Button, Drawer, Progress } from 'antd'
import {
  Check,
  ChevronDown,
  FileAudio,
  FileText,
  FileVideo,
  FolderTree,
  Save,
  Send,
  Sparkles,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import type {
  CreateExerciseRequest,
  Difficulty,
  ExerciseCategory,
  MaterialCategory,
  ContentLocale,
} from '@duolinting/shared'
import type { AdminNoticeTone } from './AdminFeedback'
import { CoverImageField } from './CoverImageField'
import { apiClient, type FileUploadProgress } from '../../lib/apiClient'
import { formatDurationLabel, type DraftLine } from '../../lib/mediaDraftTools'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type ClipboardPanelState =
  | { mode: 'hidden' }
  | { mode: 'copy'; content: string; label?: string }
  | { mode: 'paste'; content: string }

type MediaEditorResizeMode = 'columns' | 'rows'

/**
 * 格式化文件大小为人类可读的字符串
 * @param bytes 文件大小（字节）
 * @returns 格式化后的字符串，如 "1.5 MB"
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

const MEDIA_LOG_PREFIX = '[DuolinTing Admin Media]'

const getMediaSnapshot = (media: HTMLMediaElement | null) =>
  media
    ? {
        currentSrc: media.currentSrc,
        currentTime: media.currentTime,
        duration: media.duration,
        ended: media.ended,
        error: media.error
          ? {
              code: media.error.code,
              message: media.error.message,
            }
          : null,
        networkState: media.networkState,
        paused: media.paused,
        readyState: media.readyState,
        tagName: media.tagName,
      }
    : null

const logMediaDebug = (event: string, details?: Record<string, unknown>) => {
  console.info(MEDIA_LOG_PREFIX, event, {
    at: new Date().toISOString(),
    ...details,
  })
}

type MediaCourseFormProps = {
  adminToken: string
  categoriesByGroup: Array<{
    group: MaterialCategory
    categories: ExerciseCategory[]
  }>
  courseForm: CreateExerciseRequest
  isSaving: boolean
  isSubtitleContributor?: boolean
  saveDisabledReason?: string
  localMediaUrl: string
  mediaSize: number | null
  mediaFile: File | null
  mediaUploadProgress: FileUploadProgress | null
  mediaRef: React.MutableRefObject<HTMLMediaElement | null>
  previewLines?: DraftLine[]
  statusBar?: ReactNode
  subtitleEditor?: ReactNode
  subtitleImporter?: ReactNode
  waveform?: ReactNode
  onCourseFormChange: React.Dispatch<React.SetStateAction<CreateExerciseRequest>>
  clipboardPanel: ClipboardPanelState
  onClipboardPanelChange: React.Dispatch<React.SetStateAction<ClipboardPanelState>>
  onManualDltjsonImport: () => void
  onNotify: (message: string, tone?: AdminNoticeTone) => void
  onFileChange: (file: File | null) => void
  onSaveLesson: () => void
  onSubmitSubtitleDraft?: () => void
}

/* ── 通用 Radix Select 封装 ── */
type SelectOption = { value: string; label: string }

const courseLocalizationLocales = ['en-US', 'th-TH', 'ja-JP'] as const
const courseLocalizationLabels = {
  'en-US': '英语',
  'th-TH': '泰语',
  'ja-JP': '日语',
}

function FieldSelect({
  label,
  value,
  onValueChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <Select.Root value={value} onValueChange={onValueChange}>
        <Select.Trigger className="radix-select-trigger">
          <Select.Value placeholder={placeholder} />
          <Select.Icon className="radix-select-icon">
            <ChevronDown size={14} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="radix-select-content" position="popper" sideOffset={4}>
            <Select.Viewport className="radix-select-viewport">
              {options.map((opt) => (
                <Select.Item key={opt.value} className="radix-select-item" value={opt.value}>
                  <Select.ItemText>{opt.label}</Select.ItemText>
                  <Select.ItemIndicator className="radix-select-indicator">
                    <Check size={14} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </label>
  )
}

export function MediaCourseForm({
  adminToken,
  categoriesByGroup,
  courseForm,
  isSaving,
  isSubtitleContributor = false,
  saveDisabledReason,
  localMediaUrl,
  mediaSize,
  mediaFile,
  mediaUploadProgress,
  mediaRef,
  previewLines = [],
  statusBar,
  subtitleEditor,
  subtitleImporter,
  waveform,
  onCourseFormChange,
  clipboardPanel,
  onClipboardPanelChange,
  onManualDltjsonImport,
  onNotify,
  onFileChange,
  onSaveLesson,
  onSubmitSubtitleDraft,
}: MediaCourseFormProps) {
  const { t } = useAdminLanguage()
  const [localizationLocale, setLocalizationLocale] = useState<ContentLocale>('en-US')
  const [previewTime, setPreviewTime] = useState(0)
  const [isCourseMetaOpen, setIsCourseMetaOpen] = useState(false)
  const [isSubtitleImporterOpen, setIsSubtitleImporterOpen] = useState(false)
  const [isGeneratingLocalizations, setIsGeneratingLocalizations] = useState(false)
  const [videoColumnPercent, setVideoColumnPercent] = useState(66)
  const [waveformHeight, setWaveformHeight] = useState(190)
  const [activeResizeMode, setActiveResizeMode] = useState<MediaEditorResizeMode | null>(null)
  const mediaEditorUpperRef = useRef<HTMLDivElement | null>(null)
  const mediaEditorWorkspaceRef = useRef<HTMLDivElement | null>(null)
  const resizeModeRef = useRef<MediaEditorResizeMode | null>(null)
  const localizedContent = courseForm.localizations?.[localizationLocale] ?? {}
  const updateLocalizedContent = (patch: { title?: string; summary?: string }) =>
    onCourseFormChange((current) => ({
      ...current,
      localizations: {
        ...current.localizations,
        [localizationLocale]: {
          ...current.localizations?.[localizationLocale],
          ...patch,
        },
      },
    }))

  const generateCourseLocalizations = async () => {
    const sourceTitle = courseForm.title.trim()
    const sourceSummary = courseForm.summary.trim()
    if (!sourceTitle) {
      onNotify(t('请先填写课程标题'), 'error')
      return
    }

    setIsGeneratingLocalizations(true)
    try {
      const nextLocalizations = { ...courseForm.localizations }
      // 与目录多语言生成保持一致：按语言串行请求，标题和摘要在同一批次返回，
      // 既降低免费模型并发压力，也保证两项内容按原下标对应写回。
      for (const locale of courseLocalizationLocales) {
        const sourceLines = sourceSummary ? [sourceTitle, sourceSummary] : [sourceTitle]
        const result = await apiClient.translateLines(
          sourceLines,
          adminToken,
          'zh-CN',
          locale,
          750,
        )
        if (result.failedIndexes.length > 0 || !result.translations[0]?.trim()) {
          throw new Error(`${t(courseLocalizationLabels[locale])}${t('翻译失败')}`)
        }
        nextLocalizations[locale] = {
          ...nextLocalizations[locale],
          title: result.translations[0].trim(),
          // 默认摘要可留空；只有填写后才请求并覆盖该语言的摘要。
          ...(sourceSummary ? { summary: (result.translations[1] ?? '').trim() } : {}),
        }
      }
      onCourseFormChange((current) => ({ ...current, localizations: nextLocalizations }))
      onNotify(t('已生成英语、泰语和日语的课程标题与摘要'), 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('AI 多语言生成失败'), 'error')
    } finally {
      setIsGeneratingLocalizations(false)
    }
  }
  const currentMediaName = mediaFile?.name ||
    (courseForm.audioUrl ? courseForm.source.trim() || t('已加载媒体') : t('尚未选择媒体'))
  const currentMediaAddress = courseForm.audioUrl
    ? courseForm.audioUrl
    : mediaFile
      ? t('本地文件（上传完成后生成媒体地址）')
      : t('尚未生成媒体地址')
  const currentMediaTypeLabel = courseForm.mediaType === 'video' ? t('视频') : t('音频')
  const currentMediaStatusLabel = mediaUploadProgress
    ? t('正在上传')
    : courseForm.audioUrl
      ? mediaFile
        ? t('已上传，可重新选择替换')
        : t('已加载，可重新选择替换')
      : mediaFile
        ? t('本地预览，等待上传')
        : t('等待选择')
  const currentMediaSizeLabel =
    typeof mediaSize === 'number' && mediaSize > 0 ? formatFileSize(mediaSize) : t('未知')
  const mediaUploadLabel = mediaUploadProgress
    ? mediaUploadProgress.percent === 100
      ? t('文件已发送，正在等待服务器确认')
      : mediaUploadProgress.percent === null
        ? t('正在上传媒体')
        : `${t('正在上传媒体')} ${mediaUploadProgress.percent}%`
    : ''
  const mediaUploadSizeLabel = mediaUploadProgress?.total
    ? `${formatFileSize(Math.min(mediaUploadProgress.loaded, mediaUploadProgress.total))} / ${formatFileSize(mediaUploadProgress.total)}`
    : ''

  const selectedGroupId = useMemo(() => {
    const matchedEntry = categoriesByGroup.find(({ categories }) =>
      categories.some((category) => category.id === courseForm.categoryId),
    )
    return String(matchedEntry?.group.id ?? categoriesByGroup[0]?.group.id ?? '')
  }, [categoriesByGroup, courseForm.categoryId])

  const visibleCategories = useMemo(
    () =>
      categoriesByGroup.find((entry) => String(entry.group.id) === selectedGroupId)
        ?.categories ?? [],
    [categoriesByGroup, selectedGroupId],
  )

  useEffect(() => {
    if (visibleCategories.length === 0) {
      return
    }
    if (!visibleCategories.some((category) => category.id === courseForm.categoryId)) {
      onCourseFormChange((current) => ({
        ...current,
        categoryId: visibleCategories[0].id,
      }))
    }
  }, [courseForm.categoryId, onCourseFormChange, visibleCategories])

  const updateDuration = (duration: number) => {
    onCourseFormChange((current) => ({
      ...current,
      durationLabel: formatDurationLabel(duration),
    }))
  }

  const groupOptions: SelectOption[] = useMemo(
    () =>
      categoriesByGroup.map(({ group }) => ({
        value: String(group.id),
        label: group.name,
      })),
    [categoriesByGroup],
  )

  const categoryOptions: SelectOption[] = useMemo(
    () =>
      visibleCategories.map((cat) => ({
        value: String(cat.id),
        label: cat.name,
      })),
    [visibleCategories],
  )
  const isClipboardDialogOpen = clipboardPanel.mode !== 'hidden'
  const setMediaElement = useCallback(
    (element: HTMLMediaElement | null) => {
      logMediaDebug(element ? 'media-ref-attached' : 'media-ref-detached', {
        media: getMediaSnapshot(element),
      })
      mediaRef.current = element
    },
    [mediaRef],
  )

  const handleMediaError = useCallback(
    (event: SyntheticEvent<HTMLMediaElement>) => {
      logMediaDebug('native-media-error', {
        localMediaUrl,
        media: getMediaSnapshot(event.currentTarget),
        mediaType: courseForm.mediaType,
      })
    },
    [courseForm.mediaType, localMediaUrl],
  )

  // 连续播放预览只展示当前时间范围内的字幕，帮助审核者快速发现字幕提前消失或吞掉句尾的问题。
  // 逐句试听与波形上的开始/结束点编辑仍然是最终精确校准手段。
  const previewLine = previewLines.find(
    (line) =>
      line.text.trim() &&
      previewTime >= line.start &&
      previewTime < line.end,
  )

  const mediaReplaceControl = (
    <label className="file-drop media-replace-button">
      {courseForm.mediaType === 'video' ? (
        <FileVideo size={20} aria-hidden="true" />
      ) : (
        <FileAudio size={20} aria-hidden="true" />
      )}
      <span className="media-replace-text">
        <span className="media-replace-name" title={currentMediaName}>
          {currentMediaName}
        </span>
        <span className="media-file-address" title={currentMediaAddress}>
          {t('地址：')}{currentMediaAddress}
        </span>
        <span className="media-file-meta">
          {t('类型：')}{currentMediaTypeLabel} · {t('大小：')}{currentMediaSizeLabel}
        </span>
        <span className="media-file-status">{t('状态：')}{currentMediaStatusLabel}</span>
        {mediaUploadProgress && (
          <span className="media-upload-progress" aria-live="polite">
            <span>{mediaUploadLabel}</span>
            {mediaUploadSizeLabel && <span>{mediaUploadSizeLabel}</span>}
            <Progress
              percent={mediaUploadProgress.percent ?? 0}
              showInfo={false}
              size="small"
              status={mediaUploadProgress.percent === 100 ? 'active' : 'normal'}
            />
          </span>
        )}
      </span>
      <input
        accept="audio/*,video/*"
        disabled={isSubtitleContributor || isSaving || Boolean(mediaUploadProgress)}
        type="file"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
    </label>
  )

  const beginMediaEditorResize = (
    mode: MediaEditorResizeMode,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }
    event.preventDefault()
    resizeModeRef.current = mode
    setActiveResizeMode(mode)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const updateMediaEditorResize = (
    mode: MediaEditorResizeMode,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (resizeModeRef.current !== mode) {
      return
    }

    if (mode === 'columns') {
      const editorUpper = mediaEditorUpperRef.current
      if (!editorUpper) {
        return
      }
      const bounds = editorUpper.getBoundingClientRect()
      if (bounds.width <= 0) {
        return
      }

      const rawPercent = ((event.clientX - bounds.left) / bounds.width) * 100
      // 右侧编辑区保留至少约 300px；宽屏时限制最大比例，避免视频区把字幕区挤得过窄。
      const minimumPercent = Math.min(42, ((bounds.width - 360) / bounds.width) * 100)
      const maximumPercent = Math.min(78, ((bounds.width - 308) / bounds.width) * 100)
      const nextPercent = Math.min(
        Math.max(rawPercent, Math.max(28, minimumPercent)),
        Math.max(32, maximumPercent),
      )
      setVideoColumnPercent(Math.round(nextPercent))
      return
    }

    const workspace = mediaEditorWorkspaceRef.current
    if (!workspace) {
      return
    }
    const bounds = workspace.getBoundingClientRect()
    if (bounds.height <= 0) {
      return
    }

    const rawHeight = bounds.bottom - event.clientY
    const maximumHeight = Math.max(150, Math.min(360, bounds.height - 160))
    setWaveformHeight(Math.round(Math.min(Math.max(rawHeight, 140), maximumHeight)))
  }

  const finishMediaEditorResize = (
    mode: MediaEditorResizeMode,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (resizeModeRef.current !== mode) {
      return
    }
    resizeModeRef.current = null
    setActiveResizeMode(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleMediaEditorResizeKeyDown = (
    mode: MediaEditorResizeMode,
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    const step = event.shiftKey ? 5 : 2
    if (mode === 'columns' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault()
      setVideoColumnPercent((current) =>
        Math.min(78, Math.max(28, current + (event.key === 'ArrowRight' ? step : -step))),
      )
      return
    }
    if (mode === 'rows' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      setWaveformHeight((current) =>
        Math.min(360, Math.max(140, current + (event.key === 'ArrowUp' ? step * 4 : -step * 4))),
      )
    }
  }

  const mediaEditorWorkspaceStyle = {
    '--waveform-row-size': `${waveformHeight}px`,
  } as React.CSSProperties
  const mediaEditorUpperStyle = {
    // 用 fr 比例分配左右轨道，而不是把视频区写成百分比上限。
    // 百分比和字幕区的最小宽度叠加后，在窄 CSS 视口中可能把右侧轨道压成一条窄缝；
    // 两个 fr 值会在保留视频区/编辑区最小宽度的前提下，把剩余空间完整分配掉。
    '--video-column-size': `${videoColumnPercent}fr`,
    '--subtitle-column-size': `${100 - videoColumnPercent}fr`,
  } as React.CSSProperties

  return (
    <>
      <Drawer
        className="course-meta-drawer"
        title={t('课程信息')}
        placement="left"
        open={isCourseMetaOpen}
        width={380}
        onClose={() => setIsCourseMetaOpen(false)}
      >
        <section className="course-meta-panel">
          <fieldset
            className="form-grid compact-form-grid"
            disabled={isSubtitleContributor}
            style={{ border: 0, margin: 0, minInlineSize: 0, padding: 0 }}
          >
            <FieldSelect
              label={t('内容分类')}
              value={selectedGroupId}
              onValueChange={(value) => {
                const nextGroup = categoriesByGroup.find(
                  (entry) => String(entry.group.id) === value,
                )
                onCourseFormChange((current) => ({
                  ...current,
                  categoryId: nextGroup?.categories[0]?.id ?? 0,
                }))
              }}
              options={groupOptions}
              placeholder={groupOptions.length === 0 ? t('请先创建内容分类') : undefined}
            />

            <FieldSelect
              label={t('学习系列')}
              value={String(courseForm.categoryId)}
              onValueChange={(value) =>
                onCourseFormChange((current) => ({
                  ...current,
                  categoryId: Number(value),
                }))
              }
              options={categoryOptions}
              placeholder={categoryOptions.length === 0 ? t('请先创建学习系列') : undefined}
            />

            <label className="field">
              <span>{t('标题')}</span>
              <input
                placeholder={t('请输入课程标题')}
                value={courseForm.title}
                onChange={(event) =>
                  onCourseFormChange((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>

            <FieldSelect
              label={t('难度')}
              value={courseForm.difficulty}
              onValueChange={(value) =>
                onCourseFormChange((current) => ({
                  ...current,
                  difficulty: value as Difficulty,
                }))
              }
              options={[
                { value: 'beginner', label: t('入门') },
                { value: 'intermediate', label: t('进阶') },
                { value: 'advanced', label: t('高阶') },
              ]}
            />

            <label className="field">
              <span>{t('时长')}</span>
              <input
                placeholder={t('上传媒体后自动读取')}
                value={courseForm.durationLabel}
                onChange={(event) =>
                  onCourseFormChange((current) => ({
                    ...current,
                    durationLabel: event.target.value,
                  }))
                }
              />
            </label>

            <div className="field wide media-meta-field">
              <span>{t('媒体文件')}</span>
              {mediaReplaceControl}
            </div>

            <FieldSelect
              label={t('状态')}
              value={courseForm.status}
              onValueChange={(value) =>
                onCourseFormChange((current) => ({
                  ...current,
                  status: value as CreateExerciseRequest['status'],
                }))
              }
              options={[
                { value: 'draft', label: t('草稿') },
                ...(courseForm.status === 'proofread' ? [{ value: 'proofread', label: t('已校对') }] : []),
                ...(courseForm.status === 'published' ? [{ value: 'published', label: t('已发布') }] : []),
                ...(courseForm.status === 'archived' ? [{ value: 'archived', label: t('已归档') }] : []),
              ]}
            />

            {isSubtitleContributor && (
              <div className="field wide">
                <small>{t('“保存校对草稿”只保存给你自己，不影响学习端；确认完成后请点“提交校对”，由超级管理员二次审核。课程元数据与媒体仅由超级管理员维护。')}</small>
              </div>
            )}

            <label className="field">
              <span>{t('来源')}</span>
              <input
                placeholder={t('默认使用真实媒体导入')}
                value={courseForm.source}
                onChange={(event) =>
                  onCourseFormChange((current) => ({
                    ...current,
                    source: event.target.value,
                  }))
                }
              />
            </label>

            <label className="field wide">
              <span>{t('来源链接（可选）')}</span>
              <input
                placeholder="https://example.com/original-material"
                type="url"
                value={courseForm.sourceUrl ?? ''}
                onChange={(event) =>
                  onCourseFormChange((current) => ({
                    ...current,
                    sourceUrl: event.target.value,
                  }))
                }
              />
            </label>

            <label className="field wide">
              <span>{t('摘要')}</span>
              <textarea
                className="cover-summary-textarea"
                placeholder={t('可留空，系统会自动补默认摘要')}
                rows={4}
                value={courseForm.summary}
                onChange={(event) =>
                  onCourseFormChange((current) => ({
                    ...current,
                    summary: event.target.value,
                  }))
                }
              />
            </label>

            <FieldSelect
              label={t('本地化内容语言')}
              value={localizationLocale}
              onValueChange={(value) => setLocalizationLocale(value as ContentLocale)}
              options={[
                { value: 'en-US', label: 'English' },
                { value: 'th-TH', label: 'ไทย' },
                { value: 'ja-JP', label: '日本語' },
              ]}
            />
            <div className="field course-localization-ai-action">
              <span>{t('AI 多语言')}</span>
              <button
                className="mini-command secondary"
                disabled={isSaving || isGeneratingLocalizations || !courseForm.title.trim()}
                onClick={() => void generateCourseLocalizations()}
                type="button"
              >
                <Sparkles size={14} aria-hidden="true" />
                {isGeneratingLocalizations ? t('生成中…') : t('AI 填充全部语言')}
              </button>
              <small>{t('以默认中文标题和摘要为翻译源')}</small>
            </div>
            <label className="field">
              <span>{t('本地化标题')}</span>
              <input
                placeholder={t('留空时学习端使用默认标题')}
                value={localizedContent.title ?? ''}
                onChange={(event) => updateLocalizedContent({ title: event.target.value })}
              />
            </label>
            <label className="field wide">
              <span>{t('本地化摘要')}</span>
              <textarea
                className="cover-summary-textarea"
                placeholder={t('留空时学习端使用默认摘要')}
                rows={3}
                value={localizedContent.summary ?? ''}
                onChange={(event) => updateLocalizedContent({ summary: event.target.value })}
              />
            </label>

            <label className="field wide">
              <span>{t('课程封面')}</span>
              <CoverImageField
                adminToken={adminToken}
                label={t('课程封面')}
                value={courseForm.coverImageUrl ?? ''}
                // 视频仅在弹窗内由浏览器解码；截帧图片仍走 CoverImageField 既有的前端压缩上传。
                videoSourceUrl={courseForm.mediaType === 'video' ? localMediaUrl : undefined}
                disabled={isSaving}
                onChange={(url) =>
                  onCourseFormChange((current) => ({
                    ...current,
                    coverImageUrl: url,
                  }))
                }
                onNotify={onNotify}
              />
            </label>
          </fieldset>
        </section>
      </Drawer>

      <div className="import-main">
        {/* 顶部工具栏：课程标题、基础信息入口和保存按钮 */}
        <div className="import-main-toolbar">
          <div className="import-main-title-group">
            <strong className="import-main-title">
              {courseForm.title.trim() || t('未填写标题')}
            </strong>
            <Button
              className="course-meta-trigger"
              icon={<FolderTree size={15} aria-hidden="true" />}
              size="small"
              title={t('编辑课程基础信息')}
              type="text"
              onClick={() => setIsCourseMetaOpen(true)}
            >
              {t('基础信息')}
            </Button>
          </div>
          <div className="import-main-toolbar-actions">
            <button
              className="command-button secondary subtitle-import-trigger"
              onClick={() => setIsSubtitleImporterOpen(true)}
              type="button"
            >
              <FileText size={16} aria-hidden="true" />
              {t('字幕导入 / 导出')}
            </button>
            <button
              className="command-button meta-save-command"
              disabled={isSaving || Boolean(saveDisabledReason)}
              onClick={onSaveLesson}
              title={saveDisabledReason}
              type="button"
            >
              <Save size={16} aria-hidden="true" />
              {isSaving ? t('保存中') : isSubtitleContributor ? t('保存校对草稿') : t('保存')}
            </button>
            {isSubtitleContributor && onSubmitSubtitleDraft && (
              <button
                className="command-button meta-save-command"
                disabled={isSaving || Boolean(saveDisabledReason)}
                onClick={onSubmitSubtitleDraft}
                title={saveDisabledReason}
                type="button"
              >
                <Send size={16} aria-hidden="true" />
                {t('提交校对')}
              </button>
            )}
          </div>
        </div>

        <Drawer
          className="subtitle-import-drawer"
          title={t('字幕导入 / 导出')}
          placement="right"
          open={isSubtitleImporterOpen}
          width={560}
          onClose={() => setIsSubtitleImporterOpen(false)}
        >
          {subtitleImporter}
        </Drawer>

        <div
          ref={mediaEditorWorkspaceRef}
          className={activeResizeMode ? 'media-editor-workspace is-resizing' : 'media-editor-workspace'}
          style={mediaEditorWorkspaceStyle}
        >
          <div
            ref={mediaEditorUpperRef}
            className="media-editor-upper"
            style={mediaEditorUpperStyle}
          >
            <div className="media-editor-video-column">
              {localMediaUrl &&
                (courseForm.mediaType === 'video' ? (
                  <div className="video-preview-stage">
                    <video
                      ref={setMediaElement}
                      className="media-player video-player"
                      controls
                      playsInline
                      src={localMediaUrl}
                      onError={handleMediaError}
                      onTimeUpdate={(event) => setPreviewTime(event.currentTarget.currentTime)}
                      onLoadedMetadata={(event) => {
                        setPreviewTime(event.currentTarget.currentTime)
                        updateDuration(event.currentTarget.duration)
                      }}
                    />
                    {previewLine && (
                      <div className="video-subtitle-preview" aria-live="polite">
                        <strong>{previewLine.text}</strong>
                        {previewLine.translations['zh-CN'] && (
                          <span>{previewLine.translations['zh-CN']}</span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <audio
                    ref={setMediaElement}
                    className="media-player audio-player"
                    controls
                    src={localMediaUrl}
                    onError={handleMediaError}
                    onTimeUpdate={(event) => setPreviewTime(event.currentTarget.currentTime)}
                    onLoadedMetadata={(event) => updateDuration(event.currentTarget.duration)}
                  />
                ))}
            </div>
            <div
              aria-label={t('调整视频区与字幕编辑区宽度')}
              aria-orientation="vertical"
              aria-valuemax={78}
              aria-valuemin={28}
              aria-valuenow={videoColumnPercent}
              className={activeResizeMode === 'columns'
                ? 'media-editor-resizer media-editor-resizer-vertical active'
                : 'media-editor-resizer media-editor-resizer-vertical'}
              role="separator"
              tabIndex={0}
              onKeyDown={(event) => handleMediaEditorResizeKeyDown('columns', event)}
              onPointerDown={(event) => beginMediaEditorResize('columns', event)}
              onPointerMove={(event) => updateMediaEditorResize('columns', event)}
              onPointerUp={(event) => finishMediaEditorResize('columns', event)}
              onPointerCancel={(event) => finishMediaEditorResize('columns', event)}
            />
            {subtitleEditor}
          </div>
          <div
            aria-label={t('调整上方工作区与波形区高度')}
            aria-orientation="horizontal"
            aria-valuemax={360}
            aria-valuemin={140}
            aria-valuenow={waveformHeight}
            className={activeResizeMode === 'rows'
              ? 'media-editor-resizer media-editor-resizer-horizontal active'
              : 'media-editor-resizer media-editor-resizer-horizontal'}
            role="separator"
            tabIndex={0}
            onKeyDown={(event) => handleMediaEditorResizeKeyDown('rows', event)}
            onPointerDown={(event) => beginMediaEditorResize('rows', event)}
            onPointerMove={(event) => updateMediaEditorResize('rows', event)}
            onPointerUp={(event) => finishMediaEditorResize('rows', event)}
            onPointerCancel={(event) => finishMediaEditorResize('rows', event)}
          />
          <div className="media-editor-timeline">
            {waveform}
          </div>
        </div>

        {statusBar}
      </div>

      <Drawer
        className="dltjson-drawer"
        title={
          clipboardPanel.mode === 'copy'
            ? (clipboardPanel.label ?? t('复制 dltjson'))
            : t('粘贴 dltjson')
        }
        placement="right"
        open={isClipboardDialogOpen}
        width={520}
        onClose={() => onClipboardPanelChange({ mode: 'hidden' })}
      >

            <textarea
              className="dltjson-manual-textarea"
              readOnly={clipboardPanel.mode === 'copy'}
              rows={12}
              value={clipboardPanel.mode === 'hidden' ? '' : clipboardPanel.content}
              onChange={(event) =>
                onClipboardPanelChange((current) =>
                  current.mode === 'hidden'
                    ? current
                    : {
                        ...current,
                        content: event.target.value,
                      },
                )
              }
              onFocus={(event) => {
                if (clipboardPanel.mode === 'copy') {
                  event.currentTarget.select()
                }
              }}
              placeholder={
                clipboardPanel.mode === 'copy'
                  ? ''
                  : t('把 dltjson 内容粘贴到这里，然后点击“导入粘贴内容”')
              }
            />

        <div className="dltjson-dialog-actions">
          {clipboardPanel.mode === 'paste' ? (
            <button className="mini-command" onClick={onManualDltjsonImport} type="button">
              {t('导入粘贴内容')}
            </button>
          ) : (
            <span className="dltjson-dialog-hint">{t('点击文本框可全选后手动复制')}</span>
          )}
        </div>
      </Drawer>
    </>
  )
}
