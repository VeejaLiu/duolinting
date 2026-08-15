import * as Dialog from '@radix-ui/react-dialog'
import * as Select from '@radix-ui/react-select'
import { Progress } from 'antd'
import {
  Check,
  ChevronDown,
  Clipboard,
  ClipboardPaste,
  Download,
  FileAudio,
  FileVideo,
  FolderTree,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Upload,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
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
import type { FileUploadProgress } from '../../lib/apiClient'
import { formatDurationLabel } from '../../lib/mediaDraftTools'

type ClipboardPanelState =
  | { mode: 'hidden' }
  | { mode: 'copy'; content: string }
  | { mode: 'paste'; content: string }

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
  isSidebarCollapsed: boolean
  saveDisabledReason?: string
  localMediaUrl: string
  mediaSize: number | null
  mediaFile: File | null
  mediaUploadProgress: FileUploadProgress | null
  mediaRef: React.MutableRefObject<HTMLMediaElement | null>
  statusBar?: ReactNode
  subtitleImporter?: ReactNode
  waveform?: ReactNode
  onCourseFormChange: React.Dispatch<React.SetStateAction<CreateExerciseRequest>>
  clipboardPanel: ClipboardPanelState
  onClipboardPanelChange: React.Dispatch<React.SetStateAction<ClipboardPanelState>>
  onHtjsonCopy: () => void
  onHtjsonExport: () => void
  onHtjsonImport: (file: File) => void
  onHtjsonPaste: () => void
  onManualHtjsonImport: () => void
  onNotify: (message: string, tone?: AdminNoticeTone) => void
  onFileChange: (file: File | null) => void
  onSaveLesson: () => void
  onToggleSidebar: () => void
}

