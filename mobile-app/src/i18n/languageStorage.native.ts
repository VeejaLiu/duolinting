import AsyncStorage from '@react-native-async-storage/async-storage'
import type { StoredLanguagePreferences } from './locale'

const LANGUAGE_PREFERENCES_STORAGE_KEY = 'duolinting.mobile.language-preferences.v1'

export const languageStorage = {
  async load(): Promise<StoredLanguagePreferences | null> {
    try {
      const value = await AsyncStorage.getItem(LANGUAGE_PREFERENCES_STORAGE_KEY)
      return value ? JSON.parse(value) as StoredLanguagePreferences : null
    } catch {
      return null
    }
  },
  async save(preferences: StoredLanguagePreferences): Promise<void> {
    try {
      await AsyncStorage.setItem(LANGUAGE_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
    } catch {
      // 语言选择写盘失败不能阻断学习；下次修改仍会重试。
    }
  },
}
