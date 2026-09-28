import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import type { AuthMethods } from '@duolinting/domain'
import { apiClient } from '@/lib/apiClient'
import { useAuthFlow } from '@/features/auth/useAuthFlow'
import { useToast } from '@/providers/ToastProvider'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useAuthStore } from '@/stores/authStore'
import { SettingsGroup, SettingsReadOnlyRow, SettingsRow, SettingsScaffold } from './SettingsComponents'

export function AccountSecurityScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const { showToast } = useToast()
  const social = useAuthFlow()
  const email = useAuthStore((state) => state.authUser?.email) ?? ''
  const authToken = useAuthStore((state) => state.authToken)
  const [methods, setMethods] = useState<AuthMethods | null>(null)
  useEffect(() => {
    let active = true
    void apiClient.getAuthMethods(authToken).then((value) => { if (active) setMethods(value) }).catch(() => {})
    return () => { active = false }
  }, [authToken])
  const link = (provider: 'apple' | 'google') => {
    void social.run(provider, 'link').then((result) => {
      if (result?.status === 'linked') {
        void apiClient.getAuthMethods(authToken).then(setMethods)
      }
    }).catch(() => showToast({ title: t('auth.toastErrorTitle'), message: t('authFlow.socialFailed'), tone: 'error' }))
  }
  return <SettingsScaffold title={t('settings.accountSecurity')} backTo="/settings">
    <SettingsGroup title={t('authFlow.loginMethods')}>
      {email ? <SettingsReadOnlyRow label={t('settings.loginEmail')} value={email} />
        : methods && social.providers.some((provider) => methods[provider])
          ? <SettingsRow label={t('settings.loginEmail')} value={t('authFlow.disabled')} onPress={() => router.push('/settings/account/link-email')} />
          : <SettingsReadOnlyRow label={t('settings.loginEmail')} value={t('authFlow.disabled')} />}
      {methods ? <>
        {(['apple', 'google'] as const).map((provider) => social.providers.includes(provider)
          ? <SettingsRow key={provider} label={provider === 'apple' ? 'Apple' : 'Google'} value={t(methods[provider] ? 'authFlow.enabled' : 'authFlow.disabled')}
            detail={methods.providerEmails[provider] ?? undefined}
            onPress={() => methods[provider] ? router.push(`/settings/account/unlink?provider=${provider}` as '/settings/account/unlink') : link(provider)} />
          : <SettingsReadOnlyRow key={provider} label={provider === 'apple' ? 'Apple' : 'Google'} value={[t(methods[provider] ? 'authFlow.enabled' : 'authFlow.disabled'), methods.providerEmails[provider]].filter(Boolean).join(' · ')} />)}
      </> : null}
    </SettingsGroup>
    <SettingsGroup title={t('settings.securitySection')}>
      {email ? <SettingsRow label={t(methods?.password === false ? 'authFlow.setPassword' : 'settings.changePassword')} onPress={() => router.push(methods?.password === false ? '/settings/account/change-password?mode=set' as '/settings/account/change-password' : '/settings/account/change-password')} />
        : <SettingsReadOnlyRow label={t('auth.password')} value={t('authFlow.linkEmail')} />}
    </SettingsGroup>
    <SettingsGroup title={t('settings.accountManagement')}><SettingsRow label={t('settings.deleteAccount')} danger onPress={() => router.push('/settings/account/delete')} /></SettingsGroup>
  </SettingsScaffold>
}
