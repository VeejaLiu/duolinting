import type { CreateTranscriptLineRequest } from '@duolinting/shared'
import type { ContentLocale } from '@duolinting/domain'

export type DraftLine = {
  id: string
  start: number
  end: number
  text: string
  translation: string
  translations: Partial<Record<ContentLocale, string>>
  answers: string[]
  keywordsText: string
}

// AI 翻译的目标语言集合：字幕原文固定按英文（en-US）处理，译文需为这三种语言各保留一份。
// 批量翻译与单句翻译都按此列表逐语言补齐，顺序即请求顺序（串行执行，避免并发轰炸翻译服务）。
export const TRANSLATION_TARGET_LOCALES = ['zh-CN', 'th-TH', 'ja-JP'] as const satisfies readonly ContentLocale[]

export type TranslationTargetLocale = (typeof TRANSLATION_TARGET_LOCALES)[number]

// 目标语言在 Admin 界面上的展示名（沿用各语言自称，便于识别）。
export const TRANSLATION_LOCALE_LABELS: Record<TranslationTargetLocale, string> = {
  'zh-CN': '中文',
  'th-TH': 'ไทย',
  'ja-JP': '日本語',
}

export type SubtitleImportMode = 'single' | 'first-chinese' | 'second-chinese'

export type SubtitleDraftAnalysis = {
  blockCount: number
  bilingualBlockCount: number
  isLikelyBilingual: boolean
  suggestedMode: SubtitleImportMode
}

export const createEmptyDraftLine = (index = 0): DraftLine => ({
  id: `l${index + 1}`,
  start: 0,
  end: 5,
  text: '',
  translation: '',
  translations: {},
  answers: [],
  keywordsText: '',
})

// 译文合并的分隔规则：zh-CN / ja-JP 是 CJK 语言，句间直接拼接不加空格；
// th-TH 虽无空格分词，但两句独立译文之间保留一个空格便于阅读；其他语言一律用空格连接。
const mergeTranslationText = (locale: string, first: string, second: string) => {
  if (!first) return second
  if (!second) return first
  const separator = locale === 'zh-CN' || locale === 'ja-JP' ? '' : ' '
  return `${first}${separator}${second}`
}

// 数组合并取并集：保持原有顺序，先第一行后第二行，忽略空白项并去重。
const mergeUniqueOrdered = (first: string[], second: string[]) => {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const value of [...first, ...second]) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    merged.push(trimmed)
  }
  return merged
}

// 合并两条相邻字幕草稿：时间跨度取 first.start ~ second.end；
// 原文（en-US）用单个空格连接后统一清理空白；translations 按语言分别合并（分位规则见上）；
// legacy translation 镜像 zh-CN 的合并规则；answers 与 keywords（逗号分隔文本）取并集去重。
// 返回值保留 first 的 id，调用方负责从列表中移除 second。
export const mergeDraftLines = (first: DraftLine, second: DraftLine): DraftLine => {
  const translationLocales = new Set([
    ...Object.keys(first.translations ?? {}),
    ...Object.keys(second.translations ?? {}),
  ])
  const translations: DraftLine['translations'] = {}
  translationLocales.forEach((locale) => {
    const merged = mergeTranslationText(
      locale,
      cleanSubtitleSpacing(first.translations?.[locale as ContentLocale] ?? ''),
      cleanSubtitleSpacing(second.translations?.[locale as ContentLocale] ?? ''),
    )
    if (merged) {
      translations[locale as ContentLocale] = merged
    }
  })

  return {
    ...first,
    end: second.end,
    text: cleanSubtitleSpacing(
      `${cleanSubtitleSpacing(first.text)} ${cleanSubtitleSpacing(second.text)}`,
    ),
    translation: mergeTranslationText(
      'zh-CN',
      cleanSubtitleSpacing(first.translation),
      cleanSubtitleSpacing(second.translation),
    ),
    translations,
    answers: mergeUniqueOrdered(first.answers ?? [], second.answers ?? []),
    keywordsText: mergeUniqueOrdered(
      first.keywordsText.split(','),
      second.keywordsText.split(','),
    ).join(','),
  }
}

