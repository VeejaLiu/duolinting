import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { reloadAppAsync } from 'expo'
import { reportRuntimeError } from '@/lib/runtimeErrorReporting'
import { useLanguage } from '@/i18n/LanguageProvider'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

function RuntimeErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage()
  return (
    <View className="flex-1 items-center justify-center bg-slate-50 px-6">
      <Pressable accessibilityRole="button" accessibilityLabel={t('runtime.reload')} className="rounded-full bg-sky-500 px-6 py-3" onPress={onRetry}>
        <Text className="font-semibold text-white">{t('runtime.reload')}</Text>
      </Pressable>
    </View>
  )
}

export class RuntimeErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportRuntimeError('ReactErrorBoundary', error, false, errorInfo.componentStack ?? '')
  }

  private retry = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload()
      return
    }
    // Expo's reloadAppAsync works in both release and debug native builds.
    void reloadAppAsync('runtime-error-retry').catch(() => this.setState({ error: null }))
  }

  render() {
    if (this.state.error) {
      return <RuntimeErrorFallback onRetry={this.retry} />
    }

    return this.props.children
  }
}
