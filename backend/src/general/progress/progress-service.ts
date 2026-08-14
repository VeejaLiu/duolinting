import type { ExerciseProgress, LineProgress, StudyStore } from '../../domain';
import { sequelize } from '../../models/db-config-mysql';
import { doRawQuery } from '../../models';

type ExerciseProgressRow = {
    exercise_id: number;
    last_line_id: string;
    show_translation: 0 | 1;
    hide_transcript: 0 | 1;
    playback_rate: string;
    updated_at: Date;
};

type LineProgressRow = {
    exercise_id: number;
    line_id: string;
    unclear: 0 | 1;
    mastered: 0 | 1;
    repeat_count: number;
    note: string;
    dictation: string;
};

type VocabularyRow = {
    exercise_id: number;
    word: string;
    context: string;
};

const emptyLineProgress = (): LineProgress => ({
    unclear: false,
    mastered: false,
    repeatCount: 0,
    note: '',
    dictation: '',
});

export async function getStudyStoreForUser(userId: string | number): Promise<StudyStore | null> {
    const exerciseRows = await doRawQuery<ExerciseProgressRow>({
        query: `select exercise_id, last_line_id, show_translation, hide_transcript, playback_rate, updated_at
                from exercise_progress
                where user_id = ?
                order by updated_at desc`,
        params: [userId],
    });

    if (exerciseRows.length === 0) {
        return null;
    }

    const lineRows = await doRawQuery<LineProgressRow>({
        query: `select exercise_id, line_id, unclear, mastered, repeat_count, note, dictation
                from line_progress
                where user_id = ?`,
        params: [userId],
    });

    const vocabularyRows = await doRawQuery<VocabularyRow>({
        query: `select exercise_id, word, context
                from vocabulary_items
                where user_id = ?`,
        params: [userId],
    });

    const progressByExercise: Record<string, ExerciseProgress> = {};

    for (const row of exerciseRows) {
        progressByExercise[String(row.exercise_id)] = {
            exerciseId: Number(row.exercise_id),
            lastLineId: row.last_line_id,
            showTranslation: Boolean(row.show_translation),
            hideTranscript: Boolean(row.hide_transcript),
            playbackRate: Number(row.playback_rate),
            updatedAt: row.updated_at.toISOString(),
            lines: {},
            vocabulary: {},
        };
    }

    for (const row of lineRows) {
        const exercise = progressByExercise[String(row.exercise_id)];
        if (!exercise) continue;

        exercise.lines[row.line_id] = {
            ...emptyLineProgress(),
            unclear: Boolean(row.unclear),
            mastered: Boolean(row.mastered),
            repeatCount: row.repeat_count,
            note: row.note,
            dictation: row.dictation,
        };
    }

    for (const row of vocabularyRows) {
        const exercise = progressByExercise[String(row.exercise_id)];
        if (!exercise) continue;

        exercise.vocabulary[row.word] = row.context;
    }

    return {
        activeExerciseId: Number(exerciseRows[0].exercise_id),
        progressByExercise,
    };
}

export async function saveStudyStoreForUser(userId: string | number, store: StudyStore) {
    await sequelize.transaction(async (transaction) => {
        for (const progress of Object.values(store.progressByExercise)) {
            await sequelize.query(
                `insert into exercise_progress
                    (user_id, exercise_id, last_line_id, show_translation, hide_transcript, playback_rate)
                 values (?, ?, ?, ?, ?, ?)
                 on duplicate key update
                    last_line_id = values(last_line_id),
                    show_translation = values(show_translation),
                    hide_transcript = values(hide_transcript),
                    playback_rate = values(playback_rate)`,
                {
                    replacements: [
                        userId,
                        progress.exerciseId,
                        progress.lastLineId,
                        progress.showTranslation,
                        progress.hideTranscript,
                        progress.playbackRate,
                    ],
                    transaction,
                },
            );

            for (const [lineId, line] of Object.entries(progress.lines)) {
                await sequelize.query(
                    `insert into line_progress
                        (user_id, exercise_id, line_id, unclear, mastered, repeat_count, note, dictation)
                     values (?, ?, ?, ?, ?, ?, ?, ?)
                     on duplicate key update
                        unclear = values(unclear),
                        mastered = values(mastered),
                        repeat_count = values(repeat_count),
                        note = values(note),
                        dictation = values(dictation)`,
                    {
                        replacements: [
                            userId,
                            progress.exerciseId,
                            lineId,
                            line.unclear,
                            line.mastered,
                            line.repeatCount,
                            line.note,
                            line.dictation,
                        ],
                        transaction,
                    },
                );
            }

            for (const [word, context] of Object.entries(progress.vocabulary)) {
                await sequelize.query(
                    `insert into vocabulary_items
                        (user_id, exercise_id, word, context, mastery_level)
                     values (?, ?, ?, ?, 0)
                     on duplicate key update
                        context = values(context)`,
                    {
                        replacements: [userId, progress.exerciseId, word, context],
                        transaction,
                    },
                );
            }
        }
    });
}
