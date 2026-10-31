import type { AdminReviewTask, AdminSubtitleWorkflowTaskInbox, CatalogExerciseSummary } from '@duolinting/shared'

/** A committed review remains successful even when the subsequent, read-only refresh fails. */
export async function runSubtitleReviewDecision({ commit, onCommitted, refresh, onRefreshed }: {
  commit: () => Promise<unknown>
  onCommitted: () => void
  refresh: () => Promise<boolean>
  onRefreshed: (succeeded: boolean) => void
}): Promise<boolean> {
  await commit()
  onCommitted()
  let succeeded = false
  try {
    succeeded = await refresh()
  } catch {
    // Publication is already committed. A read failure must never invite another approval.
  }
  onRefreshed(succeeded)
  return true
}

/** Each read applies its own result so a failed notification request cannot keep completed tasks pending. */
export async function refreshWorkflowData(reads: Array<() => Promise<unknown>>): Promise<boolean> {
  const results = await Promise.allSettled(reads.map((read) => Promise.resolve().then(read)))
  return results.every((result) => result.status === 'fulfilled' && result.value !== false)
}

/** Catalog metadata does not contain the paged course rows. Include that independent read when mounted. */
export function refreshReviewLists({ refreshCatalog, refreshInbox, refreshCourseList }: {
  refreshCatalog: () => Promise<void>
  refreshInbox: () => Promise<boolean>
  refreshCourseList?: () => Promise<boolean>
}): Promise<boolean> {
  return refreshWorkflowData([refreshCatalog, refreshInbox, ...(refreshCourseList ? [refreshCourseList] : [])])
}

export function applySubtitleReviewDecision(
  inbox: AdminSubtitleWorkflowTaskInbox,
  draftId: number,
  decision: 'approved' | 'returned',
  reviewedAt: string,
): AdminSubtitleWorkflowTaskInbox {
  // Update only the task actually reviewed; other drafts for this course retain their own state.
  const items = inbox.items.flatMap((task) => {
    if (task.draftId !== draftId || task.stage !== 'awaiting_review') return [task]
    return decision === 'returned' ? [] : [{ ...task, stage: 'completed' as const, draftStatus: 'approved' as const, courseStatus: 'published' as const, updatedAt: reviewedAt }]
  })
  return {
    items,
    counts: {
      proofreading: items.filter((task) => task.stage === 'proofreading').length,
      awaitingReview: items.filter((task) => task.stage === 'awaiting_review').length,
      returned: items.filter((task) => task.stage === 'returned').length,
      completedProofreading: items.filter((task) => task.stage === 'completed' && task.role === 'proofreader').length,
      completedSecondReview: items.filter((task) => task.stage === 'completed' && task.role === 'second_reviewer').length,
    },
  }
}

export function canEditCourseSubtitles(
  exercise: CatalogExerciseSummary,
  currentAdminId: number,
  canManageCourses: boolean,
  reviewTasks: AdminReviewTask[],
): boolean {
  if (canManageCourses) return true
  const ownDraft = exercise.workflow?.drafts?.find((draft) => draft.adminUserId === currentAdminId)
  // Submitted/approved personal drafts are locked by the backend, including legacy assignments.
  if (ownDraft && ['submitted', 'approved'].includes(ownDraft.status)) return false
  if (reviewTasks.some((task) => task.exerciseId === exercise.id)) return false
  const proofreader = exercise.workflow?.proofreaderAssignee
  if (proofreader) return proofreader.adminUserId === currentAdminId
  // Courses without a configured proofreader retain their legacy explicit-assignment behavior.
  return exercise.workflow?.secondReviewerAssignee?.adminUserId !== currentAdminId
}
