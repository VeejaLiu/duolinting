import type { UiLocale } from '@duolinting/domain'

/** 移动浏览器访问 Web 学习端时的体验引导。 */
export const mobileExperiencePromptMessages: Record<UiLocale, Record<string, string>> = {
  'zh-CN': {
    'mobileExperience.eyebrow': '移动端体验更好',
    'mobileExperience.title': '要打开移动版吗？',
    'mobileExperience.description': '移动版针对手机屏幕重新设计，练习、播放和逐句学习更顺手。',
    'mobileExperience.stay': '继续使用网页版',
    'mobileExperience.countdown': '{{seconds}} 秒后自动打开移动版',
    'mobileExperience.close': '关闭移动版提示',
  },
  'en-US': {
    'mobileExperience.eyebrow': 'Built for your phone',
    'mobileExperience.title': 'Open the mobile version?',
    'mobileExperience.description': 'The mobile version is designed for smaller screens, with easier practice, playback, and sentence study.',
    'mobileExperience.stay': 'Stay on web',
    'mobileExperience.countdown': 'Opening mobile version in {{seconds}}s',
    'mobileExperience.close': 'Close mobile version prompt',
  },
  'th-TH': {
    'mobileExperience.eyebrow': 'ประสบการณ์ที่ดีกว่าบนมือถือ',
    'mobileExperience.title': 'ต้องการเปิดเวอร์ชันมือถือไหม',
    'mobileExperience.description': 'เวอร์ชันมือถือออกแบบมาสำหรับหน้าจอขนาดเล็ก ช่วยให้ฝึก ฟัง และเรียนทีละประโยคได้สะดวกขึ้น',
    'mobileExperience.stay': 'ใช้เว็บต่อ',
    'mobileExperience.countdown': 'กำลังเปิดเวอร์ชันมือถือในอีก {{seconds}} วินาที',
    'mobileExperience.close': 'ปิดคำแนะนำเวอร์ชันมือถือ',
  },
  'ja-JP': {
    'mobileExperience.eyebrow': 'スマホでより快適に',
    'mobileExperience.title': 'モバイル版を開きますか？',
    'mobileExperience.description': 'モバイル版は小さな画面向けに設計され、練習、再生、文ごとの学習をより快適に行えます。',
    'mobileExperience.stay': 'Web版を続ける',
    'mobileExperience.countdown': '{{seconds}}秒後にモバイル版を自動で開きます',
    'mobileExperience.close': 'モバイル版の案内を閉じる',
  },
  "fr-FR": {
    "mobileExperience.eyebrow": "Conçu pour votre téléphone",
    "mobileExperience.title": "Ouvrir la version mobile ?",
    "mobileExperience.description": "La version mobile est conçue pour les petits écrans et facilite la pratique, la lecture et l’étude des phrases.",
    "mobileExperience.stay": "Rester sur le Web",
    "mobileExperience.countdown": "Ouverture de la version mobile dans {{seconds}} s",
    "mobileExperience.close": "Fermer la proposition de version mobile"
},
  "es-ES": {
    "mobileExperience.eyebrow": "Diseñado para tu teléfono",
    "mobileExperience.title": "¿Abrir la versión móvil?",
    "mobileExperience.description": "La versión móvil está diseñada para pantallas pequeñas y facilita la práctica, la reproducción y el estudio por frases.",
    "mobileExperience.stay": "Seguir en la web",
    "mobileExperience.countdown": "La versión móvil se abrirá en {{seconds}} s",
    "mobileExperience.close": "Cerrar aviso de versión móvil"
},
}
