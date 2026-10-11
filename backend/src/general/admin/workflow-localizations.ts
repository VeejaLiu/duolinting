import type { ContentLocale, LocalizedDirectoryContent, LocalizedExerciseContent } from '../../domain';

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

/** 与课程标题相同，仅返回受支持语言的目录名称；英文使用目录基础 name。 */
export function parseWorkflowDirectoryLocalizations(value: unknown): Partial<Record<ContentLocale, LocalizedDirectoryContent>> {
    let source = value;
    if (typeof source === 'string') {
        try { source = JSON.parse(source) as unknown; } catch { return {}; }
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    const result: Partial<Record<ContentLocale, LocalizedDirectoryContent>> = {};
    for (const locale of ['zh-CN', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES'] as const) {
        const entry = (source as Record<string, unknown>)[locale];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const name = (entry as Record<string, unknown>).name;
        if (typeof name === 'string' && name.trim()) result[locale] = { name: name.trim() };
    }
    return result;
}
