import type { AdminUser, CatalogExerciseSummary, ExerciseCategory, MaterialCategory } from '@duolinting/shared'
import type { AdminNoticeTone } from '../AdminFeedback'

export type ContentAdminProps = {
  adminToken: string
  categoryGroups: MaterialCategory[]
  categories: ExerciseCategory[]
  exercises: CatalogExerciseSummary[]
  onRefreshCatalog: () => Promise<void>
  onEnsureCatalog: () => Promise<void>
  onEnsureExercises: () => Promise<CatalogExerciseSummary[]>
  onNotify: (message: string, tone?: AdminNoticeTone) => void
  adminUser: AdminUser
  onLogout: () => void
  // 注册退出登录前的确认钩子（复用制课工作台的保存确认），null 表示注销
  onRegisterBeforeLogout?: (handler: (() => Promise<boolean>) | null) => void
  onRequestConfirm: (options: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'danger' | 'default'
  }) => Promise<boolean>
  onRequestUnsavedLeaveConfirm: () => Promise<'save' | 'discard' | 'cancel'>
}

export type ImporterDraft =
  | {
      mode: 'create'
      categoryId: number
    }
  | {
      mode: 'edit'
      exercise: CatalogExerciseSummary
    }
  | null
