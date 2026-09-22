import type {
  AcceptedAnswerFeedback,
  AdminGrowthReport,
  AdminMember,
  AdminReviewTask,
  AdminSubtitleWorkflowTaskInbox,
  AdminWorkflowNotifications,
  FeedbackStatus,
} from '@duolinting/shared'
import { useCallback, useEffect, useState } from 'react'
import { type AdminSection } from '../../components/admin/AdminWorkspaceNav'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import { apiClient } from '../../lib/apiClient'
import type { ContentAdminProps } from '../../components/admin/content-workspace/types'

type WorkspaceDataOptions = Pick<ContentAdminProps, 'adminToken' | 'adminUser' | 'exercises' | 'onEnsureCatalog' | 'onEnsureExercises'> & {
  localizedNotify: ContentAdminProps['onNotify']
  activeSection: AdminSection
}

export function useWorkspaceData({
  adminToken,
  adminUser,
  exercises,
  onEnsureCatalog,
  onEnsureExercises,
  localizedNotify,
  activeSection,
}: WorkspaceDataOptions) {
  const { t } = useAdminLanguage()

  const [isCatalogLoading, setIsCatalogLoading] = useState(false)
  const [catalogLoadError, setCatalogLoadError] = useState('')
  const [feedbackItems, setFeedbackItems] = useState<AcceptedAnswerFeedback[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [growthReport, setGrowthReport] = useState<AdminGrowthReport | null>(null)
  const [growthLoading, setGrowthLoading] = useState(false)
  const [reviewingExercise, setReviewingExercise] = useState<import('@duolinting/shared').ListeningExercise | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [workflowContributors, setWorkflowContributors] = useState<AdminMember[]>([])
  const [reviewTasks, setReviewTasks] = useState<AdminReviewTask[]>([])
  const [workflowInbox, setWorkflowInbox] = useState<AdminSubtitleWorkflowTaskInbox>({ items: [], counts: { proofreading: 0, awaitingReview: 0, returned: 0, completedProofreading: 0, completedSecondReview: 0 } })
  const [workflowNotifications, setWorkflowNotifications] = useState<AdminWorkflowNotifications>({ items: [], unreadCount: 0 })

  const refreshWorkspaceCatalog = useCallback(async () => {
    setIsCatalogLoading(true)
    setCatalogLoadError('')
    try {
      await onEnsureCatalog()
    } catch (error) {
      const message = error instanceof Error ? error.message : t('目录数据加载失败')
      setCatalogLoadError(message)
      localizedNotify(message, 'error')
      throw error
    } finally {
      setIsCatalogLoading(false)
    }
  }, [localizedNotify, onEnsureCatalog, t])

  const refreshWorkflowContributors = useCallback(async () => {
    if (adminUser.role !== 'super_admin') {
      setWorkflowContributors([])
      return
    }
    try {
      const result = await apiClient.getAdminMembers(adminToken)
      // 校对和二次审核都由字幕贡献者承担；超级管理员只在此配置负责人。
      setWorkflowContributors(result.items.filter((member) => member.role === 'subtitle_contributor'))
    } catch (error) {
      localizedNotify(error instanceof Error ? error.message : '字幕贡献者加载失败', 'error')
    }
  }, [adminToken, adminUser.role, localizedNotify])

  const refreshWorkflowInbox = useCallback(async () => {
    try {
      const [tasks, notifications, inbox] = await Promise.all([
        apiClient.getMySubtitleReviewTasks(adminToken),
        apiClient.getMyWorkflowNotifications(adminToken),
        apiClient.getMySubtitleWorkflowInbox(adminToken),
      ])
      setReviewTasks(tasks.items)
      setWorkflowNotifications(notifications)
      setWorkflowInbox(inbox)
    } catch (error) {
      localizedNotify(error instanceof Error ? error.message : '工作流待办加载失败', 'error')
    }
  }, [adminToken, localizedNotify])

  const openSubtitleReview = useCallback(async (exerciseId: number) => {
    try {
      const detail = await apiClient.getAdminExercise(exerciseId, adminToken)
      if (!detail.subtitleDrafts?.length) {
        localizedNotify('这门课程当前没有待二次审核的字幕稿', 'info')
        return
      }
      setReviewNote('')
      setReviewingExercise(detail)
    } catch (error) {
      localizedNotify(error instanceof Error ? error.message : '加载字幕稿失败', 'error')
    }
  }, [adminToken, localizedNotify])

  useEffect(() => {
    // 课程授权要按“内容分类 → 学习系列 → 课程”分级显示，
    // 因此进入人员管理时也必须刷新目录数据，不能只依赖此前访问过课程页的缓存。
    // 任务广场的分类筛选器同样依赖目录数据，直接进入 /pool 时也要加载。
    if (activeSection !== 'directory' && activeSection !== 'courses' && activeSection !== 'importer' && activeSection !== 'recorder' && activeSection !== 'collaboration' && activeSection !== 'pool') {
      return
    }

    void refreshWorkspaceCatalog().catch(() => undefined)
  }, [activeSection, refreshWorkspaceCatalog])

  useEffect(() => {
    // 协作页的课程授权同样需要完整课程列表，用于逐级勾选和全选。
    if (activeSection !== 'importer' && activeSection !== 'recorder' && activeSection !== 'collaboration') {
      return
    }

    void onEnsureExercises().catch((error) => {
      localizedNotify(error instanceof Error ? error.message : '课程数据加载失败', 'error')
    })
  }, [activeSection, exercises.length, localizedNotify, onEnsureExercises])

  useEffect(() => {
    if (activeSection === 'courses' || activeSection === 'pool') {
      void refreshWorkflowContributors()
      void refreshWorkflowInbox()
    }
  }, [activeSection, refreshWorkflowContributors, refreshWorkflowInbox])

  const refreshFeedback = useCallback(async (status?: FeedbackStatus | 'all') => {
    setFeedbackLoading(true)
    try {
      const response = await apiClient.getAcceptedAnswerFeedback(adminToken, status)
      setFeedbackItems(response.items)
    } catch (error) {
      // 失败最常见的原因是 admin 登录态过期（401），提示里顺带引导重新登录
      localizedNotify(
        `反馈数据加载失败：${error instanceof Error ? error.message : '未知错误'}；若提示未授权，请重新登录管理员账号`,
        'error',
      )
    } finally {
      setFeedbackLoading(false)
    }
  }, [adminToken, localizedNotify])

  useEffect(() => {
    if (activeSection !== 'feedback') {
      return
    }

    void refreshFeedback('all')
  }, [activeSection, refreshFeedback])

  const refreshGrowth = useCallback(async () => {
    setGrowthLoading(true)
    try {
      const response = await apiClient.getAdminGrowth(adminToken)
      setGrowthReport(response)
    } catch (error) {
      // 失败最常见的原因是 admin 登录态过期（401），提示里顺带引导重新登录
      localizedNotify(
        `增长数据加载失败：${error instanceof Error ? error.message : '未知错误'}；若提示未授权，请重新登录管理员账号`,
        'error',
      )
    } finally {
      setGrowthLoading(false)
    }
  }, [adminToken, localizedNotify])

  useEffect(() => {
    if (activeSection !== 'users') {
      return
    }

    void refreshGrowth()
  }, [activeSection, refreshGrowth])
  return {
    isCatalogLoading,
    catalogLoadError,
    refreshWorkspaceCatalog,
    feedbackItems,
    feedbackLoading,
    refreshFeedback,
    growthReport,
    growthLoading,
    refreshGrowth,
    reviewingExercise,
    setReviewingExercise,
    reviewNote,
    setReviewNote,
    workflowContributors,
    reviewTasks,
    workflowInbox,
    workflowNotifications,
    setWorkflowNotifications,
    refreshWorkflowInbox,
    openSubtitleReview,
  }
}

