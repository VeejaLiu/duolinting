import { createHash, randomBytes } from 'node:crypto';
import { QueryTypes, type Transaction } from 'sequelize';
import type { ListeningExercise, ContentLocale, TranscriptLine } from '../../domain';
import type { CourseReleaseManifest, CourseWaveform } from '@duolinting/shared' with { 'resolution-mode': 'import' };
import { sequelize } from '../../models/db-config-mysql';
import { getManagedMediaObjectName, buildPublicMediaUrl } from '../media/media-service';
import { createManifest, digest } from './release-contract';
import { ensureMediaAnalysis } from './media-analysis';

const parse = <T>(value: unknown): T => (typeof value === 'string' ? JSON.parse(value) : value) as T;
const delivery = (url: string) => { const object = getManagedMediaObjectName(url); return object ? buildPublicMediaUrl(object) : url; };
export const sameMedia = (a: string, b: string) => a === b || Boolean(getManagedMediaObjectName(a) && getManagedMediaObjectName(a) === getManagedMediaObjectName(b));
export function assertExpectedMedia(actual: string, expected: unknown) {
    if (typeof expected !== 'string' || !sameMedia(actual, expected)) throw new Error('课程媒体已变化，请重新打开课程并校准字幕');
}

type ReleaseRow = { id: number; exercise_id: number; media_url: string; snapshot_json: unknown; manifest_json: unknown; state: 'preview' | 'published'; created_by_admin_id: number };
export function decodeRelease(row: ReleaseRow, locale?: ContentLocale): ListeningExercise {
    const course = parse<ListeningExercise>(row.snapshot_json);
    const manifest = parse<Omit<CourseReleaseManifest,'courseReleaseId'|'state'>>(row.manifest_json);
    return { ...course, audioUrl: delivery(course.audioUrl),
        title: locale ? course.localizations?.[locale]?.title ?? course.title : course.title,
        summary: locale ? course.localizations?.[locale]?.summary ?? course.summary : course.summary,
        lines: course.lines.map((line, index) => ({ ...line, id: String(line.id ?? `l${index+1}`), start: Number(line.start), end: Number(line.end), text: String(line.text ?? ''), answers: Array.isArray(line.answers) ? line.answers : [], keywords: Array.isArray(line.keywords) ? line.keywords : [], translation: (locale ? line.translations?.[locale] ?? (locale === 'zh-CN' ? line.translation : '') : line.translation) ?? '' })),
        release: { ...manifest, courseReleaseId: Number(row.id), state: row.state } };
}
export async function readWorkingCourse(exerciseId: number, transaction?: Transaction): Promise<ListeningExercise> {
    const [row] = await sequelize.query<any>('select * from exercises where id=:exerciseId limit 1'+(transaction ? ' for update' : ''),
        { replacements: { exerciseId }, type: QueryTypes.SELECT, transaction });
    if (!row) throw new Error('课程不存在');
    return { id: Number(row.id), categoryId: Number(row.category_id), title: row.title, source: row.source,
        sourceUrl: row.source_url ?? undefined, difficulty: row.difficulty, durationLabel: row.duration_label,
        mediaType: row.media_type, audioUrl: row.audio_url, coverImageUrl: row.cover_image_url ?? undefined,
        summary: row.summary, status: row.status, sortOrder: row.sort_order,
        localizations: parse(row.localizations_json ?? {}), lines: parse(row.transcript_json ?? []) };
}
export async function publishedCourse(exerciseId: number, releaseId?: number, locale?: ContentLocale): Promise<ListeningExercise | null> {
    const [row] = await sequelize.query<ReleaseRow>(`select r.* from exercises e join course_releases r
        on r.exercise_id=e.id and r.id=${releaseId ? ':releaseId' : 'e.published_release_id'}
        where e.id=:exerciseId and e.published_release_id is not null and e.status<>'archived' and r.state='published' limit 1`,
        { replacements: { exerciseId, releaseId: releaseId ?? null }, type: QueryTypes.SELECT });
    return row ? decodeRelease(row, locale) : null;
}
export async function releaseWaveform(course: ListeningExercise): Promise<CourseWaveform | undefined> {
    if (!course.release?.waveformRevision) return undefined;
    const [row] = await sequelize.query<{ waveform_json: unknown }>('select waveform_json from media_analyses where media_revision=:revision limit 1',
        { replacements: { revision: course.release.mediaRevision }, type: QueryTypes.SELECT });
    if (!row) throw new Error('发布版本缺少对应波形');
    const waveform = parse<CourseWaveform>(row.waveform_json);
    if (waveform.revision !== course.release.waveformRevision || waveform.timelineId !== course.release.timelineId) throw new Error('发布版本波形不一致');
    return waveform;
}

