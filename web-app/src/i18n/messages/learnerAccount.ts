import type { UiLocale } from '@duolinting/domain'

// useLearnerAccount.ts 账号状态提示的文案。key 统一使用 `account.` 前缀。
export const learnerAccountMessages: Record<UiLocale, Record<string, string>> = {
  'zh-CN': {
    'account.loggedOut': '未登录',
    'account.loggedIn': '账号已登录',
    'account.sessionExpired': '登录已失效',
    'account.progressSynced': '已同步账号进度',
    'account.noRecords': '这个账号还没有学习记录',
    'account.syncFailed': '账号进度同步失败',
    'account.progressSaved': '学习记录已保存',
    'account.saveFailed': '保存失败',
  },
  'en-US': {
    'account.loggedOut': 'Not logged in',
    'account.loggedIn': 'Logged in',
    'account.sessionExpired': 'Your session has expired',
    'account.progressSynced': 'Account progress synced',
    'account.noRecords': 'No learning records for this account yet',
    'account.syncFailed': 'Failed to sync account progress',
    'account.progressSaved': 'Learning progress saved',
    'account.saveFailed': 'Save failed',
  },
  'th-TH': {
    'account.loggedOut': 'ยังไม่ได้เข้าสู่ระบบ',
    'account.loggedIn': 'เข้าสู่ระบบแล้ว',
    'account.sessionExpired': 'เซสชันของคุณหมดอายุแล้ว',
    'account.progressSynced': 'ซิงก์ความคืบหน้าของบัญชีแล้ว',
    'account.noRecords': 'บัญชีนี้ยังไม่มีบันทึกการเรียน',
    'account.syncFailed': 'ซิงก์ความคืบหน้าของบัญชีไม่สำเร็จ',
    'account.progressSaved': 'บันทึกความคืบหน้าการเรียนแล้ว',
    'account.saveFailed': 'บันทึกไม่สำเร็จ',
  },
  'ja-JP': {
    'account.loggedOut': '未ログイン',
    'account.loggedIn': 'ログイン済み',
    'account.sessionExpired': 'セッションの有効期限が切れました',
    'account.progressSynced': 'アカウントの進捗を同期しました',
    'account.noRecords': 'このアカウントにはまだ学習記録がありません',
    'account.syncFailed': 'アカウントの進捗の同期に失敗しました',
    'account.progressSaved': '学習記録を保存しました',
    'account.saveFailed': '保存に失敗しました',
  },
}
