import type { UiLocale } from '@duolinting/domain'

export const recoveryMessages = {
  "zh-CN": {
    "recovery.chaptersFailed": "章节加载失败，请检查网络后重试。",
    "recovery.refreshFailed": "暂时无法更新，已保留上次加载的内容。",
    "recovery.progressUnavailable": "进度暂不可用",
  },
  "en-US": {
    "recovery.chaptersFailed": "Unable to load chapters. Check your connection and retry.",
    "recovery.refreshFailed": "Unable to refresh. Your previously loaded content is still available.",
    "recovery.progressUnavailable": "Progress unavailable",
  },
  "th-TH": {
    "recovery.chaptersFailed": "โหลดบทไม่สำเร็จ โปรดตรวจสอบเครือข่ายแล้วลองอีกครั้ง",
    "recovery.refreshFailed": "อัปเดตไม่สำเร็จ ยังแสดงเนื้อหาที่โหลดไว้ก่อนหน้า",
    "recovery.progressUnavailable": "ยังดูความคืบหน้าไม่ได้",
  },
  "ja-JP": {
    "recovery.chaptersFailed": "チャプターを読み込めませんでした。通信を確認して再試行してください。",
    "recovery.refreshFailed": "更新できませんでした。前回読み込んだ内容を表示しています。",
    "recovery.progressUnavailable": "進捗を取得できません",
  },
  "fr-FR": {
    "recovery.chaptersFailed": "Impossible de charger les chapitres. Vérifiez votre connexion et réessayez.",
    "recovery.refreshFailed": "Actualisation impossible. Le contenu déjà chargé reste disponible.",
    "recovery.progressUnavailable": "Progression indisponible",
  },
  "es-ES": {
    "recovery.chaptersFailed": "No se pudieron cargar los capítulos. Comprueba la conexión y reintenta.",
    "recovery.refreshFailed": "No se pudo actualizar. El contenido cargado anteriormente sigue disponible.",
    "recovery.progressUnavailable": "Progreso no disponible",
  },
} as const satisfies Record<UiLocale, Record<string, string>>
