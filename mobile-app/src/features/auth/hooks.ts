import type {
  ChangePasswordRequest,
  DeleteAccountRequest,
  LoginRequest,
  RegisterRequest,
} from '@duolinting/domain'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { useAuthStore } from '@/stores/authStore'

export function useLoginMutation() {
  const applyAuthenticated = useAuthStore((state) => state.applyAuthenticated)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: LoginRequest) => apiClient.login(request),
    onSuccess: async (response) => {
      await applyAuthenticated(response)
      await queryClient.invalidateQueries({ queryKey: ['progress'] })
    },
  })
}

export function useRegisterMutation() {
  const applyAuthenticated = useAuthStore((state) => state.applyAuthenticated)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: RegisterRequest) => apiClient.register(request),
    onSuccess: async (response) => {
      await applyAuthenticated(response)
      await queryClient.invalidateQueries({ queryKey: ['progress'] })
    },
  })
}

export function useChangePasswordMutation() {
  const authToken = useAuthStore((state) => state.authToken)
  const applyAuthenticated = useAuthStore((state) => state.applyAuthenticated)

  return useMutation({
    mutationFn: (request: ChangePasswordRequest) =>
      apiClient.changePassword(request, authToken),
    onSuccess: async (response) => {
      // 后端撤销旧会话后为当前设备签发新 token，必须立即替换本地 token。
      await applyAuthenticated(response)
    },
  })
}

export function useDeleteAccountMutation() {
  const authToken = useAuthStore((state) => state.authToken)

  return useMutation({
    mutationFn: (request: DeleteAccountRequest) =>
      apiClient.deleteAccount(request, authToken),
  })
}
