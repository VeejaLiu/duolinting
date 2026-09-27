import { Stack } from 'expo-router'

export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
    <Stack.Screen name="index" />
    <Stack.Screen name="learning" />
    <Stack.Screen name="language" />
    <Stack.Screen name="privacy" />
    <Stack.Screen name="about" />
    <Stack.Screen name="sponsors" />
    <Stack.Screen name="account/index" />
    <Stack.Screen name="account/change-password" />
    <Stack.Screen name="account/delete" />
    <Stack.Screen name="change-password" />
  </Stack>
}
