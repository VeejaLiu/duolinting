import { CopyOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, Modal, Typography } from 'antd'
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import { imageFileFromClipboardItems, readImageFileFromClipboard } from '../../lib/imageClipboard'

type Props = {
  label: string
  acceptedTypes?: readonly string[]
  maxBytes?: number
  disabled?: boolean
  selectedFile?: File | null
  previewUrl?: string
  previewVariant?: 'logo' | 'banner' | 'receipt'
  onFile: (file: File) => void | Promise<void>
  onError: (message: string) => void
}

export function ImagePasteInput({ label, acceptedTypes, maxBytes, disabled, selectedFile, previewUrl, previewVariant = 'receipt', onFile, onError }: Props) {
  const { t } = useAdminLanguage()
  const [busy, setBusy] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [localPreviewUrl, setLocalPreviewUrl] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pasteAreaRef = useRef<HTMLDivElement | null>(null)
  const isDisabled = Boolean(disabled || busy)
  const previewFile = pendingFile ?? selectedFile
  const imageUrl = localPreviewUrl || previewUrl || ''

  useEffect(() => {
    if (!previewFile) {
      setLocalPreviewUrl('')
      return
    }
    const objectUrl = URL.createObjectURL(previewFile)
    setLocalPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [previewFile])

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
    setPendingFile(file)
    try {
      await onFile(file)
    } catch (error) {
      onError(error instanceof Error ? error.message : t('图片处理失败'))
    } finally {
      setPendingFile(null)
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
    <Typography.Text type="secondary">{selectedFile?.name || t('也可点击此处按 Ctrl/⌘+V，或拖入图片')}</Typography.Text>
    {imageUrl ? <div className={`admin-image-paste-preview is-${previewVariant}`}>
      <button aria-label={t('查看大图')} className="admin-image-paste-preview-button" onClick={() => setPreviewOpen(true)} type="button">
        <img alt={`${label}${t('预览')}`} src={imageUrl} />
      </button>
      <Button size="small" type="link" onClick={() => setPreviewOpen(true)}>{t('查看大图')}</Button>
      {selectedFile ? <Typography.Text type="secondary">{t('待保存，确认后上传')}</Typography.Text> : null}
    </div> : null}
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
    <Modal open={previewOpen && Boolean(imageUrl)} title={label} footer={null} onCancel={() => setPreviewOpen(false)}>
      {imageUrl ? <img alt={`${label}${t('预览')}`} src={imageUrl} style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', margin: '0 auto', objectFit: 'contain' }} /> : null}
    </Modal>
  </div>
}
