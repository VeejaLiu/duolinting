import type { StoredLanguagePreferences } from './locale'

const LANGUAGE_PREFERENCES_STORAGE_KEY = 'duolinting.mobile.language-preferences.v1'

export const languageStorage = {
  async load(): Promise<StoredLanguagePreferences | null> {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null
      const value = window.localStorage.getItem(LANGUAGE_PREFERENCES_STORAGE_KEY)
      return value ? JSON.parse(value) as StoredLanguagePreferences : null
    } catch {
      return null
    }
  },
  async save(preferences: StoredLanguagePreferences): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) throw new Error('Storage unavailable')
    window.localStorage.setItem(LANGUAGE_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
  },
}
