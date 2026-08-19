import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Checkbox, Empty, Input, Modal, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { BookOpenText, Copy, KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { AdminOpenContentApiKey } from '@duolinting/shared'
import type { AdminNoticeTone } from './AdminFeedback'
import { apiClient } from '../../lib/apiClient'

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

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '永久'

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
      if (showNotice) onNotify('API Key 列表已刷新', 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'API Key 列表加载失败', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [adminToken, onNotify])

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
      onNotify('请填写 API Key 名称', 'error')
      return
    }
    let normalizedExpiresAt: string | null = null
    if (!neverExpires) {
      const parsed = new Date(expiresAt)
      if (!expiresAt || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        onNotify('请填写晚于当前时间的到期时间', 'error')
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
        onNotify('API Key 已更新', 'success')
      } else {
        const created = await apiClient.createOpenContentApiKey(
          { name: name.trim(), expiresAt: normalizedExpiresAt },
          adminToken,
        )
        setCreatedSecret(created.secret)
        onNotify('API Key 已创建', 'success')
      }
      setIsEditorOpen(false)
      await refresh()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'API Key 保存失败', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const remove = async (apiKey: AdminOpenContentApiKey) => {
    const confirmed = await onRequestConfirm({
      title: '删除 API Key',
      message: `删除“${apiKey.name}”后，所有持有该 Key 的同步任务会立即失效。`,
      confirmLabel: '确认删除',
      tone: 'danger',
    })
    if (!confirmed) return

    setIsSubmitting(true)
    try {
      await apiClient.deleteOpenContentApiKey(apiKey.id, adminToken)
      await refresh()
      onNotify('API Key 已删除', 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'API Key 删除失败', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns: ColumnsType<AdminOpenContentApiKey> = [
    {
      dataIndex: 'name',
      key: 'name',
      title: '名称',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      dataIndex: 'keyPrefix',
      key: 'keyPrefix',
      title: 'Key 前缀',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      title: '到期时间',
      render: (value: string | null) => value ? formatDate(value) : <Tag color="green">永久</Tag>,
    },
    {
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      title: '最后使用',
      render: (value: string | null) => value ? formatDate(value) : <Typography.Text type="secondary">尚未使用</Typography.Text>,
    },
    {
      key: 'actions',
      title: '操作',
      align: 'right',
      render: (_value, apiKey) => <Space size={2}>
        <Tooltip title="编辑 API Key"><Button aria-label="编辑 API Key" disabled={isSubmitting} icon={<Pencil size={15} />} onClick={() => openEditor(apiKey)} size="small" type="text" /></Tooltip>
        <Tooltip title="删除 API Key"><Button aria-label="删除 API Key" danger disabled={isSubmitting} icon={<Trash2 size={15} />} onClick={() => void remove(apiKey)} size="small" type="text" /></Tooltip>
      </Space>,
    },
  ]

  const apiOrigin = window.location.origin
  return (
    <Card
      extra={<Space>
        <Button icon={<BookOpenText size={15} />} onClick={onOpenDocumentation}>查看 API 文档</Button>
        <Tooltip title="刷新 API Key 列表"><Button aria-label="刷新 API Key 列表" disabled={isLoading || isSubmitting} icon={<RefreshCw size={15} />} onClick={() => void refresh(true)} /></Tooltip>
        <Button disabled={isSubmitting} icon={<Plus size={15} />} onClick={() => openEditor()} type="primary">新建 API Key</Button>
      </Space>}
      title={<Space><KeyRound size={18} /><span>开放内容 API</span></Space>}
    >
      <Space direction="vertical" size={16} style={{ display: 'flex' }}>
        <Space direction="vertical" size={4}>
          <Typography.Text type="secondary">目录</Typography.Text>
          <Typography.Text code copyable={{ text: `${apiOrigin}/api/v1/open-content/catalog` }}>{apiOrigin}/api/v1/open-content/catalog</Typography.Text>
          <Typography.Text type="secondary">课程字幕</Typography.Text>
          <Typography.Text code>/api/v1/open-content/courses/:courseId/dltjson</Typography.Text>
        </Space>
        <Table
          columns={columns}
          dataSource={items}
          locale={{ emptyText: <Empty description="还没有 API Key" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          loading={isLoading}
          pagination={false}
          rowKey="id"
          size="middle"
        />
      </Space>

      <Modal
        destroyOnHidden
        okButtonProps={{ loading: isSubmitting }}
        okText={editingKey ? '保存' : '创建'}
        onCancel={() => setIsEditorOpen(false)}
        onOk={() => void save()}
        open={isEditorOpen}
        title={editingKey ? '编辑 API Key' : '新建 API Key'}
      >
        <Space direction="vertical" size={16} style={{ display: 'flex' }}>
          <label>
            <Typography.Text>名称</Typography.Text>
            <Input autoFocus maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="例如：课程开源仓库" style={{ marginTop: 6 }} value={name} />
          </label>
          <Checkbox checked={neverExpires} onChange={(event) => setNeverExpires(event.target.checked)}>永不过期</Checkbox>
          {!neverExpires && <label>
            <Typography.Text>到期时间</Typography.Text>
            <Input min={toDateTimeLocal(new Date().toISOString())} onChange={(event) => setExpiresAt(event.target.value)} style={{ marginTop: 6 }} type="datetime-local" value={expiresAt} />
          </label>}
        </Space>
      </Modal>

      <Modal
        afterClose={() => setCreatedSecret('')}
        footer={<Button onClick={() => setCreatedSecret('')} type="primary">我已保存</Button>}
        onCancel={() => setCreatedSecret('')}
        open={Boolean(createdSecret)}
        title="保存 API Key"
      >
        <Space direction="vertical" size={12} style={{ display: 'flex' }}>
          <Typography.Text type="danger">此 Key 只会显示这一次。</Typography.Text>
          <Input.Password readOnly value={createdSecret} />
          <Button icon={<Copy size={15} />} onClick={() => void navigator.clipboard.writeText(createdSecret).then(() => onNotify('API Key 已复制', 'success')).catch(() => onNotify('复制失败，请手动复制', 'error'))}>复制 API Key</Button>
        </Space>
      </Modal>
    </Card>
  )
}
