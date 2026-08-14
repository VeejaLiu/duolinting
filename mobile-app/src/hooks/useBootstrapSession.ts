import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'

export function useBootstrapSession() {
  const restoreSession = useAuthStore((state) => state.restoreSession)

  useEffect(() => {
    void restoreSession()
  }, [restoreSession])
}
