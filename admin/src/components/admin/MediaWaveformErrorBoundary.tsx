import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import { logReactDiagnostic } from '../../lib/mediaDiagnostics'

type MediaWaveformErrorBoundaryProps = {
  children: ReactNode
  errorTitle: string
  retryLabel: string
}

type MediaWaveformErrorBoundaryState = {
  errorMessage: string
  hasError: boolean
  resetKey: number
}

/**
 * 波形编辑器的错误边界：把 MediaWaveform 内部渲染/effect 抛出的异常限制在波形区内部，
 * 避免异常一路冒泡到根节点导致整个 admin 页面白屏。出错时展示可重试的占位，
 * 点击「重新加载波形」会用一个新 key 强制重挂 MediaWaveform，重新初始化 WaveSurfer。
 */
class MediaWaveformErrorBoundaryInner extends Component<
  MediaWaveformErrorBoundaryProps,
  MediaWaveformErrorBoundaryState
> {
  state: MediaWaveformErrorBoundaryState = {
    errorMessage: '',
    hasError: false,
    resetKey: 0,
  }

  static getDerivedStateFromError(error: unknown): Partial<MediaWaveformErrorBoundaryState> {
    return {
      errorMessage: error instanceof Error ? error.message : String(error),
      hasError: true,
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    logReactDiagnostic('waveform-error-boundary', error, info.componentStack ?? undefined)
  }

  handleReset = () => {
    // 换 key 强制重挂子树，让 WaveSurfer 重新走一遍初始化流程。
    logReactDiagnostic('waveform-error-boundary-reset', this.state.errorMessage)
    this.setState((current) => ({
      errorMessage: '',
      hasError: false,
      resetKey: current.resetKey + 1,
    }))
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="waveform-error-boundary" role="alert">
          <strong>{this.props.errorTitle}</strong>
          <span className="waveform-error-message">{this.state.errorMessage}</span>
          <button className="mini-command" onClick={this.handleReset} type="button">
            {this.props.retryLabel}
          </button>
        </div>
      )
    }

    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>
  }
}

export function MediaWaveformErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useAdminLanguage()
  return (
    <MediaWaveformErrorBoundaryInner errorTitle={t('波形加载失败')} retryLabel={t('重新加载波形')}>
      {children}
    </MediaWaveformErrorBoundaryInner>
  )
}
