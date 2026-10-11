import { Button, Tag, Tooltip } from 'antd'
import { Copy } from 'lucide-react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import type { AdminNoticeTone } from './AdminFeedback'

type Props = {
  code: string
  language: string
  onNotify: (message: string, tone?: AdminNoticeTone) => void
}
/** All API examples share the same copy control and scrollable, whitespace-preserving presentation. */
export function CodeExample({ code, language, onNotify }: Props) {
  const { t } = useAdminLanguage()
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); onNotify(t('示例已复制'), 'success') }
    catch { onNotify(t('复制失败，请手动复制'), 'error') }
  }
  return <div className="open-content-code-example">
    <div className="open-content-code-toolbar">
      <Tag>{language}</Tag>
      <Tooltip title={t('复制代码')}>
        <Button aria-label={t('复制代码')} icon={<Copy size={15} />} onClick={() => void copy()} size="small" type="text" />
      </Tooltip>
    </div>
    <pre><code>{code}</code></pre>
  </div>
}
