import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useEffect, useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import type { ReminderTime } from '@/stores/activityStore'
import { useLanguage } from '@/i18n/LanguageProvider'
import { BottomSheet } from '@/components/foundation/BottomSheet'

const asDate = (time: ReminderTime) => {
  const date = new Date()
  date.setHours(time.hour, time.minute, 0, 0)
  return date
}

export function ReminderTimePicker({ visible, value, onConfirm, onCancel }: {
  visible: boolean; value: ReminderTime; onConfirm: (time: ReminderTime) => void; onCancel: () => void
}) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState(() => asDate(value))
  useEffect(() => {
    if (!visible) return
    setDraft(asDate(value))
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: asDate(value), mode: 'time', is24Hour: true,
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) onConfirm({ hour: selected.getHours(), minute: selected.getMinutes() })
          else onCancel()
        },
      })
    }
  }, [visible, value.hour, value.minute])
  if (Platform.OS === 'android') return null
  return <BottomSheet visible={visible} title={t('settings.reminderTime')} onClose={onCancel} scrollable={false}>
      <View className="px-4 pb-2">
        <DateTimePicker value={draft} mode="time" display="spinner" is24Hour onChange={(_event, selected) => { if (selected) setDraft(selected) }} />
        <View className="mt-3 flex-row justify-end gap-5">
          <Pressable accessibilityRole="button" className="min-h-[48px] justify-center px-3" onPress={onCancel}><Text className="text-base font-bold text-text-secondary">{t('common.cancel')}</Text></Pressable>
          <Pressable accessibilityRole="button" className="min-h-[48px] justify-center px-3" onPress={() => onConfirm({ hour: draft.getHours(), minute: draft.getMinutes() })}><Text className="text-base font-bold text-[#1688bd]">{t('common.confirm')}</Text></Pressable>
        </View>
      </View>
  </BottomSheet>
}
