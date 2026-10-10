import { analytics } from './analytics'
import { createApiClient } from '@duolinting/api-client'
import { Platform } from 'react-native'
import { runtimeConfig } from './runtimeConfig'
import { browserClientType } from '@duolinting/analytics/web'

export const apiClient = createApiClient({
  ...runtimeConfig,
  analyticsContext: () => analytics.contextEpoch,
  authClientType: Platform.OS === 'web' ? browserClientType() : 'mobile_app',
})
