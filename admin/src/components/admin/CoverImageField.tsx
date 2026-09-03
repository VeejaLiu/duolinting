import { Camera, Clipboard, ImagePlus, LoaderCircle, Upload } from 'lucide-react'
import { Modal, Progress } from 'antd'
import { useMemo, useRef, useState, type ClipboardEvent } from 'react'
import type { AdminNoticeTone } from './AdminFeedback'
import {
  apiClient,
  resolveApiUrl,
  type FileUploadProgress,
} from '../../lib/apiClient'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type CoverImageFieldProps = {
  adminToken: string
  label: string
  value: string
  /** 已加载视频仅在浏览器中解码，用于截取当前画面；不经过任何新增后端处理。 */
  videoSourceUrl?: string
  disabled?: boolean
  largePreview?: boolean
  onChange: (url: string) => void
  onNotify: (message: string, tone?: AdminNoticeTone) => void
}

const toImageFile = (file: File) =>
  file.type.startsWith('image/') ? file : null

// 封面在浏览器内统一输出为 JPEG；尺寸与此前服务端规则保持一致，
// 避免大图先完整占用上行带宽、再由服务端压缩丢弃。若以后要保留原图，再另设上传路径。
const COVER_IMAGE_MAX_WIDTH = 120
const COVER_IMAGE_JPEG_QUALITY = 0.8

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const compressCoverImage = async (file: File) => {
  let image: ImageBitmap
  try {
    // createImageBitmap 解码时会读取图片自身方向，适合手机拍摄的封面。
    image = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (error) {
    throw new Error(
      error instanceof Error ? `无法读取图片：${error.message}` : '无法读取图片',
      { cause: error },
    )
  }

  try {
    const width = Math.min(image.width, COVER_IMAGE_MAX_WIDTH)
    const height = Math.max(1, Math.round((image.height / image.width) * width))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('当前浏览器无法处理图片')
    }
    context.drawImage(image, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', COVER_IMAGE_JPEG_QUALITY),
    )
    if (!blob) {
      throw new Error('图片压缩失败')
    }
    return new File([blob], 'cover.jpg', { type: 'image/jpeg' })
  } finally {
    image.close()
  }
}

const inferExtension = (contentType: string) => {
  if (contentType === 'image/jpeg') {
    return 'jpg'
  }
  if (contentType === 'image/png') {
    return 'png'
  }
  if (contentType === 'image/webp') {
    return 'webp'
  }
  if (contentType === 'image/gif') {
    return 'gif'
  }
  if (contentType === 'image/avif') {
    return 'avif'
  }
  return 'img'
}

const fileNameFromUrl = (urlText: string, contentType: string) => {
  try {
    const url = new URL(urlText)
    const lastPath = url.pathname.split('/').filter(Boolean).pop()
    if (lastPath && lastPath.includes('.')) {
      return lastPath
    }
  } catch {
    return `remote-cover.${inferExtension(contentType)}`
  }
  return `remote-cover.${inferExtension(contentType)}`
}

