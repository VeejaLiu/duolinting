import { createApiClient } from '@duolinting/api-client'
import { createAppRuntimeConfig } from '@duolinting/app-config'

const runtimeConfig = createAppRuntimeConfig({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
})

export const apiClient = createApiClient(runtimeConfig)
export const resolveApiUrl = apiClient.resolveApiUrl
