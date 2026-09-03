import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Checkbox, Empty, Input, Modal, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { BookOpenText, Copy, KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { AdminOpenContentApiKey } from '@duolinting/shared'
import type { AdminNoticeTone } from './AdminFeedback'
import { apiClient } from '../../lib/apiClient'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type OpenContentApiKeyManagerProps = {
  adminToken: string
  onNotify: (message: string, tone?: AdminNoticeTone) => void
  onOpenDocumentation: () => void
  onRequestConfirm: (options: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'danger' | 'default'
  }) => Promise<boolean>
}

const formatDate = (value: string | null, locale: string, permanentLabel: string) => value
  ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : permanentLabel

// datetime-local 使用本机时间而非 UTC 字符串；提交时会再转 ISO，避免界面显示偏移时区。
const toDateTimeLocal = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function OpenContentApiKeyManager({
  adminToken,
  onNotify,
  onOpenDocumentation,
  onRequestConfirm,
}: OpenContentApiKeyManagerProps) {
  const { t, uiLocale } = useAdminLanguage()
  const [items, setItems] = useState<AdminOpenContentApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<AdminOpenContentApiKey | null>(null)
  const [name, setName] = useState('')
  const [neverExpires, setNeverExpires] = useState(true)
  const [expiresAt, setExpiresAt] = useState('')
  const [createdSecret, setCreatedSecret] = useState('')

  const refresh = useCallback(async (showNotice = false) => {
    setIsLoading(true)
    try {
      const result = await apiClient.getOpenContentApiKeys(adminToken)
      setItems(result.items)
      if (showNotice) onNotify(t('API Key 列表已刷新'), 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('API Key 列表加载失败'), 'error')
    } finally {
      setIsLoading(false)
    }
  }, [adminToken, onNotify, t])

  useEffect(() => {
    // 将首屏加载放到下一轮任务，避免在 effect 同步阶段直接触发列表状态更新。
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const openEditor = (apiKey?: AdminOpenContentApiKey) => {
    setEditingKey(apiKey ?? null)
    setName(apiKey?.name ?? '')
    setNeverExpires(!apiKey?.expiresAt)
    setExpiresAt(toDateTimeLocal(apiKey?.expiresAt ?? null))
    setIsEditorOpen(true)
  }

  const save = async () => {
    if (!name.trim()) {
      onNotify(t('请填写 API Key 名称'), 'error')
      return
    }
    let normalizedExpiresAt: string | null = null
    if (!neverExpires) {
      const parsed = new Date(expiresAt)
      if (!expiresAt || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        onNotify(t('请填写晚于当前时间的到期时间'), 'error')
        return
      }
      normalizedExpiresAt = parsed.toISOString()
    }

    setIsSubmitting(true)
    try {
      if (editingKey) {
        await apiClient.updateOpenContentApiKey(
          editingKey.id,
          { name: name.trim(), expiresAt: normalizedExpiresAt },
          adminToken,
        )
        onNotify(t('API Key 已更新'), 'success')
      } else {
        const created = await apiClient.createOpenContentApiKey(
          { name: name.trim(), expiresAt: normalizedExpiresAt },
          adminToken,
        )
        setCreatedSecret(created.secret)
        onNotify(t('API Key 已创建'), 'success')
      }
      setIsEditorOpen(false)
      await refresh()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('API Key 保存失败'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const remove = async (apiKey: AdminOpenContentApiKey) => {
    const confirmed = await onRequestConfirm({
      title: t('删除 API Key'),
      message: t('删除“{{name}}”后，所有持有该 Key 的同步任务会立即失效。', { name: apiKey.name }),
      confirmLabel: t('确认删除'),
      tone: 'danger',
    })
    if (!confirmed) return

    setIsSubmitting(true)
    try {
      await apiClient.deleteOpenContentApiKey(apiKey.id, adminToken)
      await refresh()
      onNotify(t('API Key 已删除'), 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('API Key 删除失败'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns: ColumnsType<AdminOpenContentApiKey> = [
    {
      dataIndex: 'name',
      key: 'name',
      title: t('名称'),
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      dataIndex: 'keyPrefix',
      key: 'keyPrefix',
      title: t('Key 前缀'),
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      title: t('到期时间'),
      render: (value: string | null) => value ? formatDate(value, uiLocale, t('永久')) : <Tag color="green">{t('永久')}</Tag>,
    },
    {
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      title: t('最后使用'),
      render: (value: string | null) => value ? formatDate(value, uiLocale, t('永久')) : <Typography.Text type="secondary">{t('尚未使用')}</Typography.Text>,
    },
    {
      key: 'actions',
      title: t('操作'),
      align: 'right',
      render: (_value, apiKey) => <Space size={2}>
        <Tooltip title={t('编辑 API Key')}><Button aria-label={t('编辑 API Key')} disabled={isSubmitting} icon={<Pencil size={15} />} onClick={() => openEditor(apiKey)} size="small" type="text" /></Tooltip>
        <Tooltip title={t('删除 API Key')}><Button aria-label={t('删除 API Key')} danger disabled={isSubmitting} icon={<Trash2 size={15} />} onClick={() => void remove(apiKey)} size="small" type="text" /></Tooltip>
      </Space>,
    },
  ]

  const apiOrigin = window.location.origin
  return (
    <Card
      extra={<Space>
        <Button icon={<BookOpenText size={15} />} onClick={onOpenDocumentation}>{t('查看 API 文档')}</Button>
        <Tooltip title={t('刷新 API Key 列表')}><Button aria-label={t('刷新 API Key 列表')} disabled={isLoading || isSubmitting} icon={<RefreshCw size={15} />} onClick={() => void refresh(true)} /></Tooltip>
        <Button disabled={isSubmitting} icon={<Plus size={15} />} onClick={() => openEditor()} type="primary">{t('新建 API Key')}</Button>
      </Space>}
      title={<Space><KeyRound size={18} /><span>{t('开放内容 API')}</span></Space>}
    >
      <Space direction="vertical" size={16} style={{ display: 'flex' }}>
        <Space direction="vertical" size={4}>
          <Typography.Text type="secondary">{t('目录')}</Typography.Text>
          <Typography.Text code copyable={{ text: `${apiOrigin}/api/v1/open-content/catalog` }}>{apiOrigin}/api/v1/open-content/catalog</Typography.Text>
          <Typography.Text type="secondary">{t('课程字幕')}</Typography.Text>
          <Typography.Text code>/api/v1/open-content/courses/:courseId/dltjson</Typography.Text>
        </Space>
        <Table
          columns={columns}
          dataSource={items}
          locale={{ emptyText: <Empty description={t('还没有 API Key')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          loading={isLoading}
          pagination={false}
          rowKey="id"
          size="middle"
        />
      </Space>

      <Modal
        destroyOnHidden
        okButtonProps={{ loading: isSubmitting }}
        okText={editingKey ? t('保存') : t('创建')}
        onCancel={() => setIsEditorOpen(false)}
        onOk={() => void save()}
        open={isEditorOpen}
        title={editingKey ? t('编辑 API Key') : t('新建 API Key')}
      >
        <Space direction="vertical" size={16} style={{ display: 'flex' }}>
          <label>
            <Typography.Text>{t('名称')}</Typography.Text>
            <Input autoFocus maxLength={120} onChange={(event) => setName(event.target.value)} placeholder={t('例如：课程开源仓库')} style={{ marginTop: 6 }} value={name} />
          </label>
          <Checkbox checked={neverExpires} onChange={(event) => setNeverExpires(event.target.checked)}>{t('永不过期')}</Checkbox>
          {!neverExpires && <label>
            <Typography.Text>{t('到期时间')}</Typography.Text>
            <Input min={toDateTimeLocal(new Date().toISOString())} onChange={(event) => setExpiresAt(event.target.value)} style={{ marginTop: 6 }} type="datetime-local" value={expiresAt} />
          </label>}
        </Space>
      </Modal>

      <Modal
        afterClose={() => setCreatedSecret('')}
        footer={<Button onClick={() => setCreatedSecret('')} type="primary">{t('我已保存')}</Button>}
        onCancel={() => setCreatedSecret('')}
        open={Boolean(createdSecret)}
        title={t('保存 API Key')}
      >
        <Space direction="vertical" size={12} style={{ display: 'flex' }}>
          <Typography.Text type="danger">{t('此 Key 只会显示这一次。')}</Typography.Text>
          <Input.Password readOnly value={createdSecret} />
          <Button icon={<Copy size={15} />} onClick={() => void navigator.clipboard.writeText(createdSecret).then(() => onNotify(t('API Key 已复制'), 'success')).catch(() => onNotify(t('复制失败，请手动复制'), 'error'))}>{t('复制 API Key')}</Button>
        </Space>
      </Modal>
    </Card>
  )
}
