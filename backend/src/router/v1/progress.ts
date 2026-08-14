import express from 'express';
import { verifyTokenMiddleware } from '../../lib/token/verifyTokenMiddleware';
import { getStudyStoreForUser, saveStudyStoreForUser } from '../../general/progress/progress-service';
import type { StudyStore } from '../../domain';

const router = express.Router();

const MAX_EXERCISES = 100;
const MAX_TOTAL_LINES = 5_000;
const MAX_TOTAL_VOCABULARY = 2_000;

/**
 * StudyStore 是多端同步的数据格式：progressByExercise 的 key 是课程 id 字符串，
 * lines 的 key 是字幕行 id，vocabulary 的 key 是词汇原文。这里在进入事务前同时
 * 校验结构、字段长度和总数量，避免一个小请求被放大成无界 SQL 循环。
 */
const parseStudyStore = (value: unknown): StudyStore | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const store = value as Record<string, unknown>;
    if (store.activeExerciseId !== '' && (!Number.isSafeInteger(store.activeExerciseId) || Number(store.activeExerciseId) <= 0)) return null;
    const progressByExercise = store.progressByExercise;
    if (!progressByExercise || typeof progressByExercise !== 'object' || Array.isArray(progressByExercise)) return null;

    const exercises = Object.entries(progressByExercise);
    if (exercises.length > MAX_EXERCISES) return null;
    let totalLines = 0;
    let totalVocabulary = 0;

    for (const [exerciseKey, rawProgress] of exercises) {
        if (!/^\d{1,20}$/.test(exerciseKey) || !rawProgress || typeof rawProgress !== 'object' || Array.isArray(rawProgress)) return null;
        const progress = rawProgress as Record<string, unknown>;
        if (!Number.isSafeInteger(progress.exerciseId) || Number(progress.exerciseId) <= 0) return null;
        if (String(progress.exerciseId) !== exerciseKey) return null;
        if (typeof progress.lastLineId !== 'string' || progress.lastLineId.length > 96) return null;
        if (typeof progress.showTranslation !== 'boolean' || typeof progress.hideTranscript !== 'boolean') return null;
        if (typeof progress.playbackRate !== 'number' || !Number.isFinite(progress.playbackRate) || progress.playbackRate < 0.25 || progress.playbackRate > 4) return null;
        if (typeof progress.updatedAt !== 'string' || progress.updatedAt.length > 64 || Number.isNaN(Date.parse(progress.updatedAt))) return null;
        if (!progress.lines || typeof progress.lines !== 'object' || Array.isArray(progress.lines)) return null;
        if (!progress.vocabulary || typeof progress.vocabulary !== 'object' || Array.isArray(progress.vocabulary)) return null;

        const lines = Object.entries(progress.lines);
        const vocabulary = Object.entries(progress.vocabulary);
        totalLines += lines.length;
        totalVocabulary += vocabulary.length;
        if (totalLines > MAX_TOTAL_LINES || totalVocabulary > MAX_TOTAL_VOCABULARY) return null;

        for (const [lineId, rawLine] of lines) {
            if (!lineId || lineId.length > 96 || !rawLine || typeof rawLine !== 'object' || Array.isArray(rawLine)) return null;
            const line = rawLine as Record<string, unknown>;
            if (typeof line.unclear !== 'boolean' || typeof line.mastered !== 'boolean') return null;
            if (!Number.isInteger(line.repeatCount) || Number(line.repeatCount) < 0 || Number(line.repeatCount) > 1_000_000) return null;
            if (typeof line.note !== 'string' || line.note.length > 5_000) return null;
            if (typeof line.dictation !== 'string' || line.dictation.length > 5_000) return null;
        }

        for (const [word, context] of vocabulary) {
            if (!word || word.length > 180 || typeof context !== 'string' || context.length > 5_000) return null;
        }
    }

    return value as StudyStore;
};

router.get('/', verifyTokenMiddleware, async (req: any, res) => {
    const store = await getStudyStoreForUser(req.user.userId);
    res.status(200).send({ store });
});

router.put('/', verifyTokenMiddleware, async (req: any, res) => {
    const store = parseStudyStore(req.body);
    if (!store) {
        return res.status(422).send({ success: false, message: 'Invalid or oversized progress payload' });
    }
    await saveStudyStoreForUser(req.user.userId, store);
    res.status(200).send({ ok: true });
});

export default router;
