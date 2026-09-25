import { CopyOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'
import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import { imageFileFromClipboardItems, readImageFileFromClipboard } from '../../lib/imageClipboard'

type Props = {
  label: string
  acceptedTypes?: readonly string[]
  maxBytes?: number
  disabled?: boolean
  selectedFileName?: string
  onFile: (file: File) => void | Promise<void>
  onError: (message: string) => void
}

export function ImagePasteInput({ label, acceptedTypes, maxBytes, disabled, selectedFileName, onFile, onError }: Props) {
  const { t } = useAdminLanguage()
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pasteAreaRef = useRef<HTMLDivElement | null>(null)
  const isDisabled = Boolean(disabled || busy)

  const acceptFile = async (file: File | null) => {
    if (!file || !file.type.startsWith('image/') || (acceptedTypes && !acceptedTypes.includes(file.type))) {
      onError(t('请选择支持的图片文件'))
      return
    }
    if (maxBytes && file.size > maxBytes) {
      onError(`${t('图片文件超过大小限制')} (${Math.round(maxBytes / (1024 * 1024))} MB)`)
      return
    }
    setBusy(true)
    try {
      await onFile(file)
    } catch (error) {
      onError(error instanceof Error ? error.message : t('图片处理失败'))
    } finally {
      setBusy(false)
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (isDisabled) return
    const file = imageFileFromClipboardItems(event.clipboardData.items)
    if (!file) return
    event.preventDefault()
    void acceptFile(file)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!isDisabled) void acceptFile(event.dataTransfer.files[0] ?? null)
  }

  const pasteFromClipboard = async () => {
    if (isDisabled) return
    try {
      const file = await readImageFileFromClipboard()
      if (file) await acceptFile(file)
      else {
        pasteAreaRef.current?.focus()
        onError(t('剪贴板中没有图片，请在此处按 Ctrl/⌘+V 粘贴'))
      }
    } catch {
      pasteAreaRef.current?.focus()
      onError(t('无法读取剪贴板，请在此处按 Ctrl/⌘+V 粘贴'))
    }
  }

  return <div
    ref={pasteAreaRef}
    className="admin-image-paste-input"
    role="group"
    aria-label={label}
    tabIndex={0}
    onPaste={handlePaste}
    onDragOver={(event) => event.preventDefault()}
    onDrop={handleDrop}
  >
    <Button disabled={isDisabled} icon={<UploadOutlined />} size="small" onClick={() => fileInputRef.current?.click()}>{t('选择图片')}</Button>
    <Button disabled={isDisabled} icon={<CopyOutlined />} size="small" onClick={() => void pasteFromClipboard()}>{t('粘贴图片')}</Button>
    <Typography.Text type="secondary">{selectedFileName || t('也可点击此处按 Ctrl/⌘+V，或拖入图片')}</Typography.Text>
    <input
      ref={fileInputRef}
      aria-label={label}
      accept={acceptedTypes?.join(',') ?? 'image/*'}
      disabled={isDisabled}
      style={{ display: 'none' }}
      type="file"
      onChange={(event) => {
        void acceptFile(event.target.files?.[0] ?? null)
        event.currentTarget.value = ''
      }}
    />
  </div>
}
