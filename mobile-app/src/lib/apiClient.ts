import { createApiClient } from '@duolinting/api-client'
import { Platform } from 'react-native'
import { runtimeConfig } from './runtimeConfig'

export const apiClient = createApiClient({
  ...runtimeConfig,
  authClientType: Platform.OS === 'web' ? 'mobile_web' : 'mobile_app',
})
