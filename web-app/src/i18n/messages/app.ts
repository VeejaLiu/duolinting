import type { UiLocale } from '@duolinting/domain'

// App.tsx 会话编排外壳的文案。key 统一使用 `app.` 前缀。
// app.chapterBanner.progress 的 {{current}}/{{total}} 为章节序号占位符，
// 运行时由 t() 插值替换（如 "第 3 章 / 共 12 章"）。
export const appMessages: Record<UiLocale, Record<string, string>> = {
  'zh-CN': {
    "app.releaseUpdateAvailable": "课程有新版本，点此更新",
    "app.playbackFailed": "播放未完成，请重试。",
    'app.studyArea.aria': '课程学习区',
    'app.chapterBanner.aria': '当前章节',
    'app.chapterBanner.kicker': '当前章节',
    'app.chapterBanner.seriesFallback': '当前系列',
    'app.chapterBanner.progress': '第 {{current}} 章 / 共 {{total}} 章',
  },
  'en-US': {
    "app.releaseUpdateAvailable": "A new course version is available. Tap to update.",
    "app.playbackFailed": "Playback did not complete. Please retry.",
    'app.studyArea.aria': 'Course study area',
    'app.chapterBanner.aria': 'Current chapter',
    'app.chapterBanner.kicker': 'Current chapter',
    'app.chapterBanner.seriesFallback': 'Current series',
    'app.chapterBanner.progress': 'Chapter {{current}} of {{total}}',
  },
  'th-TH': {
    "app.releaseUpdateAvailable": "มีบทเรียนเวอร์ชันใหม่ แตะเพื่ออัปเดต",
    "app.playbackFailed": "เล่นไม่สำเร็จ โปรดลองอีกครั้ง",
    'app.studyArea.aria': 'พื้นที่เรียนคอร์ส',
    'app.chapterBanner.aria': 'บทปัจจุบัน',
    'app.chapterBanner.kicker': 'บทปัจจุบัน',
    'app.chapterBanner.seriesFallback': 'ซีรีส์ปัจจุบัน',
    'app.chapterBanner.progress': 'บทที่ {{current}} จากทั้งหมด {{total}} บท',
  },
  'ja-JP': {
    "app.releaseUpdateAvailable": "新しいコース版があります。タップして更新",
    "app.playbackFailed": "再生が完了しませんでした。再試行してください。",
    'app.studyArea.aria': 'コース学習エリア',
    'app.chapterBanner.aria': '現在のチャプター',
    'app.chapterBanner.kicker': '現在のチャプター',
    'app.chapterBanner.seriesFallback': '現在のシリーズ',
    'app.chapterBanner.progress': '第 {{current}} 章 / 全 {{total}} 章',
  },
  "fr-FR": {
    "app.releaseUpdateAvailable": "Nouvelle version disponible. Touchez pour mettre à jour.",
    "app.playbackFailed": "La lecture n’a pas abouti. Veuillez réessayer.",
    "app.studyArea.aria": "Espace d’étude du cours",
    "app.chapterBanner.aria": "Chapitre actuel",
    "app.chapterBanner.kicker": "Chapitre actuel",
    "app.chapterBanner.seriesFallback": "Série actuelle",
    "app.chapterBanner.progress": "Chapitre {{current}} sur {{total}}"
},
  "es-ES": {
    "app.releaseUpdateAvailable": "Hay una nueva versión. Toca para actualizar.",
    "app.playbackFailed": "La reproducción no se completó. Vuelve a intentarlo.",
    "app.studyArea.aria": "Área de estudio del curso",
    "app.chapterBanner.aria": "Capítulo actual",
    "app.chapterBanner.kicker": "Capítulo actual",
    "app.chapterBanner.seriesFallback": "Serie actual",
    "app.chapterBanner.progress": "Capítulo {{current}} de {{total}}"
},
}
