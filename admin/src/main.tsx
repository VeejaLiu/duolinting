import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntdApp, ConfigProvider } from 'antd'
import enUS from 'antd/locale/en_US'
import jaJP from 'antd/locale/ja_JP'
import thTH from 'antd/locale/th_TH'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter } from 'react-router-dom'
import 'antd/dist/reset.css'
import './index.css'
import App from './App.tsx'
import { AdminLanguageProvider, useAdminLanguage } from './i18n/AdminLanguageProvider'
import { installGlobalMediaDiagnostics, logReactDiagnostic } from './lib/mediaDiagnostics'

function AdminAntdProvider({ children }: { children: ReactNode }) {
  const { uiLocale } = useAdminLanguage()
  const locale = uiLocale === 'en-US' ? enUS : uiLocale === 'th-TH' ? thTH : uiLocale === 'ja-JP' ? jaJP : zhCN
  return <ConfigProvider locale={locale} theme={{ token: { colorPrimary: '#1cb0f6' } }}>{children}</ConfigProvider>
}

installGlobalMediaDiagnostics()

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    logReactDiagnostic('react-caught-error', error, errorInfo.componentStack ?? undefined)
  },
  onRecoverableError: (error, errorInfo) => {
    logReactDiagnostic('react-recoverable-error', error, errorInfo.componentStack ?? undefined)
  },
  onUncaughtError: (error, errorInfo) => {
    logReactDiagnostic('react-uncaught-error', error, errorInfo.componentStack ?? undefined)
  },
}).render(
  <StrictMode>
    <AdminLanguageProvider>
      <AdminAntdProvider>
        <AntdApp>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AntdApp>
      </AdminAntdProvider>
    </AdminLanguageProvider>
  </StrictMode>,
)
