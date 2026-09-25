import * as Linking from 'expo-linking'
import { Platform } from 'react-native'

/** Keep Expo Web in place while letting native open the device's URL handler. */
export async function openExternalLink(url: string): Promise<void> {
  if (!/^(https?:\/\/|mailto:)/i.test(url)) return
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    await Linking.openURL(url)
  } catch {
    // A missing handler or cancelled system prompt should leave the current page intact.
  }
}