const englishPunctuationMap: Record<string, string> = {
  '，': ',',
  '。': '.',
  '！': '!',
  '？': '?',
  '；': ';',
  '：': ':',
  '（': '(',
  '）': ')',
  '【': '[',
  '】': ']',
  '［': '[',
  '］': ']',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '、': ',',
  '《': '<',
  '》': '>',
  '…': '...',
  '—': '-',
  '～': '~',
  '　': ' ',
}

export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'lrc' | 'unknown'

export const detectSubtitleFormat = (value: string): SubtitleFormat => {
  const trimmed = value.trim()
  if (/^WEBVTT$/im.test(trimmed)) return 'vtt'
  if (/^\[Script Info\]/im.test(trimmed)) return 'ass'
  if (/^\[[\d:.\]]+/.test(trimmed)) return 'lrc'
  if (/^\d+\s*\n\s*\d{2}:\d{2}:\d{2}/m.test(trimmed)) return 'srt'
  return 'unknown'
}

export const cleanSubtitleSpacing = (value: string) =>
  value.replace(/[ \t\u00a0\u3000]+/g, ' ').trim()

// English subtitles are stored as a single normalized line so later matching
// logic does not need to handle full-width punctuation or stray spaces before
// sentence punctuation such as "word ," or "word ?", and we also restore the
// usual separator space after punctuation in phrases like "Hello,world".
// Numeric tokens such as times keep tight separators, for example "5: 00"
// should normalize to "5:00" instead of "5: 00".
export const cleanEnglishAnswerText = (value: string) =>
  cleanSubtitleSpacing(
    Array.from(value)
      .map((char) => englishPunctuationMap[char] ?? char)
      .join(''),
  )
    .replace(/(\d)\s*:\s*(\d)/g, '$1:$2')
    .replace(/\s+([,.;:!?)\]%}\]>])/g, '$1')
    .replace(/([,;!?])([A-Za-z0-9"'([])/g, '$1 $2')
    .replace(/:([A-Za-z"'([])/g, ': $1')
    .replace(/([.])([A-Za-z"'([])/g, '$1 $2')

export const formatDurationLabel = (seconds: number) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(seconds, 0) : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = Math.round(safeSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

const parseTimestamp = (value: string) => {
  const normalized = value.trim().replace(',', '.')
  const parts = normalized.split(':').map(Number)
  if (parts.some((part) => Number.isNaN(part))) {
    throw new Error(`无法识别时间点：${value}`)
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }

  return parts[0]
}

const hasChinese = (value: string) => /[\u3400-\u9fff]/.test(value)

const stripAssTags = (text: string) =>
  text.replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n').replace(/\\n/g, '\n').trim()

const splitSubtitleBlocks = (value: string, format: SubtitleFormat) => {
  const normalized = value.replace(/\r/g, '')

  if (format === 'ass') {
    const lines = normalized.split('\n')
    const dialogueLines: string[] = []
    let inEvents = false
    for (const line of lines) {
      const trimmed = line.trim()
      if (/^\[Events\]/i.test(trimmed)) {
        inEvents = true
        continue
      }
      if (/^\[/i.test(trimmed) && !/^Dialogue:/i.test(trimmed)) {
        inEvents = false
      }
      if (inEvents && /^Dialogue:/i.test(trimmed)) {
        dialogueLines.push(trimmed)
      }
    }
    return dialogueLines
  }

  if (format === 'lrc') {
    return normalized
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\[[\d:.\]]+/.test(line))
  }

  return normalized
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
}

interface ParsedAssLine {
  start: number
  end: number
  contentLines: string[]
}

const parseAssDialogue = (line: string, index: number): ParsedAssLine => {
  const parts = line.split(',')
  if (parts.length < 10) {
    throw new Error(`第 ${index + 1} 段 ASS 格式不正确`)
  }
  const start = parseTimestamp(parts[1].trim())
  const end = parseTimestamp(parts[2].trim())
  const text = stripAssTags(parts.slice(9).join(',').replace(/\\N/g, '\n'))
  return { start, end, contentLines: [text] }
}

const groupAssByTiming = (
  dialogueLines: string[],
): Array<{ start: number; end: number; contentLines: string[] }> => {
  const groups = new Map<string, string[]>()

  for (let i = 0; i < dialogueLines.length; i++) {
    const parsed = parseAssDialogue(dialogueLines[i], i)
    const key = `${parsed.start}-${parsed.end}`
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(parsed.contentLines[0])
  }

  return Array.from(groups.entries()).map(([, contentLines]) => {
    const first = parseAssDialogue(dialogueLines.find((l) => {
      const parsed = parseAssDialogue(l, 0)
      return parsed.contentLines[0] === contentLines[0]
    })!, 0)
    return { start: first.start, end: first.end, contentLines }
  })
}

const parseSubtitleBlock = (
  block: string,
  index: number,
  format: SubtitleFormat,
  nextBlockStart?: number,
) => {
  if (format === 'ass') {
    const parsed = parseAssDialogue(block, index)
    return parsed
  }

  if (format === 'lrc') {
    const match = block.match(/^\[([\d:.]+)\](.*)$/)
    if (!match) {
      throw new Error(`第 ${index + 1} 段 LRC 格式不正确`)
    }
    const start = parseTimestamp(match[1])
    const end = nextBlockStart !== undefined ? nextBlockStart : start + 5
    return { start, end, contentLines: [match[2].trim()] }
  }

  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^WEBVTT$/i.test(line))
  const timingIndex = lines.findIndex((line) => line.includes('-->'))
  if (timingIndex < 0) {
    throw new Error(`第 ${index + 1} 段没有时间轴`)
  }

  const [startText, endText] = lines[timingIndex].split('-->').map((part) =>
    part.trim().split(/\s+/)[0],
  )
  const contentLines = lines
    .slice(timingIndex + 1)
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    start: parseTimestamp(startText),
    end: parseTimestamp(endText),
    contentLines,
  }
}

export const analyzeSubtitleDraft = (value: string): SubtitleDraftAnalysis => {
  const format = detectSubtitleFormat(value)
  const blocks = splitSubtitleBlocks(value, format)
  if (blocks.length === 0) {
    return {
      blockCount: 0,
      bilingualBlockCount: 0,
      isLikelyBilingual: false,
      suggestedMode: 'single',
    }
  }

  if (format === 'lrc') {
    return {
      blockCount: blocks.length,
      bilingualBlockCount: 0,
      isLikelyBilingual: false,
      suggestedMode: 'single',
    }
  }

  if (format === 'ass') {
    const grouped = groupAssByTiming(blocks as string[])
    let bilingualBlockCount = 0
    let firstChineseCount = 0
    let secondChineseCount = 0

    for (const { contentLines } of grouped) {
      if (contentLines.length < 2) continue
      const first = contentLines[0]
      const second = contentLines[1]
      const firstIsChinese = hasChinese(first)
      const secondIsChinese = hasChinese(second)
      if (firstIsChinese === secondIsChinese) continue
      bilingualBlockCount += 1
      if (firstIsChinese) {
        firstChineseCount += 1
      } else {
        secondChineseCount += 1
      }
    }

    const isLikelyBilingual =
      bilingualBlockCount > 0 && bilingualBlockCount / grouped.length >= 0.6
    const suggestedMode =
      !isLikelyBilingual
        ? 'single'
        : firstChineseCount >= secondChineseCount
          ? 'first-chinese'
          : 'second-chinese'

    return {
      blockCount: grouped.length,
      bilingualBlockCount,
      isLikelyBilingual,
      suggestedMode,
    }
  }

  let bilingualBlockCount = 0
  let firstChineseCount = 0
  let secondChineseCount = 0

  for (const [index, block] of blocks.entries()) {
    const { contentLines } = parseSubtitleBlock(block, index, format)
    if (contentLines.length < 2) {
      continue
    }

    const first = contentLines[0]
    const second = contentLines[1]
    const firstIsChinese = hasChinese(first)
    const secondIsChinese = hasChinese(second)
    if (firstIsChinese === secondIsChinese) {
      continue
    }

    bilingualBlockCount += 1
    if (firstIsChinese) {
      firstChineseCount += 1
    } else {
      secondChineseCount += 1
    }
  }

  const isLikelyBilingual =
    bilingualBlockCount > 0 && bilingualBlockCount / blocks.length >= 0.6
  const suggestedMode =
    !isLikelyBilingual
      ? 'single'
      : firstChineseCount >= secondChineseCount
        ? 'first-chinese'
        : 'second-chinese'

  return {
    blockCount: blocks.length,
    bilingualBlockCount,
    isLikelyBilingual,
    suggestedMode,
  }
}

export const parseSubtitleDraft = (
  value: string,
  mode: SubtitleImportMode = 'single',
): DraftLine[] => {
  const format = detectSubtitleFormat(value)
  const blocks = splitSubtitleBlocks(value, format)

  if (blocks.length === 0) {
    return []
  }

  if (format === 'lrc') {
    return blocks.map((block, index) => {
      const nextBlock = blocks[index + 1]
      const nextMatch = nextBlock?.match(/^\[([\d:.]+)\]/)
      const nextBlockStart = nextMatch ? parseTimestamp(nextMatch[1]) : undefined
      const { start, end, contentLines } = parseSubtitleBlock(block, index, format, nextBlockStart)
      return {
        id: `l${index + 1}`,
        start,
        end,
        text: contentLines.join(' '),
        translation: '',
        translations: {},
        answers: [],
        keywordsText: '',
      }
    })
  }

  if (format === 'ass') {
    const grouped = groupAssByTiming(blocks as string[])
    return grouped.map(({ start, end, contentLines }, index) => {
      let text = contentLines.join(' ')
      let translation = ''

      if (mode !== 'single' && contentLines.length >= 2) {
        const chineseLine = mode === 'first-chinese' ? contentLines[0] : contentLines[1]
        const foreignLine = mode === 'first-chinese' ? contentLines[1] : contentLines[0]
        text = foreignLine ?? contentLines.join(' ')
        translation = chineseLine ?? ''
      }

      return {
        id: `l${index + 1}`,
        start,
        end,
        text,
        translation,
        translations: translation ? { 'zh-CN': translation } : {},
        answers: [],
        keywordsText: '',
      }
    })
  }

  return blocks.map((block, index) => {
    const { start, end, contentLines } = parseSubtitleBlock(block, index, format)
    let text = contentLines.join(' ')
    let translation = ''

    if (mode !== 'single' && contentLines.length >= 2) {
      const chineseLine = mode === 'first-chinese' ? contentLines[0] : contentLines[1]
      const foreignLine = mode === 'first-chinese' ? contentLines[1] : contentLines[0]
      text = foreignLine ?? contentLines.join(' ')
      translation = chineseLine ?? ''
    }

    return {
      id: `l${index + 1}`,
      start,
      end,
      text,
      translation,
      translations: translation ? { 'zh-CN': translation } : {},
      answers: [],
      keywordsText: '',
    }
  })
}

export const toTranscriptLines = (
  draftLines: DraftLine[],
): CreateTranscriptLineRequest[] =>
  draftLines.map((line, index) => ({
    id: line.id || `l${index + 1}`,
    start: Number(line.start),
    end: Number(line.end),
    text: cleanEnglishAnswerText(line.text),
    translation: cleanSubtitleSpacing(line.translation),
    translations: Object.fromEntries(
      Object.entries(line.translations ?? {})
        .map(([locale, value]) => [locale, cleanSubtitleSpacing(String(value ?? ''))])
        .filter(([, value]) => Boolean(value)),
    ),
    answers: (line.answers ?? [])
      .map((answer) => cleanEnglishAnswerText(answer))
      .filter(Boolean),
    keywords: line.keywordsText
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  }))