export async function createCoursePreview(exerciseId: number, actorId: number, lines: TranscriptLine[], expectedMediaUrl: string) {
    const before = await readWorkingCourse(exerciseId);
    assertExpectedMedia(before.audioUrl, expectedMediaUrl);
    const analysis = await ensureMediaAnalysis(before.audioUrl, before.mediaType);
    return sequelize.transaction(async (transaction) => {
        const course = await readWorkingCourse(exerciseId, transaction);
        assertExpectedMedia(course.audioUrl, before.audioUrl);
        const snapshot = { ...course, audioUrl: analysis.mediaUrl, lines, status: 'published' as const };
        const manifest = createManifest(snapshot, analysis.mediaRevision, analysis.durationUs, analysis.waveform.revision);
        const previous = await sequelize.query<ReleaseRow>(`select * from course_releases where exercise_id=:exerciseId and created_by_admin_id=:actorId and state='preview' order by id desc limit 10`,
            { replacements: { exerciseId, actorId }, type: QueryTypes.SELECT, transaction });
        const reusable = previous.find((item) => digest(parse(item.snapshot_json)) === digest(snapshot) && digest(parse(item.manifest_json)) === digest(manifest));
        let releaseId = reusable ? Number(reusable.id) : 0;
        if (!releaseId) {
            const [result] = await sequelize.query(`insert into course_releases
                (exercise_id,media_url,snapshot_json,manifest_json,state,created_by_admin_id)
                values (:exerciseId,:url,cast(:snapshot as json),cast(:manifest as json),'preview',:actorId)`,
                { replacements: { exerciseId, actorId, url: course.audioUrl, snapshot: JSON.stringify(snapshot), manifest: JSON.stringify(manifest) }, transaction });
            releaseId = Number(typeof result === 'number' ? result : (result as unknown as { insertId: number }).insertId);
        }
        const audience = await sequelize.query<{ learner_user_id: number }>(`select distinct a.learner_user_id from admin_users a
            where a.is_active=true and a.learner_user_id is not null and (a.id=:actorId or a.id in (select admin_user_id from exercise_workflow_assignees where exercise_id=:exerciseId))`,
            { replacements: { exerciseId, actorId }, type: QueryTypes.SELECT, transaction });
        const token = randomBytes(32).toString('base64url');
        await sequelize.query(`insert into course_preview_access (release_id,token_hash,audience_json,expires_at,created_by_admin_id)
            values (:releaseId,:hash,cast(:audience as json),date_add(utc_timestamp(), interval 24 hour),:actorId)`,
            { replacements: { releaseId, hash: createHash('sha256').update(token).digest('hex'), audience: JSON.stringify(audience.map((item) => Number(item.learner_user_id))), actorId }, transaction });
        return { course: { ...snapshot, audioUrl: delivery(snapshot.audioUrl), release: { ...manifest, courseReleaseId: releaseId, state: 'preview' as const }, waveform: analysis.waveform },
            mobilePreviewToken: audience.length ? token : null, expiresInSeconds: 86400 };
    });
}

