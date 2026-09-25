import type { Donation, DonationSocialPlatform, Sponsor } from '@duolinting/domain'
import { FontAwesome6 } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { useLanguage } from '@/i18n/LanguageProvider'
import { apiClient } from '@/lib/apiClient'

type SocialBrand = DonationSocialPlatform | 'email'
const socialIconNames = {
  x: 'x-twitter',
  weibo: 'weibo', website: 'globe', email: 'envelope',
} as const
const socialColors: Record<Exclude<SocialBrand, 'instagram' | 'linkedin' | 'github'>, { background: string; foreground: string }> = {
  x: { background: '#000000', foreground: '#ffffff' },
  weibo: { background: '#fff5f4', foreground: '#e6162d' },
  website: { background: '#1cb0f6', foreground: '#ffffff' },
  email: { background: '#1cb0f6', foreground: '#ffffff' },
}

function SocialBrandMark({ platform }: { platform: SocialBrand }) {
  if (platform === 'instagram') return <Image source={require('../../../assets/instagram-logo.png')} style={{ width: 24, height: 24, borderRadius: 7 }} />
  if (platform === 'linkedin') return <Image source={require('../../../assets/linkedin-bug.png')} style={{ width: 24, height: 24, borderRadius: 7 }} />
  if (platform === 'github') return <Image source={require('../../../assets/github-mark.png')} style={{ width: 24, height: 24, borderRadius: 7 }} />
  const colors = socialColors[platform]
  return <View className="h-6 w-6 items-center justify-center overflow-hidden rounded-[7px]" style={{ backgroundColor: colors.background }}>
    <FontAwesome6 color={colors.foreground} name={socialIconNames[platform]} size={14} />
    {platform === 'weibo' ? <View className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-[#f9d748]" /> : null}
  </View>
}

function SponsorCard({ sponsor, visitLabel }: { sponsor: Sponsor; visitLabel: string }) {
  return <View className="rounded-[22px] border-2 border-b-[5px] border-[#d7e4ef] bg-white p-5">
    <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] bg-[#edf7ff]">
      {sponsor.logoUrl ? <Image accessibilityLabel={sponsor.name} source={{ uri: apiClient.resolveApiUrl(sponsor.logoUrl) }} style={{ width: 64, height: 64 }} resizeMode="contain" /> : <FontAwesome6 color="#1cb0f6" name="handshake" size={26} />}
    </View>
    <Text className="mt-4 text-xl font-black text-text-primary">{sponsor.name}</Text>
    {sponsor.description ? <Text className="mt-2 text-sm font-bold leading-5 text-text-secondary">{sponsor.description}</Text> : null}
    {sponsor.websiteUrl ? <Pressable accessibilityRole="link" className="mt-4 flex-row items-center" onPress={() => void Linking.openURL(sponsor.websiteUrl!)}>
      <Text className="text-sm font-black text-[#087caf]">{visitLabel}</Text>
      <FontAwesome6 color="#087caf" name="arrow-up-right-from-square" size={12} style={{ marginLeft: 7 }} />
    </Pressable> : null}
  </View>
}

function DonationCard({ donation }: { donation: Donation }) {
  const { t, uiLocale } = useLanguage()
  // Persisted mobile queries and older backends can contain the pre-social-link shape.
  const socialLinks = Array.isArray(donation.socialLinks) ? donation.socialLinks : []
  const publicEmail = typeof donation.publicEmail === 'string' ? donation.publicEmail : null
  const showLinks = !donation.isAnonymous && (socialLinks.length > 0 || Boolean(publicEmail))
  return <View className="flex-row items-center rounded-[18px] border-2 border-b-[4px] border-[#d7e4ef] bg-white px-4 py-3">
    <View className="flex-1 flex-row items-center">
      <Text className="text-base font-black text-text-primary" numberOfLines={1} style={{ maxWidth: showLinks ? '46%' : '100%' }}>{donation.isAnonymous ? t('sponsors.anonymous') : donation.donorName}</Text>
      {showLinks ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: 6 }} contentContainerStyle={{ alignItems: 'center', gap: 4 }}>
        {socialLinks.map((link) => <Pressable key={link.platform} accessibilityRole="link" accessibilityLabel={t(`sponsors.social.${link.platform}`)} className="rounded-[8px] p-1" hitSlop={6} onPress={() => void Linking.openURL(link.url)}>
          <SocialBrandMark platform={link.platform} />
        </Pressable>)}
        {publicEmail ? <Pressable accessibilityRole="link" accessibilityLabel={t('sponsors.social.email')} className="rounded-[8px] p-1" hitSlop={6} onPress={() => void Linking.openURL(`mailto:${publicEmail}`)}>
          <SocialBrandMark platform="email" />
        </Pressable> : null}
      </ScrollView> : null}
    </View>
    <View className="ml-2 items-end" style={{ maxWidth: '48%' }}>
      <Text className="text-xl font-black text-[#d92d3a]">{new Intl.NumberFormat(uiLocale, { style: 'currency', currency: donation.currency }).format(Number(donation.amount))}</Text>
      <Text className="mt-1 text-right text-[11px] font-normal text-[#8998aa]">{new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(donation.donatedAt))}</Text>
    </View>
  </View>
}

