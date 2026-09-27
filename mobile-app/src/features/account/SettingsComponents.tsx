import { FontAwesome6 } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { type ComponentProps, type PropsWithChildren } from 'react'
import { Pressable, Switch, Text, View } from 'react-native'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { BottomSheet } from '@/components/foundation/BottomSheet'
import { useLanguage } from '@/i18n/LanguageProvider'

type Icon = ComponentProps<typeof FontAwesome6>['name']

export function SettingsScaffold({ title, backTo, children }: PropsWithChildren<{ title: string; backTo: string }>) {
  const router = useRouter()
  const { t } = useLanguage()
  return <SafeScreen>
    <View className="flex-1 bg-[#f7fbff]">
      <View className="min-h-[64px] flex-row items-center border-b border-[#e4eef8] bg-white px-4 py-2">
        <Pressable accessibilityRole="button" accessibilityLabel={t('settings.back')} className="h-12 w-12 items-center justify-center rounded-[14px] border border-[#d7e2ee] bg-white active:border-[#1cb0f6]" onPress={() => router.canGoBack() ? router.back() : router.replace(backTo as '/settings')}>
          <FontAwesome6 color="#172033" name="chevron-left" size={16} />
        </Pressable>
        <Text className="ml-3 flex-1 text-2xl font-black text-text-primary">{title}</Text>
      </View>
      <AppScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 24 }}>
        {children}
      </AppScrollView>
    </View>
  </SafeScreen>
}

export function SettingsGroup({ title, children }: PropsWithChildren<{ title?: string }>) {
  return <View>
    {title ? <Text className="mb-2 px-1 text-sm font-bold text-text-secondary">{title}</Text> : null}
    <View className="overflow-hidden rounded-[20px] border border-[#e4eef8] bg-white px-4">{children}</View>
  </View>
}

export function SettingsRow({ label, detail, value, icon, external, danger, onPress }: {
  label: string; detail?: string; value?: string; icon?: Icon; external?: boolean; danger?: boolean; onPress: () => void
}) {
  return <Pressable accessibilityRole={external ? 'link' : 'button'} accessibilityLabel={[label, value, detail].filter(Boolean).join(', ')} className="min-h-[56px] flex-row items-center border-b border-[#edf2f7] py-3 last:border-b-0 active:border-[#1cb0f6]" onPress={onPress}>
    {icon ? <View className="mr-3 h-10 w-10 items-center justify-center rounded-[13px] bg-[#edf7ff]"><FontAwesome6 name={icon} size={17} color={danger ? '#c2410c' : '#1cb0f6'} /></View> : null}
    <View className="min-w-0 flex-1">
      <Text className={`text-base font-bold ${danger ? 'text-danger' : 'text-text-primary'}`}>{label}</Text>
      {detail ? <Text className="mt-1 text-sm leading-5 text-text-secondary">{detail}</Text> : null}
    </View>
    {value ? <Text className="ml-3 max-w-[42%] text-right text-sm text-text-secondary">{value}</Text> : null}
    <FontAwesome6 name={external ? 'arrow-up-right-from-square' : 'chevron-right'} size={14} color="#8191a6" style={{ marginLeft: 12 }} />
  </Pressable>
}

export function SettingsSwitchRow({ label, detail, value, disabled, onChange }: {
  label: string; detail?: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void
}) {
  return <View className="min-h-[56px] flex-row items-center justify-between border-b border-[#edf2f7] py-3 last:border-b-0">
    <View className="mr-3 min-w-0 flex-1">
      <Text className="text-base font-bold text-text-primary">{label}</Text>
      {detail ? <Text className="mt-1 text-sm leading-5 text-text-secondary">{detail}</Text> : null}
    </View>
    <Switch accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }} disabled={disabled} value={value} onValueChange={onChange} trackColor={{ false: '#d7e2ee', true: '#58cc02' }} thumbColor="#fff" />
  </View>
}

export function SettingsReadOnlyRow({ label, value }: { label: string; value: string }) {
  return <View className="min-h-[56px] justify-center border-b border-[#edf2f7] py-3 last:border-b-0">
    <Text className="text-base font-bold text-text-primary">{label}</Text>
    <Text selectable className="mt-1 text-sm leading-5 text-text-secondary">{value}</Text>
  </View>
}

export function SettingsChoiceSheet<T extends string | number>({ visible, title, options, selected, onSelect, onClose, footer }: {
  visible: boolean; title: string; options: Array<{ value: T; label: string }>; selected: T;
  onSelect: (value: T) => void; onClose: () => void; footer?: string
}) {
  return <BottomSheet visible={visible} title={title} onClose={onClose}>
    <View className="px-4 pb-2">
          {options.map(({ value, label }) => <Pressable key={String(value)} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected === value }} className="min-h-[56px] flex-row items-center border-b border-[#edf2f7] px-2 py-3 last:border-b-0 active:border-[#1cb0f6]" onPress={() => onSelect(value)}>
            <FontAwesome6 name={selected === value ? 'circle-check' : 'circle'} size={20} color={selected === value ? '#58cc02' : '#8191a6'} />
            <Text className="ml-3 flex-1 text-base font-bold text-text-primary">{label}</Text>
          </Pressable>)}
          {footer ? <Text className="px-2 py-4 text-sm leading-5 text-text-secondary">{footer}</Text> : null}
    </View>
  </BottomSheet>
}
