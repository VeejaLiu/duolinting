import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntdApp, ConfigProvider } from 'antd'
import frFR from 'antd/locale/fr_FR'
import esES from 'antd/locale/es_ES'
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
  const locale = uiLocale === 'en-US' ? enUS : uiLocale === 'th-TH' ? thTH : uiLocale === 'ja-JP' ? jaJP : uiLocale === 'fr-FR' ? frFR : uiLocale === 'es-ES' ? esES : zhCN
  return <ConfigProvider locale={locale} theme={{
    // Preserve the bright brand fill/hover border, and give text its own
    // darker palette. A global light-text override would break dark tooltips.
    token: {
      colorPrimary: '#1cb0f6',
      colorPrimaryText: '#086b99',
      colorLink: '#086b99',
      colorLinkHover: '#07577e',
      colorLinkActive: '#07577e',
      colorSuccessText: '#2f7608',
      colorWarningText: '#8a4b00',
      colorErrorText: '#b42332',
    },
    components: {
      Button: { primaryColor: '#172033', defaultHoverColor: '#086b99', defaultActiveColor: '#07577e' },
      Menu: { itemSelectedColor: '#086b99', subMenuItemSelectedColor: '#086b99' },
      Tabs: { itemSelectedColor: '#086b99', itemHoverColor: '#086b99', itemActiveColor: '#07577e' },
    },
  }}>{children}</ConfigProvider>
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