export function CoverImageField({
  adminToken,
  label,
  value,
  videoSourceUrl,
  disabled,
  largePreview,
  onChange,
  onNotify,
}: CoverImageFieldProps) {
  const { t } = useAdminLanguage()
  const [isPreparing, setIsPreparing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [uploadProgress, setUploadProgress] =
    useState<FileUploadProgress | null>(null)
  const [isFrameCaptureOpen, setIsFrameCaptureOpen] = useState(false)
  const [captureDuration, setCaptureDuration] = useState(0)
  const [captureTime, setCaptureTime] = useState(0)
  const [capturedFrame, setCapturedFrame] = useState<File | null>(null)
  const [capturedFrameUrl, setCapturedFrameUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const captureVideoRef = useRef<HTMLVideoElement | null>(null)

  const previewClassName = useMemo(
    () => `cover-thumb${largePreview ? ' large' : ''}`,
    [largePreview],
  )

  const isBusy = isPreparing || isUploading || isImporting

  const discardCapturedFrame = () => {
    if (capturedFrameUrl) {
      URL.revokeObjectURL(capturedFrameUrl)
    }
    setCapturedFrame(null)
    setCapturedFrameUrl('')
  }

  const closeFrameCapture = () => {
    setIsFrameCaptureOpen(false)
    setCaptureDuration(0)
    setCaptureTime(0)
    discardCapturedFrame()
  }

  const openFrameCapture = () => {
    if (!videoSourceUrl) return
    discardCapturedFrame()
    setCaptureDuration(0)
    setCaptureTime(0)
    setIsFrameCaptureOpen(true)
  }

  const seekCaptureVideo = (nextTime: number) => {
    const video = captureVideoRef.current
    if (!video || !Number.isFinite(nextTime)) return
    // 不直接依赖 input 的精度；浏览器会在 seeked 后呈现最接近的可解码视频帧。
    video.currentTime = Math.min(Math.max(nextTime, 0), Math.max(video.duration || 0, 0))
    setCaptureTime(nextTime)
  }

  const captureCurrentVideoFrame = async () => {
    const video = captureVideoRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      onNotify('视频画面尚未准备好，请稍候重试', 'error')
      return
    }
    if (!video.videoWidth || !video.videoHeight) {
      onNotify('无法读取视频画面尺寸', 'error')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      onNotify('当前浏览器无法采集视频画面', 'error')
      return
    }

    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('视频帧转换为图片失败')
      const frame = new File([blob], `video-frame-${Math.round(video.currentTime * 1000)}ms.png`, { type: 'image/png' })
      if (capturedFrameUrl) URL.revokeObjectURL(capturedFrameUrl)
      setCapturedFrame(frame)
      setCapturedFrameUrl(URL.createObjectURL(frame))
    } catch (error) {
      // 跨域视频若未允许 Canvas 读取，浏览器会在导出时阻止；给出可操作的说明而非静默失败。
      onNotify(error instanceof Error ? `采集视频帧失败：${error.message}` : '采集视频帧失败', 'error')
    }
  }

  const uploadCapturedFrame = async () => {
    if (!capturedFrame) return
    const uploaded = await uploadFile(capturedFrame, '已采集视频帧并上传为封面')
    if (uploaded) closeFrameCapture()
  }

  const uploadFile = async (file: File | null, successMessage: string): Promise<boolean> => {
    const imageFile = file ? toImageFile(file) : null
    if (!imageFile) {
      onNotify('请选择图片文件', 'error')
      return false
    }
    setIsPreparing(true)
    try {
      const compressedImage = await compressCoverImage(imageFile)
      setIsPreparing(false)
      setIsUploading(true)
      // 进度按实际发送给服务端的压缩文件计算，不再显示原图字节数。
      setUploadProgress({
        loaded: 0,
        total: compressedImage.size || null,
        percent: 0,
      })
      const uploaded = await apiClient.uploadImage(
        compressedImage,
        adminToken,
        setUploadProgress,
      )
      onChange(uploaded.publicUrl)
      onNotify(successMessage, 'success')
      return true
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '封面上传失败', 'error')
      return false
    } finally {
      setIsPreparing(false)
      setIsUploading(false)
      setUploadProgress(null)
    }
  }

  const importRemoteUrl = async () => {
    const nextUrl = value.trim()
    if (!nextUrl) {
      onNotify('请输入图片地址', 'error')
      return
    }
    setIsImporting(true)
    try {
      // 远程地址先由浏览器取回，之后才开始能计算百分比的上传阶段。
      onNotify('正在获取远程图片...', 'info')
      const response = await fetch(resolveApiUrl(nextUrl))
      if (!response.ok) {
        throw new Error(`远程图片获取失败: ${response.status}`)
      }
      const contentType = response.headers.get('content-type')?.split(';')[0] ?? ''
      if (!contentType.startsWith('image/')) {
        throw new Error('远程地址不是图片资源')
      }
      const blob = await response.blob()
      if (!blob.size) {
        throw new Error('远程图片内容为空')
      }
      const imageFile = new File(
        [blob],
        fileNameFromUrl(nextUrl, contentType),
        {
          type: contentType || blob.type || 'image/*',
        },
      )
      setIsPreparing(true)
      const compressedImage = await compressCoverImage(imageFile)
      setIsPreparing(false)
      setIsUploading(true)
      setUploadProgress({
        loaded: 0,
        total: compressedImage.size || null,
        percent: 0,
      })
      const uploaded = await apiClient.uploadImage(
        compressedImage,
        adminToken,
        setUploadProgress,
      )
      onChange(uploaded.publicUrl)
      onNotify('已抓取远程图片并上传', 'success')
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : '远程图片抓取失败',
        'error',
      )
    } finally {
      setIsImporting(false)
      setIsPreparing(false)
      setIsUploading(false)
      setUploadProgress(null)
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (disabled || isBusy) return
    const items = Array.from(event.clipboardData.items)
    const imageItem = items.find((item) => item.type.startsWith('image/'))
    const file = imageItem?.getAsFile()
    if (file) {
      event.preventDefault()
      void uploadFile(file, '已从剪贴板上传封面')
    }
  }

  return (
    <div
      className="cover-image-field"
      onPaste={handlePaste}
      role="group"
      aria-label={label}
    >
      {/* 第一行：URL 输入 + 抓取按钮，并排 */}
      <div className="cover-url-row">
        <input
          className="cover-url-input"
          placeholder={t('粘贴图片 URL')}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || isBusy}
        />
        <button
          className="mini-command secondary"
          disabled={disabled || isBusy}
          onClick={importRemoteUrl}
          type="button"
          title={t('从 URL 抓取并上传')}
        >
          {isImporting || isPreparing ? (
            <LoaderCircle size={14} aria-hidden="true" className="spin" />
          ) : (
            <ImagePlus size={14} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* 两个本地封面操作各占一整行，窄侧栏中也不会拆开中文按钮文字。 */}
      <div className="cover-upload-row">
        <button
          className="mini-command secondary"
          disabled={disabled || isBusy}
          onClick={() => fileInputRef.current?.click()}
          type="button"
          title={t('上传图片')}
        >
          {isPreparing || isUploading ? (
            <LoaderCircle size={14} aria-hidden="true" className="spin" />
          ) : (
            <Upload size={14} aria-hidden="true" />
          )}
          {t('上传图片')}
        </button>
      </div>
      {videoSourceUrl && (
        <div className="cover-upload-row">
          <button
            className="mini-command secondary"
            disabled={disabled || isBusy}
            onClick={openFrameCapture}
            type="button"
          >
            <Camera size={14} aria-hidden="true" />
            {t('采集视频帧')}
          </button>
        </div>
      )}

      {(isImporting || isPreparing || uploadProgress) && (
        <div className="cover-upload-progress" aria-live="polite">
          <span>
            {isImporting && !isUploading
              ? t('正在获取远程图片…')
              : isPreparing
                ? t('正在压缩封面图片…')
              : uploadProgress?.percent === 100
                ? t('图片已发送，正在等待服务器确认…')
                : uploadProgress?.percent === null || uploadProgress === null
                  ? t('正在上传图片…')
                  : `${t('正在上传图片')} ${uploadProgress.percent}%`}
          </span>
          {uploadProgress?.total && (
            <span>
              {formatFileSize(Math.min(uploadProgress.loaded, uploadProgress.total))}
              {' / '}
              {formatFileSize(uploadProgress.total)}
            </span>
          )}
          {uploadProgress && (
            <Progress
              percent={uploadProgress.percent ?? 0}
              showInfo={false}
              size="small"
              status={uploadProgress.percent === 100 ? 'active' : 'normal'}
            />
          )}
        </div>
      )}

      <p className="cover-field-hint">
        <Clipboard size={12} aria-hidden="true" />
        {t('支持粘贴图片或截图')}
      </p>

      {value ? (
        <img
          alt={`${label}${t('预览')}`}
          className={previewClassName}
          src={resolveApiUrl(value)}
        />
      ) : null}

      <input
        ref={fileInputRef}
        accept="image/*"
        className="cover-file-input"
        disabled={disabled || isBusy}
        type="file"
        onChange={(event) => {
          void uploadFile(event.target.files?.[0] ?? null, '封面已上传')
          event.currentTarget.value = ''
        }}
      />

      <Modal
        afterClose={discardCapturedFrame}
        className="cover-frame-capture-modal"
        destroyOnHidden
        footer={null}
        onCancel={closeFrameCapture}
        open={isFrameCaptureOpen}
        title={t('从视频采集封面')}
        width={760}
      >
        <div className="cover-frame-capture">
          <p>{t('仅在当前浏览器读取视频画面。确认后会沿用现有的前端压缩与上传流程。')}</p>
          <video
            ref={captureVideoRef}
            className="cover-frame-capture-video"
            controls
            crossOrigin="anonymous"
            muted
            playsInline
            preload="metadata"
            src={resolveApiUrl(videoSourceUrl ?? '')}
            onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration
              if (Number.isFinite(duration) && duration > 0) {
                setCaptureDuration(duration)
                seekCaptureVideo(0)
              }
            }}
            onSeeked={(event) => setCaptureTime(event.currentTarget.currentTime)}
          />
          <label className="cover-frame-capture-timeline">
            <span>{t('定位画面：{{time}} 秒', { time: captureTime.toFixed(1) })}</span>
            <input
              disabled={captureDuration <= 0}
              max={captureDuration}
              min={0}
              onChange={(event) => seekCaptureVideo(Number(event.target.value))}
              step={0.1}
              type="range"
              value={Math.min(captureTime, captureDuration)}
            />
          </label>
          <div className="cover-frame-capture-actions">
            <button className="mini-command secondary" onClick={() => void captureCurrentVideoFrame()} type="button">
              <Camera size={14} aria-hidden="true" />
              {t('采集当前帧')}
            </button>
            <button className="mini-command" disabled={!capturedFrame || isBusy} onClick={() => void uploadCapturedFrame()} type="button">
              {t('使用此帧作为封面')}
            </button>
          </div>
          {capturedFrameUrl && (
            <div className="cover-frame-capture-preview">
              <span>{t('待上传封面（会在浏览器内压缩）')}</span>
              <img alt={t('采集的视频封面预览')} src={capturedFrameUrl} />
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
