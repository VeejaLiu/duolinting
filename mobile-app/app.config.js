module.exports = ({ config }) => {
  // Expo supplies app.json as config. Copy mutable sections so repeated config
  // evaluation cannot append duplicate plugins to the cached static config.
  const result = { ...config, plugins: [...(config.plugins || [])], ios: { ...config.ios } }

  // Native OAuth capabilities enter the binary only when their public client
  // configuration is present at build time. Provider secrets stay on the server.
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || ''
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || ''
  if (googleWebClientId && googleIosClientId) {
    const suffix = '.apps.googleusercontent.com'
    if (!googleIosClientId.endsWith(suffix)) throw new Error('Invalid Google iOS client ID')
    result.plugins.push(['react-native-nitro-google-signin', {
      iosUrlScheme: `com.googleusercontent.apps.${googleIosClientId.slice(0, -suffix.length)}`,
    }])
  }
  if (process.env.EXPO_PUBLIC_APPLE_AUTH_ENABLED === 'true') {
    result.ios.usesAppleSignIn = true
    result.plugins.push('expo-apple-authentication')
  }

  return result
}
