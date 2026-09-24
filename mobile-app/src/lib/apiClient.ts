import { analytics } from './analytics'
import { createApiClient } from '@duolinting/api-client'
import { Platform } from 'react-native'
import { runtimeConfig } from './runtimeConfig'

export const apiClient = createApiClient({
  ...runtimeConfig,
  analyticsContext: () => analytics.contextEpoch,
  authClientType: Platform.OS === 'web' ? 'mobile_web' : 'mobile_app',
})
