import { useRef, useState } from 'react'
import { Modal } from 'antd'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type Props = { image: ImageBitmap; busy: boolean; onCancel: () => void; onConfirm: (file: File) => Promise<void>; onError: (message: string) => void }

export function CoverCropModal({ image, busy, onCancel, onConfirm, onError }: Props) {
  const { t } = useAdminLanguage()
  const [encoding, setEncoding] = useState(false)
  const working = busy || encoding
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState({ x: image.width / 2, y: image.height / 2 })
  // Crop coordinates are original-image pixels. Clamp the center at every zoom
  // level so dragging can never expose empty space outside the source image.
  const side = Math.min(image.width, image.height) / zoom
  const x = Math.max(side / 2, Math.min(image.width - side / 2, center.x))
  const y = Math.max(side / 2, Math.min(image.height - side / 2, center.y))
  // Draw on attachment too: the modal portal may mount after its parent's effects.
  const drawPreview = (node: HTMLCanvasElement | null) => {
    const context = node?.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, 512, 512)
    context.drawImage(image, x - side / 2, y - side / 2, side, side, 0, 0, 512, 512)
  }
  const confirm = async () => {
    if (working) return
    setEncoding(true)
    try {
      const output = document.createElement('canvas')
      output.width = output.height = 512
      const context = output.getContext('2d')
      if (!context) throw new Error(t('图片压缩失败'))
      context.drawImage(image, x - side / 2, y - side / 2, side, side, 0, 0, 512, 512)
      const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/webp', 0.8))
      // Some browsers silently fall back to PNG for unsupported encoders.
      if (!blob || blob.type !== 'image/webp') throw new Error(t('当前浏览器无法生成 WebP 图片，请使用新版浏览器'))
      await onConfirm(new File([blob], 'cover.webp', { type: 'image/webp' }))
    } catch (error) { onError(error instanceof Error ? error.message : t('图片压缩失败')) }
    finally { setEncoding(false) }
  }
  return <Modal open title={t('裁剪封面')} width={440} onCancel={() => { if (!working) onCancel() }} onOk={() => void confirm()}
    okText={t('裁剪并上传')} cancelText={t('取消')} confirmLoading={working} closable={!working}
    maskClosable={!working} keyboard={!working} cancelButtonProps={{ disabled: working }}>
    <p>{t('拖动图片调整位置，缩放后裁剪为正方形。输出 512 × 512 WebP。')}</p>
    <canvas ref={drawPreview} width={512} height={512} className="cover-crop-canvas" tabIndex={0}
      aria-label={t('拖动或使用方向键调整裁剪位置')}
      onPointerDown={(event) => { if (working) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY } }}
      onPointerMove={(event) => {
        if (!drag.current || working) return
        const ratio = side / event.currentTarget.getBoundingClientRect().width
        setCenter({ x: x - (event.clientX - drag.current.x) * ratio, y: y - (event.clientY - drag.current.y) * ratio })
        drag.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
      onLostPointerCapture={() => { drag.current = null }}
      onKeyDown={(event) => {
        if (working || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return
        event.preventDefault()
        const step = side / 50
        setCenter({ x: x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) })
      }} />
    <label className="cover-crop-zoom">{t('缩放')} {zoom.toFixed(1)}×
      <input type="range" min={1} max={4} step={0.05} value={zoom} disabled={working}
        onChange={(event) => { setCenter({ x, y }); setZoom(Number(event.target.value)) }} />
    </label>
  </Modal>
}
