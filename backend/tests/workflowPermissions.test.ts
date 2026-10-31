import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { sequelize } from '../src/models/db-config-mysql';
import { canAccessExerciseWorkflow, canEditExerciseSubtitles } from '../src/general/admin/collaboration/permissions';
import { listMySubtitleWorkflowInbox } from '../src/general/admin/collaboration/inbox';

test('approved authors and actual reviewers can read their published work without regaining edit rights', async () => {
    const database = new DatabaseSync(':memory:');
    database.function('utc_timestamp', () => '2026-10-31 08:00:00');
    database.exec(`
        create table exercises (id integer primary key, status text, title text, localizations_json text);
        create table admin_users (id integer primary key, display_name text);
        create table exercise_contributor_assignments (id integer primary key, exercise_id integer, admin_user_id integer);
        create table exercise_workflow_assignees (id integer primary key, exercise_id integer, admin_user_id integer, workflow_role text, claim_expires_at text, assignment_source text, updated_at text);
        create table exercise_subtitle_drafts (id integer primary key, exercise_id integer, admin_user_id integer, reviewer_admin_user_id integer, reviewed_by_admin_user_id integer, status text, submitted_at text, updated_at text, review_note text);
        insert into admin_users values (10, 'Author'), (20, 'Reviewer'), (21, 'Other reviewer');
        insert into exercises (id, status) values (1, 'published'), (2, 'draft'), (3, 'proofread'), (4, 'published');
        update exercises set title = 'Course', localizations_json = '{}';
        insert into exercise_subtitle_drafts (id, exercise_id, admin_user_id, reviewer_admin_user_id, reviewed_by_admin_user_id, status) values
            (1, 1, 10, 20, 20, 'approved'),
            (2, 2, 10, 20, 20, 'returned'),
            (3, 3, 10, 20, null, 'submitted'),
            (4, 4, 10, 21, 20, 'approved');
        insert into exercise_contributor_assignments values (1, 1, 10);
        insert into exercise_workflow_assignees (id, exercise_id, admin_user_id, workflow_role) values (1, 1, 10, 'proofreader');
    `);
    // Run the emitted permission SQL against fixtures instead of connecting to a local or shared MySQL instance.
    const originalQuery = sequelize.query;
    sequelize.query = (async (sql: string, options: { replacements?: (string | number | null)[] | Record<string, string | number | null> }) => {
        const params = options.replacements ?? [];
        return Array.isArray(params) ? database.prepare(sql).all(...params) : database.prepare(sql).all(params);
    }) as typeof sequelize.query;
    const member = (id: number) => ({ id, role: 'subtitle_contributor' as const });
    try {
        assert.equal(await canAccessExerciseWorkflow(member(10), 1), true, 'approved author retains read access');
        assert.equal(await canAccessExerciseWorkflow(member(20), 1), true, 'actual reviewer retains read access after reassignment');
        assert.equal(await canEditExerciseSubtitles(member(10), 1), false, 'approval never grants editing');
        assert.equal(await canEditExerciseSubtitles(member(20), 1), false);
        assert.equal(await canAccessExerciseWorkflow(member(30), 1), false, 'unrelated contributors have no access');
        assert.equal(await canAccessExerciseWorkflow(member(20), 2), false, 'a returned review is not completed ownership');
        assert.equal(await canAccessExerciseWorkflow(member(20), 3), true, 'pending reviewer access is preserved');
        assert.equal(await canAccessExerciseWorkflow(member(21), 4), false, 'only the actual reviewer receives completed access');
        const publishedHistory = await listMySubtitleWorkflowInbox(10);
        assert.equal(publishedHistory.items.find((item) => item.exerciseId === 1)?.courseStatus, 'published');
        database.exec("update exercises set status = 'draft' where id = 1");
        assert.equal(await canAccessExerciseWorkflow(member(10), 1), false, 'completion must not expose a later unpublished revision');
        const revertedHistory = await listMySubtitleWorkflowInbox(10);
        assert.equal(revertedHistory.items.find((item) => item.exerciseId === 1)?.stage, 'completed', 'historical contribution is preserved');
        assert.equal(revertedHistory.items.find((item) => item.exerciseId === 1)?.courseStatus, 'draft', 'history must expose that the published view is no longer available');
    } finally {
        sequelize.query = originalQuery;
        database.close();
    }
});