/* ── 通用 Radix Select 封装 ── */
type SelectOption = { value: string; label: string }

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
  isSidebarCollapsed,
  saveDisabledReason,
  localMediaUrl,
  mediaSize,
  mediaFile,
  mediaUploadProgress,
  mediaRef,
  statusBar,
  subtitleImporter,
  waveform,
  onCourseFormChange,
  clipboardPanel,
  onClipboardPanelChange,
  onHtjsonCopy,
  onHtjsonExport,
  onHtjsonImport,
  onHtjsonPaste,
  onManualHtjsonImport,
  onNotify,
  onFileChange,
  onSaveLesson,
  onToggleSidebar,
}: MediaCourseFormProps) {
  const [localizationLocale, setLocalizationLocale] = useState<ContentLocale>('en-US')
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
  const currentMediaLabel = mediaFile
    ? courseForm.mediaType === 'video' ? '新上传视频' : '新上传音频'
    : localMediaUrl
      ? '当前媒体已加载，可重新选择替换'
      : '选择一段真实音频或视频'
  const currentMediaSizeLabel =
    typeof mediaSize === 'number' && mediaSize > 0 ? formatFileSize(mediaSize) : ''
  const mediaUploadLabel = mediaUploadProgress
    ? mediaUploadProgress.percent === 100
      ? '文件已发送，正在等待服务器确认'
      : mediaUploadProgress.percent === null
        ? '正在上传媒体'
        : `正在上传媒体 ${mediaUploadProgress.percent}%`
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

  return (
    <>
      <aside
        className={
          isSidebarCollapsed
            ? 'import-meta-sidebar collapsed'
            : 'import-meta-sidebar'
        }
        aria-label="课程元数据"
      >
        {isSidebarCollapsed ? (
          // 折叠态：只渲染一条窄图标轨，主编辑区占满剩余横向空间。
          <button
            className="sidebar-rail-toggle"
            onClick={onToggleSidebar}
            title="展开课程信息"
            type="button"
          >
            <PanelLeftOpen size={16} aria-hidden="true" />
          </button>
        ) : (
        <section className="course-meta-panel">
          <div className="course-meta-header">
            <span className="course-meta-title">
              <FolderTree size={16} aria-hidden="true" />
              <strong>课程信息</strong>
            </span>
            <button
              className="sidebar-collapse-toggle"
              onClick={onToggleSidebar}
              title="折叠课程信息，腾出横向空间"
              type="button"
            >
              <PanelLeftClose size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="form-grid compact-form-grid">
            <FieldSelect
              label="内容分类"
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
              placeholder={groupOptions.length === 0 ? '请先创建内容分类' : undefined}
            />

            <FieldSelect
              label="学习系列"
              value={String(courseForm.categoryId)}
              onValueChange={(value) =>
                onCourseFormChange((current) => ({
                  ...current,
                  categoryId: Number(value),
                }))
              }
              options={categoryOptions}
              placeholder={categoryOptions.length === 0 ? '请先创建学习系列' : undefined}
            />

            <label className="field">
              <span>标题</span>
              <input
                placeholder="请输入课程标题"
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
              label="难度"
              value={courseForm.difficulty}
              onValueChange={(value) =>
                onCourseFormChange((current) => ({
                  ...current,
                  difficulty: value as Difficulty,
                }))
              }
              options={[
                { value: 'beginner', label: '入门' },
                { value: 'intermediate', label: '进阶' },
                { value: 'advanced', label: '高阶' },
              ]}
            />

            <label className="field">
              <span>时长</span>
              <input
                placeholder="上传媒体后自动读取"
                value={courseForm.durationLabel}
                onChange={(event) =>
                  onCourseFormChange((current) => ({
                    ...current,
                    durationLabel: event.target.value,
                  }))
                }
              />
            </label>

            <FieldSelect
              label="状态"
              value={courseForm.status}
              onValueChange={(value) =>
                onCourseFormChange((current) => ({
                  ...current,
                  status: value as CreateExerciseRequest['status'],
                }))
              }
              options={[
                { value: 'draft', label: '草稿' },
                { value: 'published', label: '发布' },
              ]}
            />

            <label className="field">
              <span>来源</span>
              <input
                placeholder="默认使用真实媒体导入"
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
              <span>摘要</span>
              <textarea
                className="cover-summary-textarea"
                placeholder="可留空，系统会自动补默认摘要"
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
              label="本地化内容语言"
              value={localizationLocale}
              onValueChange={(value) => setLocalizationLocale(value as ContentLocale)}
              options={[
                { value: 'en-US', label: 'English' },
                { value: 'th-TH', label: 'ไทย' },
                { value: 'ja-JP', label: '日本語' },
              ]}
            />
            <label className="field">
              <span>本地化标题</span>
              <input
                placeholder="留空时学习端使用默认标题"
                value={localizedContent.title ?? ''}
                onChange={(event) => updateLocalizedContent({ title: event.target.value })}
              />
            </label>
            <label className="field wide">
              <span>本地化摘要</span>
              <textarea
                className="cover-summary-textarea"
                placeholder="留空时学习端使用默认摘要"
                rows={3}
                value={localizedContent.summary ?? ''}
                onChange={(event) => updateLocalizedContent({ summary: event.target.value })}
              />
            </label>

            <label className="field wide">
              <span>课程封面</span>
              <CoverImageField
                adminToken={adminToken}
                label="课程封面"
                value={courseForm.coverImageUrl ?? ''}
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
          </div>
        </section>
        )}
      </aside>

      <div className="import-main">
        {/* 顶部工具栏：课程标题 + 保存按钮，侧栏折叠后也始终可见 */}
        <div className="import-main-toolbar">
          <strong className="import-main-title">
            {courseForm.title.trim() || '未填写标题'}
          </strong>
          <button
            className="command-button meta-save-command"
            disabled={isSaving || Boolean(saveDisabledReason)}
            onClick={onSaveLesson}
            title={saveDisabledReason}
            type="button"
          >
            <Save size={16} aria-hidden="true" />
            {isSaving ? '保存中' : '保存'}
          </button>
        </div>

        <div className="media-preview-row">
          <label className="file-drop media-replace-button">
            {courseForm.mediaType === 'video' ? (
              <FileVideo size={24} aria-hidden="true" />
            ) : (
              <FileAudio size={24} aria-hidden="true" />
            )}
            <span className="media-replace-text">
              <span className="media-replace-name">{currentMediaLabel}</span>
              {currentMediaSizeLabel && (
                <span className="media-file-size">{currentMediaSizeLabel}</span>
              )}
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
              disabled={isSaving || Boolean(mediaUploadProgress)}
              type="file"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            />
          </label>

          {localMediaUrl &&
            (courseForm.mediaType === 'video' ? (
              <video
                ref={setMediaElement}
                className="media-player video-player"
                controls
                playsInline
                src={localMediaUrl}
                onError={handleMediaError}
                onLoadedMetadata={(event) => updateDuration(event.currentTarget.duration)}
              />
            ) : (
              <audio
                ref={setMediaElement}
                className="media-player audio-player"
                controls
                src={localMediaUrl}
                onError={handleMediaError}
                onLoadedMetadata={(event) => updateDuration(event.currentTarget.duration)}
              />
            ))}
        </div>

        <div className="media-sync-stack">
          {waveform}
          {subtitleImporter}
        </div>

        <div className="workbench-bottom-actions">
          <div className="htjson-actions">
            <button
              className="mini-command secondary"
              onClick={onHtjsonCopy}
              type="button"
              title="复制 htjson 到剪切板，不支持时会打开手动复制面板"
            >
              <Clipboard size={14} aria-hidden="true" />
              复制 htjson
            </button>
            <button
              className="mini-command secondary"
              onClick={onHtjsonPaste}
              type="button"
              title="打开 htjson 粘贴输入框"
            >
              <ClipboardPaste size={14} aria-hidden="true" />
              粘贴 htjson
            </button>
            <button
              className="mini-command"
              onClick={onHtjsonExport}
              type="button"
              title="导出为 htjson 文件"
            >
              <Download size={14} aria-hidden="true" />
              导出 htjson
            </button>
            <label className="mini-command file-label">
              <Upload size={14} aria-hidden="true" />
              导入 htjson
              <input
                accept=".htjson,.json"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    onHtjsonImport(file)
                    event.target.value = ''
                  }
                }}
              />
            </label>
          </div>
        </div>

        {statusBar}
      </div>

      <Dialog.Root
        open={isClipboardDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            onClipboardPanelChange({ mode: 'hidden' })
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="htjson-dialog-overlay" />
          <Dialog.Content className="htjson-dialog-content">
            <div className="htjson-dialog-header">
              <Dialog.Title className="htjson-dialog-title">
                {clipboardPanel.mode === 'copy' ? '复制 htjson' : '粘贴 htjson'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button className="mini-command secondary" type="button">
                  关闭
                </button>
              </Dialog.Close>
            </div>

            <textarea
              className="htjson-manual-textarea"
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
                  : '把 htjson 内容粘贴到这里，然后点击“导入粘贴内容”'
              }
            />

            <div className="htjson-dialog-actions">
              {clipboardPanel.mode === 'paste' ? (
                <button className="mini-command" onClick={onManualHtjsonImport} type="button">
                  导入粘贴内容
                </button>
              ) : (
                <span className="htjson-dialog-hint">点击文本框可全选后手动复制</span>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
