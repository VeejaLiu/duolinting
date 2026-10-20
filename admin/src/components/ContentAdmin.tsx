import type { CatalogExerciseSummary } from '@duolinting/shared'
import { ConfigProvider, Layout } from 'antd'
import { useCallback, useState } from 'react'
import { useCatalogActions } from '../hooks/content-workspace/useCatalogActions'
import { useImporterNavigation } from '../hooks/content-workspace/useImporterNavigation'
import { useWorkspaceData } from '../hooks/content-workspace/useWorkspaceData'
import { useAdminLanguage } from '../i18n/AdminLanguageProvider'
import { apiClient } from '../lib/apiClient'
import { AudioLessonImporter } from './AudioLessonImporter'
import { AcceptedAnswerFeedbackPanel } from './admin/AcceptedAnswerFeedbackPanel'
import { AccountSettingsPanel } from './admin/AccountSettingsPanel'
import type { AdminNoticeTone } from './admin/AdminFeedback'
import { AdminWorkspaceNav } from './admin/AdminWorkspaceNav'
import { CollaborationManager } from './admin/CollaborationManager'
import { CourseManager } from './admin/CourseManager'
import { DirectoryManager } from './admin/DirectoryManager'
import { ListeningVideoRecorder } from './admin/ListeningVideoRecorder'
import { OpenContentApiDocumentation } from './admin/OpenContentApiDocumentation'
import { ContentImportTokenManager } from './admin/ContentImportTokenManager'
import { OpenContentApiKeyManager } from './admin/OpenContentApiKeyManager'
import { TaskPoolManager } from './admin/TaskPoolManager'
import { SponsorManager } from './admin/SponsorManager'
import { SubtitleReviewModal } from './admin/SubtitleReviewModal'
import { DonationManager } from './admin/DonationManager'
import { UserActivityPanel } from './admin/UserActivityPanel'
import { WorkflowActivityPanel } from './admin/WorkflowActivityPanel'
import type { ContentAdminProps } from './admin/content-workspace/types'

