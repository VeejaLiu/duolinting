import type { ContentLocale, UiLocale, UserPreferences } from '../../domain';
import { doRawQuery } from '../../models';
import { sequelize } from '../../models/db-config-mysql';

const uiLocales = new Set<UiLocale>(['zh-CN', 'en-US', 'th-TH', 'ja-JP']);
const contentLocales = new Set<ContentLocale>(['zh-CN', 'en-US', 'th-TH', 'ja-JP']);

const DEFAULT_DAILY_GOAL = 10;

type PreferenceRow = {
    ui_locale: UiLocale;
    content_locale: ContentLocale;
    daily_goal?: number;
    updated_at?: Date | string;
};

const mapPreferences = (row?: PreferenceRow): UserPreferences => ({
    uiLocale: uiLocales.has(row?.ui_locale as UiLocale) ? row!.ui_locale : 'zh-CN',
    contentLocale: contentLocales.has(row?.content_locale as ContentLocale) ? row!.content_locale : 'zh-CN',
    dailyGoal:
        row?.daily_goal && Number.isFinite(row.daily_goal) && row.daily_goal > 0
            ? row.daily_goal
            : DEFAULT_DAILY_GOAL,
    ...(row?.updated_at ? { updatedAt: new Date(row.updated_at).toISOString() } : {}),
});

export const getUserPreferences = async (userId: number | string): Promise<UserPreferences> => {
    const rows = await doRawQuery<PreferenceRow>({
        query: 'select ui_locale, content_locale, daily_goal, updated_at from user_preferences where user_id = ? limit 1',
        params: [userId],
    });
    return mapPreferences(rows[0]);
};

/**
 * Preferences are deliberately one row per user rather than columns on users:
 * feature-specific settings can evolve without widening the account record.
 */
export const updateUserPreferences = async (
    userId: number | string,
    input: Partial<Pick<UserPreferences, 'uiLocale' | 'contentLocale' | 'dailyGoal'>>,
): Promise<UserPreferences> => {
    const current = await getUserPreferences(userId);
    const uiLocale = uiLocales.has(input.uiLocale as UiLocale) ? input.uiLocale! : current.uiLocale;
    const contentLocale = contentLocales.has(input.contentLocale as ContentLocale)
        ? input.contentLocale!
        : current.contentLocale;
    const dailyGoal =
        typeof input.dailyGoal === 'number' && Number.isInteger(input.dailyGoal) && input.dailyGoal > 0
            ? input.dailyGoal
            : current.dailyGoal;

    await sequelize.query(
        `insert into user_preferences (user_id, ui_locale, content_locale, daily_goal)
         values (:userId, :uiLocale, :contentLocale, :dailyGoal)
         on duplicate key update ui_locale = values(ui_locale),
                                 content_locale = values(content_locale),
                                 daily_goal = values(daily_goal)`,
        { replacements: { userId, uiLocale, contentLocale, dailyGoal } },
    );
    return getUserPreferences(userId);
};
