import { analytics } from './analytics'
import { createApiClient } from '@duolinting/api-client'
import { createAppRuntimeConfig } from '@duolinting/app-config'
import { browserClientType } from '@duolinting/analytics/web'

const runtimeConfig = createAppRuntimeConfig({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
})

export const apiClient = createApiClient({ ...runtimeConfig, authClientType: browserClientType(), analyticsContext: () => analytics.contextEpoch })
export const resolveApiUrl = apiClient.resolveApiUrl
