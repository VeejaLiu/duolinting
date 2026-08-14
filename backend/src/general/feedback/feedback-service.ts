import type {
    AcceptedAnswerFeedback,
    FeedbackStatus,
    SubmitAcceptedAnswerFeedbackRequest,
} from '../../domain';
import { doRawInsert, doRawQuery, doRawUpdate } from '../../models';
import { getExercise } from '../catalog/catalog-service';

type AcceptedAnswerFeedbackRow = {
    id: number;
    user_id: number;
    user_display_name: string;
    user_email: string;
    exercise_id: number;
    exercise_title: string;
    line_id: string;
    line_text: string;
    line_translation: string;
    accepted_answers_json: unknown;
    submitted_answer: string;
    status: FeedbackStatus;
    created_at: Date;
    updated_at: Date;
};

const parseAcceptedAnswers = (value: unknown) => {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed)
                ? parsed.filter((item): item is string => typeof item === 'string')
                : [];
        } catch {
            return [];
        }
    }

    return [];
};

const mapFeedbackRow = (row: AcceptedAnswerFeedbackRow): AcceptedAnswerFeedback => ({
    id: Number(row.id),
    exerciseId: Number(row.exercise_id),
    exerciseTitle: row.exercise_title,
    lineId: row.line_id,
    lineText: row.line_text,
    lineTranslation: row.line_translation,
    acceptedAnswers: parseAcceptedAnswers(row.accepted_answers_json),
    submittedAnswer: row.submitted_answer,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    user: {
        id: Number(row.user_id),
        displayName: row.user_display_name,
        email: row.user_email,
    },
});

export async function submitAcceptedAnswerFeedback(
    userId: number,
    payload: SubmitAcceptedAnswerFeedbackRequest,
) {
    const exercise = await getExercise(payload.exerciseId, true);
    if (!exercise) {
        throw new Error('Exercise not found');
    }

    const line = exercise.lines.find((item) => item.id === payload.lineId);
    if (!line) {
        throw new Error('Line not found');
    }

    const submittedAnswer = payload.submittedAnswer.trim();
    if (!submittedAnswer) {
        throw new Error('Submitted answer is required');
    }

    const existing = await doRawQuery<{ id: number }>({
        query: `select id
                from accepted_answer_feedback
                where user_id = ?
                  and exercise_id = ?
                  and line_id = ?
                  and submitted_answer = ?
                order by id desc
                limit 1`,
        params: [userId, payload.exerciseId, payload.lineId, submittedAnswer],
    });

    if (existing[0]) {
        return { ok: true, id: Number(existing[0].id) };
    }

    const insertResult = await doRawInsert(
        `insert into accepted_answer_feedback
            (user_id, exercise_id, line_id, submitted_answer, line_text, line_translation, accepted_answers_json, status)
         values (?, ?, ?, ?, ?, ?, ?, 'open')`,
        [
            userId,
            payload.exerciseId,
            payload.lineId,
            submittedAnswer,
            line.text,
            line.translation,
            JSON.stringify([line.text, ...(line.answers ?? [])]),
        ],
    );

    const insertedId = Array.isArray(insertResult) ? Number(insertResult[0]) : 0;
    return { ok: true, id: insertedId };
}

export async function listAcceptedAnswerFeedback(status?: FeedbackStatus) {
    const rows = await doRawQuery<AcceptedAnswerFeedbackRow>({
        query: `select
                    feedback.id,
                    feedback.user_id,
                    users.display_name as user_display_name,
                    users.email as user_email,
                    feedback.exercise_id,
                    exercises.title as exercise_title,
                    feedback.line_id,
                    feedback.line_text,
                    feedback.line_translation,
                    feedback.accepted_answers_json,
                    feedback.submitted_answer,
                    feedback.status,
                    feedback.created_at,
                    feedback.updated_at
                from accepted_answer_feedback feedback
                inner join users on users.id = feedback.user_id
                inner join exercises on exercises.id = feedback.exercise_id
                where (? is null or feedback.status = ?)
                order by
                    case when feedback.status = 'open' then 0 else 1 end,
                    feedback.created_at desc`,
        params: [status ?? null, status ?? null],
    });

    return rows.map(mapFeedbackRow);
}

export async function updateAcceptedAnswerFeedbackStatus(
    feedbackId: number,
    status: FeedbackStatus,
) {
    await doRawUpdate(
        `update accepted_answer_feedback
         set status = ?
         where id = ?`,
        [status, feedbackId],
    );
}
