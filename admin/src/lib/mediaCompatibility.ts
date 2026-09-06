export type Mp4VideoCodec = 'h264' | 'hevc' | 'unknown'

// MP4 的视频采样描述会包含四字节编码标识：H.264 使用 avc1/avc3，
// H.265 使用 hvc1/hev1。按块扫描可以在不把最大 120MB 文件整体读入内存的情况下
// 完成本地预检；块之间保留 3 字节重叠，避免标识刚好跨越块边界时漏检。
const SCAN_CHUNK_SIZE = 1024 * 1024
const SIGNATURE_OVERLAP_SIZE = 3

// 四字节编码标识的大端整数形式。单次遍历同时识别四种标识，避免对大文件做多轮字符串扫描。
const AVC1 = 0x61766331
const AVC3 = 0x61766333
const HVC1 = 0x68766331
const HEV1 = 0x68657631

/**
 * 在浏览器本地识别 MP4 视频编码，不上传文件内容。
 * unknown 表示未找到 MP4 的 H.264/H.265 标识，调用方应保留原有兼容行为。
 */
export const detectMp4VideoCodec = async (file: File): Promise<Mp4VideoCodec> => {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const isMp4Family =
    file.type === 'video/mp4' || ['mp4', 'm4v', 'mov'].includes(extension)
  if (!isMp4Family) return 'unknown'

  let foundH264 = false
  let previousTail = new Uint8Array(0)
  for (let start = 0; start < file.size; start += SCAN_CHUNK_SIZE) {
    const chunk = new Uint8Array(
      await file.slice(start, Math.min(file.size, start + SCAN_CHUNK_SIZE)).arrayBuffer(),
    )
    const searchable = new Uint8Array(previousTail.length + chunk.length)
    searchable.set(previousTail)
    searchable.set(chunk, previousTail.length)

    for (let offset = 0; offset <= searchable.length - 4; offset += 1) {
      const signature =
        searchable[offset] * 0x1000000 +
        searchable[offset + 1] * 0x10000 +
        searchable[offset + 2] * 0x100 +
        searchable[offset + 3]
      if (signature === HVC1 || signature === HEV1) return 'hevc'
      if (signature === AVC1 || signature === AVC3) foundH264 = true
    }
    previousTail = searchable.slice(-SIGNATURE_OVERLAP_SIZE)
  }

  return foundH264 ? 'h264' : 'unknown'
}
