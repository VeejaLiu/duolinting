import assert from 'node:assert/strict'
import test from 'node:test'
import type { AdminSubtitleWorkflowTaskInbox, CatalogExerciseSummary } from '@duolinting/shared'
import {
  applySubtitleReviewDecision,
  canEditCourseSubtitles,
  refreshWorkflowData,
  refreshReviewLists,
  runSubtitleReviewDecision,
} from '../src/lib/subtitleWorkflow.ts'

test('approval becomes visible before refresh finishes and a failed refresh cannot undo success', async () => {
  let finishRefresh!: (succeeded: boolean) => void
  const refresh = new Promise<boolean>((resolve) => { finishRefresh = resolve })
  const events: string[] = []
  const pending = runSubtitleReviewDecision({
    commit: async () => {},
    onCommitted: () => { events.push('published') },
    refresh: () => refresh,
    onRefreshed: (succeeded) => { events.push(succeeded ? 'refreshed' : 'refresh-failed') },
  })
  await Promise.resolve()
  assert.deepEqual(events, ['published'])
  finishRefresh(false)
  assert.equal(await pending, true)
  assert.deepEqual(events, ['published', 'refresh-failed'])
})

test('an approval failure leaves the draft open and never refreshes or announces completion', async () => {
  const events: string[] = []
  await assert.rejects(runSubtitleReviewDecision({
    commit: async () => { throw new Error('Not assigned') },
    onCommitted: () => { events.push('published') },
    refresh: async () => { events.push('refresh'); return true },
    onRefreshed: () => { events.push('refreshed') },
  }), /Not assigned/)
  assert.deepEqual(events, [])
})

test('an unexpected refresh rejection still reports the committed review as successful', async () => {
  let refreshed: boolean | undefined
  assert.equal(await runSubtitleReviewDecision({
    commit: async () => {},
    onCommitted: () => {},
    refresh: async () => { throw new Error('Offline') },
    onRefreshed: (succeeded) => { refreshed = succeeded },
  }), true)
  assert.equal(refreshed, false)
})

test('refresh preserves successful reads when a sibling read fails, and retry only repeats reads', async () => {
  const state = { tasks: 'pending', notifications: 'old', catalog: 'old' }
  let offline = true
  const reads = [
    async () => { state.tasks = 'completed' },
    async () => { if (offline) throw new Error('Offline'); state.notifications = 'new' },
    async () => { state.catalog = 'new' },
  ]
  assert.equal(await refreshWorkflowData(reads), false)
  assert.deepEqual(state, { tasks: 'completed', notifications: 'old', catalog: 'new' })
  offline = false
  assert.equal(await refreshWorkflowData(reads), true)
  assert.deepEqual(state, { tasks: 'completed', notifications: 'new', catalog: 'new' })
})

test('completion waits for the actual course rows and retains a retry outcome if that read is discarded', async () => {
  let finishPage!: (succeeded: boolean) => void
  const page = new Promise<boolean>((resolve) => { finishPage = resolve })
  let completed = false
  const pending = refreshReviewLists({
    refreshCatalog: async () => {},
    refreshInbox: async () => true,
    refreshCourseList: () => page,
  }).then((succeeded) => { completed = true; return succeeded })
  await Promise.resolve()
  assert.equal(completed, false)
  finishPage(false)
  assert.equal(await pending, false)
  assert.equal(await refreshReviewLists({
    refreshCatalog: async () => {}, refreshInbox: async () => true, refreshCourseList: async () => true,
  }), true)
})

const inbox: AdminSubtitleWorkflowTaskInbox = {
  items: [
    { draftId: 7, exerciseId: 3, exerciseTitle: 'Course', contributorDisplayName: 'Author', role: 'second_reviewer', stage: 'awaiting_review', draftStatus: 'submitted' },
    { draftId: 8, exerciseId: 4, exerciseTitle: 'Other course', contributorDisplayName: 'Other', role: 'second_reviewer', stage: 'awaiting_review', draftStatus: 'submitted' },
  ],
  counts: { proofreading: 0, awaitingReview: 2, returned: 0, completedProofreading: 0, completedSecondReview: 0 },
}

test('a committed approval immediately moves its task into history and updates the counters', () => {
  const result = applySubtitleReviewDecision(inbox, 7, 'approved', '2026-10-31T08:00:00Z')
  assert.equal(result.items[0].stage, 'completed')
  assert.equal(result.items[0].draftStatus, 'approved')
  assert.equal(result.items[0].updatedAt, '2026-10-31T08:00:00Z')
  assert.equal(result.items[1].stage, 'awaiting_review')
  assert.equal(result.counts.awaitingReview, 1)
  assert.equal(result.counts.completedSecondReview, 1)
  assert.equal(inbox.items[0].stage, 'awaiting_review')
})

test('a returned draft leaves the reviewer queue without being counted as completed', () => {
  const result = applySubtitleReviewDecision(inbox, 7, 'returned', '2026-10-31T08:00:00Z')
  assert.deepEqual(result.items.map((item) => item.draftId), [8])
  assert.equal(result.counts.awaitingReview, 1)
  assert.equal(result.counts.completedSecondReview, 0)
})

const course = (draftStatus: 'editing' | 'submitted' | 'approved' | 'returned'): CatalogExerciseSummary => ({
  id: 3, categoryId: 1, title: 'Course', source: '', difficulty: 'beginner', durationLabel: '1:00',
  mediaType: 'audio', audioUrl: '/media/test.mp3', summary: '', status: 'published', sortOrder: 1, lineCount: 1,
  workflow: {
    stage: 'published', proofreaderAssignee: { adminUserId: 10, displayName: 'Author' },
    secondReviewerAssignee: { adminUserId: 20, displayName: 'Reviewer' },
    drafts: [{ adminUserId: 10, contributorDisplayName: 'Author', status: draftStatus }],
  },
})

test('a completed or submitted author cannot fall through to a misleading edit button', () => {
  for (const status of ['approved', 'submitted'] as const) {
    assert.equal(canEditCourseSubtitles(course(status), 10, false, []), false)
  }
  assert.equal(canEditCourseSubtitles(course('returned'), 10, false, []), true)
  assert.equal(canEditCourseSubtitles(course('editing'), 10, false, []), true)
  assert.equal(canEditCourseSubtitles(course('approved'), 20, false, []), false)
  assert.equal(canEditCourseSubtitles(course('approved'), 99, true, []), true)
})

test('legacy assignments remain editable while review-only and differently assigned members do not', () => {
  assert.equal(canEditCourseSubtitles({ ...course('editing'), workflow: undefined }, 10, false, []), true)
  assert.equal(canEditCourseSubtitles(course('editing'), 30, false, []), false)
  assert.equal(canEditCourseSubtitles(course('editing'), 10, false, [{ draftId: 7, exerciseId: 3, exerciseTitle: 'Course', contributorDisplayName: 'Author', submittedAt: '' }]), false)
})
