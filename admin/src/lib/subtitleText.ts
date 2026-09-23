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


export const cleanSubtitleSpacing = (value: string) =>
  value.replace(/[ \t\u00a0\u3000]+/g, ' ').trim()

/**
 * A continuous token may be an address, email, abbreviation, version or numeric value.
 * Protect the entire token, including URL paths/query punctuation: fixing punctuation inside
 * it can change its meaning. This intentionally also preserves ambiguous text like Hello.World.
 * No TLD allowlist is used, so new domains and multi-part suffixes remain intact.
 */
const isStructuredToken = (token: string) =>
  /[a-z][a-z0-9+.-]*:\/\//i.test(token)
  || /[\p{L}\p{N}]\.[\p{L}\p{N}]/u.test(token)
  || /[^\s@]+@[^\s@]+/.test(token)
  || /\d[,.:]\d/.test(token)

const formatPlainText = (value: string) =>
  Array.from(value)
    .map((char) => englishPunctuationMap[char] ?? char)
    .join('')
    .replace(/(\d)\s*:\s*(\d)/g, '$1:$2')
    .replace(/\s+([,.;:!?)\]%}\]>])/g, '$1')
    .replace(/([,;!?])([A-Za-z0-9"'([])/g, '$1 $2')
    .replace(/:([A-Za-z"'([])/g, ': $1')

/**
 * Used by both editor blur and save/submit. Never infer a sentence break from a period:
 * it could instead belong to a domain, abbreviation or filename. Existing spaces are retained.
 * Format only plain spans, without marker placeholders that could collide with actual subtitles.
 */
export function cleanEnglishAnswerText(value: string): string {
  const parts: string[] = []
  let start = 0
  for (const match of value.matchAll(/\S+/g)) {
    if (!isStructuredToken(match[0])) continue
    parts.push(formatPlainText(value.slice(start, match.index)), match[0])
    start = match.index + match[0].length
  }
  parts.push(formatPlainText(value.slice(start)))
  return cleanSubtitleSpacing(parts.join(''))
}
