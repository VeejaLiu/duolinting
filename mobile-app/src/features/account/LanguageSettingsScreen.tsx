import { useState } from 'react'
import { Pressable, Text } from 'react-native'
import type { ContentLocale, UiLocale } from '@duolinting/domain'
import { useLanguage } from '@/i18n/LanguageProvider'
import { CONTENT_LOCALES, UI_LOCALES, contentLocaleLabels, uiLocaleLabels } from '@/i18n/locale'
import { useToast } from '@/providers/ToastProvider'
import { useAccountPreferencesStore } from '@/stores/accountPreferencesStore'
import { SettingsChoiceSheet, SettingsGroup, SettingsRow, SettingsScaffold } from './SettingsComponents'

export function LanguageSettingsScreen() {
  const { t, uiLocale, contentLocale, setUiLocale, setContentLocale } = useLanguage()
  const { showToast } = useToast()
  const [picker, setPicker] = useState<'ui' | 'content' | null>(null)
  const syncState = useAccountPreferencesStore((state) => state.syncState)
  const choose = async (locale: string) => {
    try {
      if (picker === 'ui') await setUiLocale(locale as UiLocale)
      else await setContentLocale(locale as ContentLocale)
      setPicker(null)
    } catch {
      showToast({ title: t('auth.toastErrorTitle'), message: t('settings.localSaveFailed'), tone: 'error' })
    }
  }
  return <SettingsScaffold title={t('settings.language')} backTo="/settings">
    <SettingsGroup>
      <SettingsRow label={t('settings.interfaceLanguage')} value={uiLocaleLabels[uiLocale]} onPress={() => setPicker('ui')} />
      <SettingsRow label={t('settings.contentDisplayLanguage')} value={contentLocaleLabels[contentLocale]} onPress={() => setPicker('content')} />
    </SettingsGroup>
    <Text className="px-1 text-sm leading-6 text-text-secondary">{t('settings.languageUsageNote')}</Text>
    {syncState === 'local' ? <Pressable accessibilityRole="button" className="min-h-[48px] justify-center px-1" onPress={() => void useAccountPreferencesStore.getState().retry()}><Text className="text-sm text-[#c2410c]">{t('settings.savedLocallyRetry')}</Text></Pressable> : null}
    <SettingsChoiceSheet visible={picker !== null} title={picker === 'ui' ? t('language.chooseInterface') : t('language.chooseContent')} selected={picker === 'ui' ? uiLocale : contentLocale} options={picker === 'ui' ? UI_LOCALES.map((value) => ({ value, label: uiLocaleLabels[value] })) : CONTENT_LOCALES.map((value) => ({ value, label: contentLocaleLabels[value] }))} onSelect={(value) => void choose(value)} onClose={() => setPicker(null)} />
  </SettingsScaffold>
}
