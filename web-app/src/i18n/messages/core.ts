import type { UiLocale } from '@duolinting/domain'

// 通用/外壳文案：品牌、语言设置、顶栏、阶段栏、快捷键提示。
// key 规则：全局通用词用单词 key，组件级文案用 `模块.语义` 前缀。
export const coreMessages: Record<UiLocale, Record<string, string>> = {
  'zh-CN': {
    brand: '多邻听',
    courseLabel: '听力课程',
    login: '登录',
    language: '语言',
    interfaceLanguage: '界面语言',
    contentLanguage: '学习内容语言',
    preferences: '语言偏好',
    'topbar.learningOverview': '学习概览',
    'stageRail.label': '学习阶段',
    'tooltip.shortcut': '快捷键：{{shortcut}}',
  },
  'en-US': {
    brand: 'DuolinTing',
    courseLabel: 'Listening courses',
    login: 'Log in',
    language: 'Language',
    interfaceLanguage: 'Interface language',
    contentLanguage: 'Learning content language',
    preferences: 'Language preferences',
    'topbar.learningOverview': 'Learning overview',
    'stageRail.label': 'Learning stages',
    'tooltip.shortcut': 'Shortcut: {{shortcut}}',
  },
  'th-TH': {
    brand: 'DuolinTing',
    courseLabel: 'คอร์สฝึกฟัง',
    login: 'เข้าสู่ระบบ',
    language: 'ภาษา',
    interfaceLanguage: 'ภาษาของหน้าจอ',
    contentLanguage: 'ภาษาของเนื้อหาการเรียน',
    preferences: 'การตั้งค่าภาษา',
    'topbar.learningOverview': 'ภาพรวมการเรียน',
    'stageRail.label': 'ขั้นตอนการเรียน',
    'tooltip.shortcut': 'ปุ่มลัด: {{shortcut}}',
  },
  'ja-JP': {
    brand: 'DuolinTing',
    courseLabel: 'リスニングコース',
    login: 'ログイン',
    language: '言語',
    interfaceLanguage: '表示言語',
    contentLanguage: '学習コンテンツの言語',
    preferences: '言語設定',
    'topbar.learningOverview': '学習概要',
    'stageRail.label': '学習ステージ',
    'tooltip.shortcut': 'ショートカット：{{shortcut}}',
  },
}
