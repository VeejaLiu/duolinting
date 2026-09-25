import type { Donation, Sponsor } from '@duolinting/domain'
import { FontAwesome6 } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { Image, Pressable, Text, View } from 'react-native'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { useLanguage } from '@/i18n/LanguageProvider'
import { apiClient } from '@/lib/apiClient'

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
  return <View className="flex-row items-center rounded-[18px] border-2 border-b-[4px] border-[#d7e4ef] bg-white px-4 py-3">
    <View className="h-11 w-11 items-center justify-center rounded-[14px] bg-[#edf7ff]">
      <FontAwesome6 color="#1cb0f6" name="heart" size={18} />
    </View>
    <View className="ml-3 flex-1">
      <Text className="text-base font-black text-text-primary">{donation.isAnonymous ? t('sponsors.anonymous') : donation.donorName}</Text>
      <Text className="mt-0.5 text-xs font-bold text-text-secondary">{new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(donation.donatedAt))}</Text>
      {!donation.isAnonymous && (donation.socialLinks.length > 0 || donation.publicEmail) ? <View className="mt-2 flex-row flex-wrap" style={{ gap: 6 }}>
        {donation.socialLinks.map((link) => <Pressable key={link.platform} accessibilityRole="link" accessibilityLabel={t(`sponsors.social.${link.platform}`)} className="rounded-full border border-[#b9e7fb] bg-[#edf9ff] px-2 py-1" onPress={() => void Linking.openURL(link.url)}>
          <Text className="text-xs font-black text-[#087caf]">{t(`sponsors.social.${link.platform}`)}</Text>
        </Pressable>)}
        {donation.publicEmail ? <Pressable accessibilityRole="link" accessibilityLabel={t('sponsors.social.email')} className="rounded-full border border-[#b9e7fb] bg-[#edf9ff] px-2 py-1" onPress={() => void Linking.openURL(`mailto:${donation.publicEmail}`)}>
          <Text className="text-xs font-black text-[#087caf]">{t('sponsors.social.email')}</Text>
        </Pressable> : null}
      </View> : null}
    </View>
    <Text className="text-sm font-black text-[#168534]">{new Intl.NumberFormat(uiLocale, { style: 'currency', currency: donation.currency }).format(Number(donation.amount))}</Text>
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
    queryKey: ['public-donations'],
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
