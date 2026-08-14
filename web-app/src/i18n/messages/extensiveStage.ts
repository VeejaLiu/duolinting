import type { UiLocale } from '@duolinting/domain'

// ExtensiveStage.tsx 泛听阶段与 TranscriptPanel.tsx 字幕面板的文案。
// key 分别使用 `extensive.` 与 `transcript.` 前缀。
export const extensiveStageMessages: Record<UiLocale, Record<string, string>> = {
  'zh-CN': {
    'extensive.play': '开始',
    'extensive.pause': '暂停',
    'extensive.playbackProgress': '播放进度',
    'extensive.skipToSentenceStudy': '跳到逐句学习',
    'transcript.panelTitle': '章节句子',
    'transcript.hiddenLineChallenge': '隐藏字幕挑战',
  },
  'en-US': {
    'extensive.play': 'Play',
    'extensive.pause': 'Pause',
    'extensive.playbackProgress': 'Playback progress',
    'extensive.skipToSentenceStudy': 'Skip to sentence study',
    'transcript.panelTitle': 'Chapter sentences',
    'transcript.hiddenLineChallenge': 'Hidden transcript challenge',
  },
  'th-TH': {
    'extensive.play': 'เล่น',
    'extensive.pause': 'หยุดชั่วคราว',
    'extensive.playbackProgress': 'ความคืบหน้าการเล่น',
    'extensive.skipToSentenceStudy': 'ข้ามไปเรียนทีละประโยค',
    'transcript.panelTitle': 'ประโยคในบทเรียน',
    'transcript.hiddenLineChallenge': 'ท้าทายคำบรรยายที่ซ่อนอยู่',
  },
  'ja-JP': {
    'extensive.play': '再生',
    'extensive.pause': '一時停止',
    'extensive.playbackProgress': '再生の進捗',
    'extensive.skipToSentenceStudy': '文ごとの学習へスキップ',
    'transcript.panelTitle': 'チャプターの文',
    'transcript.hiddenLineChallenge': '字幕非表示チャレンジ',
  },
}
