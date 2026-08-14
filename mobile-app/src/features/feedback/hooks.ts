import type { SubmitAcceptedAnswerFeedbackRequest } from '@duolinting/domain'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { useAuthStore } from '@/stores/authStore'

export function useAcceptedAnswerFeedbackMutation() {
  const authToken = useAuthStore((state) => state.authToken)

  return useMutation({
    mutationFn: (request: SubmitAcceptedAnswerFeedbackRequest) =>
      apiClient.submitAcceptedAnswerFeedback(request, authToken),
  })
}