export function SponsorsScreen() {
  const router = useRouter()
  const { t } = useLanguage()
  const sponsorsQuery = useQuery({
    queryKey: ['public-sponsors'],
    queryFn: () => apiClient.getSponsors(),
    staleTime: 60_000,
  })
  const donationsQuery = useQuery({
    queryKey: ['public-donations', 'social-links-v2'],
    queryFn: () => apiClient.getDonations(),
    staleTime: 60_000,
  })
  const items = sponsorsQuery.data?.items ?? []
  const donations = donationsQuery.data?.items ?? []

  return <SafeScreen>
    <View className="flex-1 bg-[#f7fbff]">
      <View className="flex-row items-center border-b-2 border-[#d7e4ef] bg-white px-4 py-3">
        <Pressable accessibilityLabel={t('sponsors.back')} className="h-10 w-10 items-center justify-center rounded-[14px] border-2 border-[#d7e2ee] bg-white" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')}>
          <FontAwesome6 color="#172033" name="chevron-left" size={16} />
        </Pressable>
        <Text className="ml-3 text-2xl font-black text-text-primary">{t('sponsors.title')}</Text>
      </View>
      <AppScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 14 }}>
        <View className="rounded-[24px] border-2 border-b-[6px] border-brand bg-brand px-5 py-6">
          <FontAwesome6 color="white" name="handshake" size={27} />
          <Text className="mt-4 text-2xl font-black text-white">{t('sponsors.title')}</Text>
          <Text className="mt-2 text-sm font-bold leading-5 text-white">{t('sponsors.subtitle')}</Text>
        </View>
        <Text className="px-1 text-lg font-black text-text-primary">{t('sponsors.donations')}</Text>
        {donationsQuery.isPending ? <Text className="text-center text-sm font-bold text-text-secondary">{t('sponsors.loading')}</Text> : donationsQuery.isError ? <Pressable onPress={() => void donationsQuery.refetch()}><Text className="text-center text-sm font-bold text-danger">{t('sponsors.error')}</Text></Pressable> : donations.length === 0 ? <Text className="text-center text-sm font-bold text-text-secondary">{t('sponsors.emptyDonations')}</Text> : donations.map((donation) => <DonationCard key={donation.id} donation={donation} />)}
        {items.length > 0 ? <Text className="mt-3 px-1 text-lg font-black text-text-primary">{t('sponsors.partners')}</Text> : null}
        {items.map((sponsor) => <SponsorCard key={sponsor.id} sponsor={sponsor} visitLabel={t('sponsors.visit')} />)}
        {sponsorsQuery.isError ? <Pressable onPress={() => void sponsorsQuery.refetch()}><Text className="text-center text-sm font-bold text-danger">{t('sponsors.error')}</Text></Pressable> : null}
      </AppScrollView>
    </View>
  </SafeScreen>
}
