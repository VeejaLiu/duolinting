import * as Linking from 'expo-linking'
import { Platform } from 'react-native'

/** Keep Expo Web in place while letting native open the device's URL handler. */
export async function openExternalLink(url: string): Promise<boolean> {
  if (!/^(https?:\/\/|mailto:)/i.test(url)) return false
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const opened = window.open(url, '_blank')
    if (opened) opened.opener = null
    return Boolean(opened)
  }
  try {
    await Linking.openURL(url)
    return true
  } catch {
    return false
  }
}