export function ContentAdmin({
  catalogRevision,
  adminToken,
  categoryGroups,
  categories,
  exercises,
  onRefreshCatalog,
  onEnsureCatalog,
  onEnsureExercises,
  onNotify,
  adminUser,
  onLogout,
  onRegisterBeforeLogout,
  onRequestConfirm,
  onRequestUnsavedLeaveConfirm,
}: ContentAdminProps) {
  const { t } = useAdminLanguage()
  const localizedNotify = useCallback((message: string, tone?: AdminNoticeTone) => {
    onNotify(t(message), tone)
  }, [onNotify, t])
  const {
    activeSection,
    isOpenContentDocumentation,
    navigate,
    importerDraft,
    setImporterDraft,
    setImporterHasUnsavedChanges,
    saveImporterBeforeLeaveRef,
    changeSection,
    openImporterForCategory,
    openImporterForExercise,
  } = useImporterNavigation({
    adminUser,
    categories,
    exercises,
    onRequestConfirm,
    onRequestUnsavedLeaveConfirm,
    onRegisterBeforeLogout,
  })
  const {
    categoryForm,
    setCategoryForm,
    categoryGroupForm,
    setCategoryGroupForm,
    isSaving,
    runAdminTask,
    saveCategoryGroup,
    saveCategory,
    deleteCategoryGroup,
    deleteCategory,
    moveCategoryGroup,
    moveCategory,
    deleteCourse,
    moveCourse,
  } = useCatalogActions({
    adminToken,
    categoryGroups,
    categories,
    onRefreshCatalog,
    onEnsureExercises,
    onRequestConfirm,
    localizedNotify,
  })
  const {
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
    workflowContributors,
    reviewTasks,
    workflowInbox,
    workflowNotifications,
    setWorkflowNotifications,
    refreshWorkflowInbox,
    openSubtitleReview,
  } = useWorkspaceData({
    adminToken,
    adminUser,
    exercises,
    onEnsureCatalog,
    onRefreshCatalog,
    onEnsureExercises,
    localizedNotify,
    activeSection,
  })

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1cb0f6' } }}>
      <Layout className="admin-workspace-layout" hasSider>
        <Layout.Sider
          breakpoint="lg"
          collapsed={isSidebarCollapsed}
          collapsedWidth={72}
          collapsible
          onCollapse={setIsSidebarCollapsed}
          trigger={null}
          width={248}
          theme="light"
        >
          <AdminWorkspaceNav
            activeSection={activeSection}
            adminUser={adminUser}
            collapsed={isSidebarCollapsed}
            onCollapsedChange={setIsSidebarCollapsed}
            onLogout={onLogout}
            onSectionChange={(section) => void changeSection(section)}
          />
        </Layout.Sider>
        <Layout.Content className="admin-workspace-content" aria-label={t('内容管理')}>

      {activeSection === 'importer' && (
        <AudioLessonImporter
          adminToken={adminToken}
          categoryGroups={categoryGroups}
          categories={categories}
          exercises={exercises}
          draft={importerDraft}
          onRefreshCatalog={onRefreshCatalog}
          onStatusChange={localizedNotify}
          onDraftConsumed={() => setImporterDraft(null)}
          onUnsavedChangesChange={setImporterHasUnsavedChanges}
          onRegisterSaveBeforeLeave={(handler) => {
            saveImporterBeforeLeaveRef.current = handler
          }}
          adminRole={adminUser.role}
        />
      )}

      {activeSection === 'recorder' && (
        <ListeningVideoRecorder
          adminToken={adminToken}
          categoryGroups={categoryGroups}
          categories={categories}
          exercises={exercises}
          onNotify={localizedNotify}
        />
      )}

      {activeSection === 'directory' && (
        <DirectoryManager
          adminToken={adminToken}
          categoryGroups={categoryGroups}
          categories={categories}
          categoryGroupForm={categoryGroupForm}
          categoryForm={categoryForm}
          isSaving={isSaving}
          onNotify={localizedNotify}
          onCategoryGroupFormChange={setCategoryGroupForm}
          onCategoryFormChange={setCategoryForm}
          onSaveCategoryGroup={saveCategoryGroup}
          onSaveCategory={saveCategory}
          onEditCategoryGroup={setCategoryGroupForm}
          onEditCategory={setCategoryForm}
          onDeleteCategoryGroup={deleteCategoryGroup}
          onDeleteCategory={deleteCategory}
          onMoveCategoryGroup={moveCategoryGroup}
          onMoveCategory={moveCategory}
          onRefresh={onRefreshCatalog}
          onRequestConfirm={onRequestConfirm}
        />
      )}

      {activeSection === 'sponsors' && adminUser.role === 'super_admin' && (
        <SponsorManager adminToken={adminToken} onNotify={localizedNotify} onRequestConfirm={onRequestConfirm} />
      )}

      {activeSection === 'donations' && adminUser.role === 'super_admin' && (
        <DonationManager adminToken={adminToken} onNotify={localizedNotify} onRequestConfirm={onRequestConfirm} />
      )}

      {activeSection === 'courses' && (
        <CourseManager
          catalogRevision={catalogRevision}
          adminToken={adminToken}
          currentAdminId={adminUser.id}
          categoryGroups={categoryGroups}
          categories={categories}
          isCatalogLoading={isCatalogLoading}
          catalogLoadError={catalogLoadError}
          onRefreshCatalog={() => refreshWorkspaceCatalog(true)}
          isSaving={isSaving}
          onCreateCourse={(categoryId) => {
            void openImporterForCategory(categoryId)
          }}
          onEditCourse={(exercise) => {
            void openImporterForExercise(exercise)
          }}
          onDeleteCourse={deleteCourse}
          onMoveCourse={moveCourse}
          onOpenRecorder={(exerciseId) => {
            navigate(`/recorder?exerciseId=${encodeURIComponent(exerciseId)}`)
          }}
          onRenameCourse={async (exercise, title) => {
            try {
              await apiClient.createExercise(
                {
                  id: exercise.id,
                  categoryId: exercise.categoryId,
                  title,
                  source: exercise.source,
                  sourceUrl: exercise.sourceUrl,
                  difficulty: exercise.difficulty,
                  durationLabel: exercise.durationLabel,
                  mediaType: exercise.mediaType,
                  audioUrl: exercise.audioUrl,
                  coverImageUrl: exercise.coverImageUrl,
                  summary: exercise.summary,
                  sortOrder: exercise.sortOrder,
                  // 透传原状态，避免把 archived 课程改回 published
                  status: exercise.status,
                },
                adminToken,
              )
              await onRefreshCatalog()
              localizedNotify('课程名称已更新', 'success')
            } catch (error) {
              localizedNotify(error instanceof Error ? error.message : '课程名称更新失败', 'error')
              throw error
            }
          }}
          canManageCourses={adminUser.role === 'super_admin'}
          onReviewSubtitleDraft={(exerciseId) => {
            void openSubtitleReview(exerciseId)
          }}
          reviewTasks={reviewTasks}
          workflowNotifications={workflowNotifications}
          onReadWorkflowNotifications={async () => {
            await apiClient.markWorkflowNotificationsRead(adminToken)
            setWorkflowNotifications((current) => ({
              ...current,
              unreadCount: 0,
              items: current.items.map((item) => ({ ...item, isRead: true })),
            }))
          }}
          contributors={workflowContributors}
          onNotify={localizedNotify}
          onUpdateWorkflowAssignee={async (exercise, workflowRole, adminUserId) => {
            try {
              await apiClient.updateExerciseWorkflowAssignee(exercise.id, workflowRole, adminUserId, adminToken)
              await onRefreshCatalog()
              localizedNotify(
                adminUserId
                  ? t('已更新“{{title}}”的{{role}}', { title: exercise.title, role: t(workflowRole === 'proofreader' ? '校对负责人' : '二审负责人') })
                  : t('已取消“{{title}}”的{{role}}', { title: exercise.title, role: t(workflowRole === 'proofreader' ? '校对负责人' : '二审负责人') }),
                'success',
              )
            } catch (error) {
              localizedNotify(error instanceof Error ? error.message : '更新工作流负责人失败', 'error')
              throw error
            }
          }}
        />
      )}

      {activeSection === 'account-settings' && adminUser.role === 'subtitle_contributor' && (
        <AccountSettingsPanel adminToken={adminToken} adminUser={adminUser} onNotify={localizedNotify} />
      )}

      {activeSection === 'feedback' && (
        <AcceptedAnswerFeedbackPanel
          isLoading={feedbackLoading}
          isSaving={isSaving}
          items={feedbackItems}
          onStatusChange={(feedbackId, status) =>
            void runAdminTask(async () => {
              await apiClient.updateAcceptedAnswerFeedbackStatus(
                feedbackId,
                { status },
                adminToken,
              )
              await refreshFeedback('all')
              localizedNotify('反馈状态已更新', 'success')
            }, '反馈状态更新失败')
          }
        />
      )}

      {activeSection === 'users' && (
        <UserActivityPanel
          adminToken={adminToken}
          report={growthReport}
          isLoading={growthLoading}
          onRefresh={() => {
            void refreshGrowth()
          }}
        />
      )}

      {activeSection === 'activity' && (
        <WorkflowActivityPanel
          adminToken={adminToken}
          currentAdminId={adminUser.id}
          onNotify={localizedNotify}
        />
      )}

      {activeSection === 'pool' && (
        <TaskPoolManager
          adminToken={adminToken}
          adminUser={adminUser}
          categoryGroups={categoryGroups}
          categories={categories}
          onNotify={localizedNotify}
          onClaimed={async () => {
            await refreshWorkflowInbox()
            await onRefreshCatalog()
          }}
          onReleased={async () => {
            await refreshWorkflowInbox()
            await onRefreshCatalog()
          }}
          onRequestConfirm={onRequestConfirm}
          workflowInbox={workflowInbox}
          reviewTasks={reviewTasks}
          onReviewSubtitleDraft={(exerciseId) => {
            void openSubtitleReview(exerciseId)
          }}
          onEditCourse={(exerciseId) => {
            void openImporterForExercise({ id: exerciseId } as CatalogExerciseSummary)
          }}
        />
      )}

      {activeSection === 'collaboration' && adminUser.role === 'super_admin' && (
        <CollaborationManager
          adminToken={adminToken}
          categoryGroups={categoryGroups}
          categories={categories}
          exercises={exercises}
          onEnsureExercises={onEnsureExercises}
          onNotify={localizedNotify}
        />
      )}

      {activeSection === 'api-keys' && adminUser.role === 'super_admin' && (
        isOpenContentDocumentation
          ? <OpenContentApiDocumentation
            onBack={() => navigate('/api-keys')}
            onNotify={localizedNotify}
          />
          : <><OpenContentApiKeyManager
            adminToken={adminToken}
            onNotify={localizedNotify}
            onOpenDocumentation={() => navigate('/api-keys/docs')}
            onRequestConfirm={onRequestConfirm}
          /><ContentImportTokenManager adminToken={adminToken} categories={categories} onNotify={localizedNotify} onRequestConfirm={onRequestConfirm} /></>
      )}

      {reviewingExercise && <SubtitleReviewModal
        exercise={reviewingExercise}
        key={reviewingExercise.id}
        onClose={() => setReviewingExercise(null)}
        onApprove={(draftId) => runAdminTask(async () => {
          await apiClient.approveSubtitleDraft(draftId, adminToken)
          setReviewingExercise(null)
          await onRefreshCatalog()
          await refreshWorkflowInbox()
          localizedNotify('字幕稿已通过二次审核并发布', 'success')
        }, '审核发布失败')}
        onReturn={(draftId, note) => runAdminTask(async () => {
          await apiClient.returnSubtitleDraft(draftId, note, adminToken)
          setReviewingExercise(null)
          await onRefreshCatalog()
          await refreshWorkflowInbox()
          localizedNotify('字幕稿已退回并附上修改意见', 'success')
        }, '退回字幕稿失败')}
      />}
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  )
}
