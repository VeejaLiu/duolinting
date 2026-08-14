import type { UiLocale } from '@duolinting/domain'

// App.tsx 会话编排外壳的文案。key 统一使用 `app.` 前缀。
// app.chapterBanner.progress 的 {{current}}/{{total}} 为章节序号占位符，
// 运行时由 t() 插值替换（如 "第 3 章 / 共 12 章"）。
export const appMessages: Record<UiLocale, Record<string, string>> = {
  'zh-CN': {
    'app.studyArea.aria': '课程学习区',
    'app.chapterBanner.aria': '当前章节',
    'app.chapterBanner.kicker': '当前章节',
    'app.chapterBanner.seriesFallback': '当前系列',
    'app.chapterBanner.progress': '第 {{current}} 章 / 共 {{total}} 章',
  },
  'en-US': {
    'app.studyArea.aria': 'Course study area',
    'app.chapterBanner.aria': 'Current chapter',
    'app.chapterBanner.kicker': 'Current chapter',
    'app.chapterBanner.seriesFallback': 'Current series',
    'app.chapterBanner.progress': 'Chapter {{current}} of {{total}}',
  },
  'th-TH': {
    'app.studyArea.aria': 'พื้นที่เรียนคอร์ส',
    'app.chapterBanner.aria': 'บทปัจจุบัน',
    'app.chapterBanner.kicker': 'บทปัจจุบัน',
    'app.chapterBanner.seriesFallback': 'ซีรีส์ปัจจุบัน',
    'app.chapterBanner.progress': 'บทที่ {{current}} จากทั้งหมด {{total}} บท',
  },
  'ja-JP': {
    'app.studyArea.aria': 'コース学習エリア',
    'app.chapterBanner.aria': '現在のチャプター',
    'app.chapterBanner.kicker': '現在のチャプター',
    'app.chapterBanner.seriesFallback': '現在のシリーズ',
    'app.chapterBanner.progress': '第 {{current}} 章 / 全 {{total}} 章',
  },
}