export async function authorizedPreview(token: string, userId: number, locale?: ContentLocale): Promise<ListeningExercise> {
    const [row] = await sequelize.query<ReleaseRow & { audience_json: unknown }>(`select r.*, a.audience_json from course_preview_access a
        join course_releases r on r.id=a.release_id join exercises e on e.id=r.exercise_id
        where a.token_hash=:hash and a.expires_at>utc_timestamp() and e.status<>'archived'
        and exists (select 1 from admin_users member where member.learner_user_id=:userId and member.is_active=true
          and (member.id=r.created_by_admin_id or exists (select 1 from exercise_workflow_assignees w where w.exercise_id=r.exercise_id and w.admin_user_id=member.id and (w.claim_expires_at is null or w.claim_expires_at>utc_timestamp())))) limit 1`,
        { replacements: { hash: createHash('sha256').update(token).digest('hex'), userId }, type: QueryTypes.SELECT });
    if (!row || !parse<number[]>(row.audience_json).includes(userId)) throw new Error('预览链接已过期或当前账号无权访问');
    return decodeRelease(row, locale);
}
export async function recordReleaseCheck(releaseId: number, platform: 'web'|'ios'|'android', actor: { adminId?: number; userId?: number }, evidence: { lineId: string; startUs: number; endUs: number; startedPositionUs: number; finishedPositionUs: number; playbackRate: number; adapter: string; playbackContractVersion: number }) {
    const [row] = await sequelize.query<ReleaseRow>('select * from course_releases where id=:releaseId limit 1', { replacements: { releaseId }, type: QueryTypes.SELECT });
    if (!row) throw new Error('预览版本不存在');
    const course = decodeRelease(row);
    const line = course.lines.find((item) => item.id === evidence.lineId);
    if (!line || evidence.playbackContractVersion !== 1 || evidence.startUs !== Math.round(line.start*1e6) || evidence.endUs !== Math.round(line.end*1e6)) throw new Error('预览验收记录与版本不一致');
    if (!Number.isSafeInteger(evidence.startedPositionUs) || !Number.isSafeInteger(evidence.finishedPositionUs) ||
        Math.abs(evidence.startedPositionUs-evidence.startUs)>50000 || evidence.finishedPositionUs<evidence.endUs || evidence.finishedPositionUs-evidence.endUs>50000 ||
        ![0.5,1,1.5,2].includes(evidence.playbackRate) || evidence.adapter !== (platform === 'web' ? 'browser-native' : 'native-timed-v1')) throw new Error('本次播放边界误差超过 50ms 或未正常播完，请重新试听确认');
    // Keep the bearer preview token and any unrecognized request fields out of audit storage.
    const record = { lineId: evidence.lineId, startUs: evidence.startUs, endUs: evidence.endUs,
        startedPositionUs: evidence.startedPositionUs, finishedPositionUs: evidence.finishedPositionUs,
        playbackRate: evidence.playbackRate, adapter: evidence.adapter, playbackContractVersion: evidence.playbackContractVersion };
    await sequelize.query(`insert into course_release_checks (release_id,platform,actor_user_id,actor_admin_id,evidence_json)
        values (:releaseId,:platform,:userId,:adminId,cast(:evidence as json))
        on duplicate key update actor_user_id=values(actor_user_id),actor_admin_id=values(actor_admin_id),evidence_json=values(evidence_json),checked_at=current_timestamp`,
        { replacements: { releaseId, platform, userId: actor.userId ?? null, adminId: actor.adminId ?? null, evidence: JSON.stringify(record) } });
}
export async function listReleaseChecks(releaseId: number) {
    return sequelize.query<{ platform: string; checked_at: string }>('select platform,checked_at from course_release_checks where release_id=:releaseId',
        { replacements: { releaseId }, type: QueryTypes.SELECT });
}

/** Called only inside the existing approval transaction, after the course row is locked. */
export async function publishReviewedRelease(exerciseId: number, reviewerId: number, lines: TranscriptLine[], transaction: Transaction) {
    const course = await readWorkingCourse(exerciseId, transaction);
    const analysis = await ensureMediaAnalysis(course.audioUrl, course.mediaType);
    const rows = await sequelize.query<ReleaseRow>(`select * from course_releases where exercise_id=:exerciseId and created_by_admin_id=:reviewerId
        and state='preview' and json_unquote(json_extract(manifest_json,'$.subtitleRevision'))=:revision order by id desc`,
        { replacements: { exerciseId, reviewerId, revision: digest(lines) }, type: QueryTypes.SELECT, transaction });
    for (const row of rows) {
        const candidate = decodeRelease(row);
        if (!sameMedia(row.media_url, course.audioUrl) || candidate.release?.mediaRevision !== analysis.mediaRevision) continue;
        const snapshot = parse<ListeningExercise>(row.snapshot_json);
        if (digest({ ...course, audioUrl: snapshot.audioUrl, lines, status: 'published' }) !== digest(snapshot)) continue;
        const checks = await sequelize.query<{ platform: string }>('select platform from course_release_checks where release_id=:id',
            { replacements: { id: row.id }, type: QueryTypes.SELECT, transaction });
        if (!['web','ios','android'].every((platform) => checks.some((check) => check.platform === platform))) continue;
        await sequelize.query("update course_releases set state='published',published_at=utc_timestamp() where id=:id", { replacements: { id: row.id }, transaction });
        await sequelize.query('update exercises set published_release_id=:id where id=:exerciseId', { replacements: { id: row.id, exerciseId }, transaction });
        return Number(row.id);
    }
    throw new Error('请先为当前媒体和字幕创建学习者预览，并完成网页、iOS、Android 的播放一致性确认');
}
