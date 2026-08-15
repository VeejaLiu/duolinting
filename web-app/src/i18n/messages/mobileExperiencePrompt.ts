import type { UiLocale } from '@duolinting/domain'

/** 移动浏览器访问 Web 学习端时的体验引导。 */
export const mobileExperiencePromptMessages: Record<UiLocale, Record<string, string>> = {
  'zh-CN': {
    'mobileExperience.eyebrow': '移动端体验更好',
    'mobileExperience.title': '要打开移动版吗？',
    'mobileExperience.description': '移动版针对手机屏幕重新设计，练习、播放和逐句学习更顺手。',
    'mobileExperience.stay': '继续使用网页版',
    'mobileExperience.open': '打开移动版',
    'mobileExperience.close': '关闭移动版提示',
  },
  'en-US': {
    'mobileExperience.eyebrow': 'Built for your phone',
    'mobileExperience.title': 'Open the mobile version?',
    'mobileExperience.description': 'The mobile version is designed for smaller screens, with easier practice, playback, and sentence study.',
    'mobileExperience.stay': 'Stay on web',
    'mobileExperience.open': 'Open mobile version',
    'mobileExperience.close': 'Close mobile version prompt',
  },
  'th-TH': {
    'mobileExperience.eyebrow': 'ประสบการณ์ที่ดีกว่าบนมือถือ',
    'mobileExperience.title': 'ต้องการเปิดเวอร์ชันมือถือไหม',
    'mobileExperience.description': 'เวอร์ชันมือถือออกแบบมาสำหรับหน้าจอขนาดเล็ก ช่วยให้ฝึก ฟัง และเรียนทีละประโยคได้สะดวกขึ้น',
    'mobileExperience.stay': 'ใช้เว็บต่อ',
    'mobileExperience.open': 'เปิดเวอร์ชันมือถือ',
    'mobileExperience.close': 'ปิดคำแนะนำเวอร์ชันมือถือ',
  },
  'ja-JP': {
    'mobileExperience.eyebrow': 'スマホでより快適に',
    'mobileExperience.title': 'モバイル版を開きますか？',
    'mobileExperience.description': 'モバイル版は小さな画面向けに設計され、練習、再生、文ごとの学習をより快適に行えます。',
    'mobileExperience.stay': 'Web版を続ける',
    'mobileExperience.open': 'モバイル版を開く',
    'mobileExperience.close': 'モバイル版の案内を閉じる',
  },
}
