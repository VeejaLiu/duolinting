import type { DraftLine } from './mediaDraftTools'

/**
 * 轨道仅是编辑器的显示布局，不写入字幕 ID、时间或课程数据。
 * 按开始时间分配最上方已空闲的轨道，使用半开区间 [start, end)：
 * 前句结束与后句开始相同不算重叠；同起点按原顺序排列，保证布局确定。
 * 时间裁剪与波形区域一致，避免超出媒体范围的字幕在画面上互相遮挡。
 */
export function getSubtitleLaneLayout(lines: DraftLine[], duration = Infinity) {
  const intervals = lines.flatMap((line, index) => {
    if (!Number.isFinite(line.start) || !Number.isFinite(line.end)) return []
    const start = Math.min(Math.max(line.start, 0), duration)
    const end = Math.min(Math.max(line.end, start + 0.001), duration)
    return [{ id: line.id, start, end, index }]
  }).sort((a, b) => a.start - b.start || a.index - b.index)
  const ends: number[] = []
  const lanes = new Map<string, number>()
  for (const interval of intervals) {
    let lane = ends.findIndex((end) => end <= interval.start)
    if (lane < 0) lane = ends.length
    ends[lane] = interval.end
    lanes.set(interval.id, lane)
  }
  return { lanes, count: Math.max(1, ends.length) }
}
