import type { ContentLocale, LocalizedExerciseContent } from '../../domain';

/** MySQL JSON may arrive as an object or a string. Only expose supported, nonempty title translations. */
export function parseWorkflowLocalizations(value: unknown): Partial<Record<ContentLocale, LocalizedExerciseContent>> {
    let source = value;
    if (typeof source === 'string') {
        try { source = JSON.parse(source) as unknown; } catch { return {}; }
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    const result: Partial<Record<ContentLocale, LocalizedExerciseContent>> = {};
    for (const locale of ['zh-CN', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES'] as const) {
        const entry = (source as Record<string, unknown>)[locale];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const title = (entry as Record<string, unknown>).title;
        if (typeof title === 'string' && title.trim()) result[locale] = { title: title.trim() };
    }
    return result;
}
