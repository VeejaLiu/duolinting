import { FontAwesome6 } from '@expo/vector-icons'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from './Button'

type ConfirmDialogProps = {
  visible: boolean
  title: string
  message: string
  warning?: string
  cancelLabel: string
  confirmLabel: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** An app-owned confirmation surface on native and Web, with no browser dialog. */
export function ConfirmDialog({
  visible, title, message, warning, cancelLabel, confirmLabel, busy = false, onCancel, onConfirm,
}: ConfirmDialogProps) {
  const close = () => { if (!busy) onCancel() }

  return <Modal animationType="fade" onRequestClose={close} transparent visible={visible}>
    <View className="flex-1 items-center justify-center px-5" style={{ backgroundColor: 'rgba(18, 32, 51, 0.52)' }}>
      <Pressable accessible={false} onPress={close} style={StyleSheet.absoluteFill} />
      <View accessibilityRole="alert" className="w-full max-w-[400px] rounded-[26px] border-2 border-[#dcebf7] bg-white p-5" style={{ boxShadow: '0 20px 60px rgba(18, 32, 51, 0.24)' }}>
        <View className="mb-4 h-12 w-12 items-center justify-center rounded-[16px] bg-[#edf7ff]">
          <FontAwesome6 color="#1cb0f6" name="right-from-bracket" size={20} />
        </View>
        <Text className="text-xl font-black text-text-primary">{title}</Text>
        <Text className="mt-2 text-sm leading-6 text-text-secondary">{message}</Text>
        {warning ? <Text className="mt-3 rounded-[14px] border border-[#ffe08a] bg-[#fff8df] px-3 py-2 text-sm leading-5 text-[#8a5b00]">{warning}</Text> : null}
        <View className="mt-6 gap-3">
          <Button accessibilityRole="button" disabled={busy} label={confirmLabel} onPress={onConfirm} tone="danger" />
          <Button accessibilityRole="button" disabled={busy} label={cancelLabel} onPress={close} tone="secondary" />
        </View>
      </View>
    </View>
  </Modal>
}
