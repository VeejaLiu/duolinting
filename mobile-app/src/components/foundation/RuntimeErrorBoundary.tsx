import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
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
      <Text className="mb-2 text-xl font-bold text-slate-900">{t('runtime.title')}</Text>
      <Text className="mb-6 text-center text-sm leading-6 text-slate-600">
        {t('runtime.detail')}
      </Text>
      <Pressable className="rounded-full bg-sky-500 px-6 py-3" onPress={onRetry}>
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
    reportRuntimeError('ReactErrorBoundary', {
      name: error.name,
      message: error.message,
      stack: `${error.stack ?? ''}\nComponent stack:${errorInfo.componentStack}`,
    })
  }

  private retry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return <RuntimeErrorFallback onRetry={this.retry} />
    }

    return this.props.children
  }
}
