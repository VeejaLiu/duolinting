import { Clipboard, ImagePlus, LoaderCircle, Upload } from 'lucide-react'
import { useMemo, useRef, useState, type ClipboardEvent } from 'react'
import type { AdminNoticeTone } from './AdminFeedback'
import { apiClient, resolveApiUrl } from '../../lib/apiClient'

type CoverImageFieldProps = {
  adminToken: string
  label: string
  value: string
  disabled?: boolean
  largePreview?: boolean
  onChange: (url: string) => void
  onNotify: (message: string, tone?: AdminNoticeTone) => void
}

const toImageFile = (file: File) =>
  file.type.startsWith('image/') ? file : null

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
  disabled,
  largePreview,
  onChange,
  onNotify,
}: CoverImageFieldProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const previewClassName = useMemo(
    () => `cover-thumb${largePreview ? ' large' : ''}`,
    [largePreview],
  )

  const isBusy = isUploading || isImporting

  const uploadFile = async (file: File | null, successMessage: string) => {
    const imageFile = file ? toImageFile(file) : null
    if (!imageFile) {
      onNotify('请选择图片文件', 'error')
      return
    }
    setIsUploading(true)
    try {
      const uploaded = await apiClient.uploadImage(imageFile, adminToken)
      onChange(uploaded.publicUrl)
      onNotify(successMessage, 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '封面上传失败', 'error')
    } finally {
      setIsUploading(false)
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
      const uploaded = await apiClient.uploadImage(
        new File([blob], fileNameFromUrl(nextUrl, contentType), {
          type: contentType || blob.type || 'image/*',
        }),
        adminToken,
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
          placeholder="粘贴图片 URL"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || isBusy}
        />
        <button
          className="mini-command secondary"
          disabled={disabled || isBusy}
          onClick={importRemoteUrl}
          type="button"
          title="从 URL 抓取并上传"
        >
          {isImporting ? (
            <LoaderCircle size={14} aria-hidden="true" className="spin" />
          ) : (
            <ImagePlus size={14} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* 第二行：上传图片按钮独占 */}
      <div className="cover-upload-row">
        <button
          className="mini-command secondary"
          disabled={disabled || isBusy}
          onClick={() => fileInputRef.current?.click()}
          type="button"
          title="上传图片"
        >
          {isUploading ? (
            <LoaderCircle size={14} aria-hidden="true" className="spin" />
          ) : (
            <Upload size={14} aria-hidden="true" />
          )}
          上传图片
        </button>
      </div>

      <p className="cover-field-hint">
        <Clipboard size={12} aria-hidden="true" />
        支持粘贴图片或截图
      </p>

      {value ? (
        <img
          alt={`${label}预览`}
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
    </div>
  )
}
