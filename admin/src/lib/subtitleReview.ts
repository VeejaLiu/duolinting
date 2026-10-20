import type { ContentLocale, TranscriptLine } from '@duolinting/shared'

export type SubtitleReviewRow = {
  key: string
  before?: TranscriptLine
  after?: TranscriptLine
  /** 各版本数组中的零基序号；不存在的一侧代表新增/删除，不能复用另一侧的序号。 */
  beforeIndex?: number
  afterIndex?: number
  kind: 'unchanged' | 'modified' | 'added' | 'removed'
  textChanged: boolean
  timingChanged: boolean
  detailsChanged: boolean
}

// 以 translations 为权威，兼容旧稿的中文 translation；忽略空译文和对象键顺序，
// 避免编辑器补齐兼容字段后，把实际未改动的句子误报为“译文修改”。
export const reviewTranslations = (line: TranscriptLine) => {
  const translations = { ...line.translations }
  if (translations['zh-CN'] === undefined && line.translation) translations['zh-CN'] = line.translation
  return Object.entries(translations)
    .filter((entry): entry is [ContentLocale, string] => Boolean(entry[1]))
    .sort(([left], [right]) => left.localeCompare(right))
}

const sameDetails = (before: TranscriptLine, after: TranscriptLine) =>
  JSON.stringify(reviewTranslations(before)) === JSON.stringify(reviewTranslations(after))
  && JSON.stringify(before.answers ?? []) === JSON.stringify(after.answers ?? [])
  && JSON.stringify(before.keywords ?? []) === JSON.stringify(after.keywords ?? [])

const sameTiming = (before: TranscriptLine, after: TranscriptLine) =>
  before.start === after.start && before.end === after.end

// 这些整数是对齐权重，不是相似度百分比：文本/时间吻合最可靠，持久 id 次之，
// 之后才是时间重叠；无依据的配对代价 20，高于一次删除加新增的 8 + 8。
const pairingCost = (before: TranscriptLine, after: TranscriptLine) => {
  if (before.text === after.text && sameTiming(before, after)) return 0
  if (before.text && before.text === after.text) return 2
  if (sameTiming(before, after)) return 3
  // l1/l2（以及纯数字）是旧导入器的位置编号，重新导入会复用，不能单独证明句子身份。
  // 新编辑器的 line-UUID 可随整句文字/时间修改保留，因此仍允许它作为匹配依据。
  const positionalId = /^(?:l|line[-_]?)?\d+$/i.test(before.id)
  if (before.id && before.id === after.id && !positionalId) return 4
  const overlap = Math.min(before.end, after.end) - Math.max(before.start, after.start)
  const shorterDuration = Math.min(before.end - before.start, after.end - after.start)
  return shorterDuration > 0 && overlap / shorterDuration >= 0.5 ? 6 : 20
}

export function buildSubtitleReviewRows(before: TranscriptLine[], after: TranscriptLine[]): SubtitleReviewRow[] {
  // 字幕 id 通常随编辑保留，但重新导入可能生成新 id 或重排 l1/l2。
  // 按文本、时间和 id 综合做有序对齐，插入/删除一句不会把后续全部误判成修改。
  // 两行滚动保存代价，trace 每格仅一个字节；长课程不创建对象矩阵。
  const width = after.length + 1
  const trace = new Uint8Array((before.length + 1) * width)
  let previous = Uint32Array.from({ length: width }, (_, index) => index * 8)
  let current = new Uint32Array(width)
  for (let column = 1; column < width; column += 1) trace[column] = 3
  for (let row = 1; row <= before.length; row += 1) {
    current[0] = row * 8
    trace[row * width] = 2
    for (let column = 1; column < width; column += 1) {
      const paired = previous[column - 1] + pairingCost(before[row - 1], after[column - 1])
      const removed = previous[column] + 8
      const added = current[column - 1] + 8
      current[column] = Math.min(paired, removed, added)
      trace[row * width + column] = paired <= removed && paired <= added ? 1 : removed <= added ? 2 : 3
    }
    ;[previous, current] = [current, previous]
  }

  const rows: SubtitleReviewRow[] = []
  let beforeCursor = before.length
  let afterCursor = after.length
  while (beforeCursor || afterCursor) {
    const step = trace[beforeCursor * width + afterCursor]
    const beforeIndex = step !== 3 ? --beforeCursor : undefined
    const afterIndex = step !== 2 ? --afterCursor : undefined
    const original = beforeIndex === undefined ? undefined : before[beforeIndex]
    const submitted = afterIndex === undefined ? undefined : after[afterIndex]
    const textChanged = Boolean(original && submitted && original.text !== submitted.text)
    const timingChanged = Boolean(original && submitted && !sameTiming(original, submitted))
    const detailsChanged = Boolean(original && submitted && !sameDetails(original, submitted))
    rows.push({
      key: `${beforeIndex ?? 'new'}:${afterIndex ?? 'deleted'}`,
      before: original,
      after: submitted,
      beforeIndex,
      afterIndex,
      kind: !original ? 'added' : !submitted ? 'removed'
        : textChanged || timingChanged || detailsChanged ? 'modified' : 'unchanged',
      textChanged,
      timingChanged,
      detailsChanged,
    })
  }
  return rows.reverse()
}

/** 源时间以秒保存；展示时一次转换成整数毫秒，避免 59.9996 显示成 00:59.1000。 */
export const formatReviewTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const milliseconds = Math.round(seconds * 1000)
  return `${String(Math.floor(milliseconds / 60000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`
}

/** 保留公共前后缀，只标出中间发生修改的文字；按 Unicode 码点切分，避免截断字符。 */
export const reviewTextChange = (before: string, after: string) => {
  const original = Array.from(before)
  const submitted = Array.from(after)
  let prefix = 0
  while (prefix < original.length && prefix < submitted.length && original[prefix] === submitted[prefix]) prefix += 1
  let suffix = 0
  while (suffix < original.length - prefix && suffix < submitted.length - prefix
    && original[original.length - suffix - 1] === submitted[submitted.length - suffix - 1]) suffix += 1
  const split = (characters: string[]) => ({
    prefix: characters.slice(0, prefix).join(''),
    changed: characters.slice(prefix, characters.length - suffix).join(''),
    suffix: characters.slice(characters.length - suffix).join(''),
  })
  return { before: split(original), after: split(submitted) }
}
