/** Extract a browser clipboard image without treating pasted text or URLs as files. */
export const imageFileFromClipboardItems = (items: DataTransferItemList | DataTransferItem[]) =>
  Array.from(items).find((item) => item.type.startsWith('image/'))?.getAsFile() ?? null

export async function readImageFileFromClipboard(): Promise<File | null> {
  if (!navigator.clipboard?.read) return null
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find((value) => value.startsWith('image/'))
    if (!type) continue
    const blob = await item.getType(type)
    const extension = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png'
    return new File([blob], `pasted-image.${extension}`, { type })
  }
  return null
}
