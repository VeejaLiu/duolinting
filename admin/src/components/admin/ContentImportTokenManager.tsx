import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd'
import type { AdminContentImportToken, ExerciseCategory } from '@duolinting/shared'
import { apiClient } from '../../lib/apiClient'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import type { AdminNoticeTone } from './AdminFeedback'

type Props = {
  adminToken: string
  categories: ExerciseCategory[]
  onNotify: (message: string, tone?: AdminNoticeTone) => void
  onRequestConfirm: (options: { title: string; message: string; confirmLabel?: string; tone?: 'danger' | 'default' }) => Promise<boolean>
}
export function ContentImportTokenManager({ adminToken, categories, onNotify, onRequestConfirm }: Props) {
  const { t, uiLocale } = useAdminLanguage()
  const [items, setItems] = useState<AdminContentImportToken[]>([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [secret, setSecret] = useState('')
  const refresh = useCallback(async () => {
    try { setItems((await apiClient.getContentImportTokens(adminToken)).items) }
    catch (error) { onNotify(error instanceof Error ? error.message : t('导入凭据加载失败'), 'error') }
  }, [adminToken, onNotify, t])
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer) }, [refresh])
  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const result = await apiClient.createContentImportToken({ name: name.trim(), categoryIds }, adminToken)
      setSecret(result.secret); setOpen(false); setName(''); setCategoryIds([]); await refresh()
    } catch (error) { onNotify(error instanceof Error ? error.message : t('导入凭据创建失败'), 'error') }
    finally { setBusy(false) }
  }
  const revoke = async (item: AdminContentImportToken) => {
    if (!await onRequestConfirm({ title: t('撤销导入凭据'), message: t('撤销后，该工具将无法继续上传或创建草稿。'), confirmLabel: t('确认撤销'), tone: 'danger' })) return
    setBusy(true)
    try { await apiClient.revokeContentImportToken(item.id, adminToken); await refresh() }
    catch (error) { onNotify(error instanceof Error ? error.message : t('导入凭据撤销失败'), 'error') }
    finally { setBusy(false) }
  }
  return <Card title={t('自动采集工具导入')} style={{ marginTop: 20 }} extra={<Space><Button disabled={busy} onClick={() => void refresh()}>{t('刷新')}</Button><Button type="primary" disabled={busy} onClick={() => setOpen(true)}>{t('创建导入凭据')}</Button></Space>}>
    <Space direction="vertical" style={{ display: 'flex' }} size={16}>
      <Alert type="info" showIcon message={t('仅可创建草稿，不能发布、覆盖或删除课程。')} description={t('凭据有效期为90天，可授权指定系列或全部系列。媒体和字幕校验后仍需人工审核。')} />
      <Typography.Text code copyable>/api/v1/content-imports</Typography.Text>
      <Table rowKey="id" pagination={false} dataSource={items} columns={[
        { title: t('名称'), dataIndex: 'name' },
        { title: t('Key 前缀'), dataIndex: 'keyPrefix' },
        { title: t('学习系列'), render: (_, item) => item.allCategories ? <Tag color="blue">{t('全部系列（含以后新增系列）')}</Tag> : item.categoryIds.map(id => categories.find(category => category.id === id)?.name ?? `#${id}`).join('、') },
        { title: t('到期时间'), dataIndex: 'expiresAt', render: (value: string) => new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium' }).format(new Date(value)) },
        { title: t('状态'), render: (_, item) => <Tag>{t(item.revokedAt ? '已撤销' : new Date(item.expiresAt).getTime() <= Date.now() ? '已过期' : '有效')}</Tag> },
        { title: t('操作'), render: (_, item) => <Button danger disabled={busy || Boolean(item.revokedAt)} onClick={() => void revoke(item)}>{t('撤销导入凭据')}</Button> },
      ]} />
    </Space>
    <Modal open={open} title={t('创建导入凭据')} onCancel={() => setOpen(false)} onOk={() => void create()} okText={t('创建')} okButtonProps={{ loading: busy, disabled: !name.trim() }} destroyOnHidden>
      <Space direction="vertical" style={{ display: 'flex' }} size={16}>
        <label>{t('名称')}<Input value={name} maxLength={120} onChange={event => setName(event.target.value)} /></label>
        <label>{t('允许导入的系列')}<Select allowClear mode="multiple" placeholder={t('不选则允许全部系列（含以后新增系列）')} style={{ width: '100%' }} value={categoryIds} onChange={setCategoryIds} options={categories.map(category => ({ value: category.id, label: category.name }))} /></label>
        <Typography.Text type="secondary">{t('留空默认全部系列（含以后新增系列）；选择后只允许所选系列。')}</Typography.Text>
      </Space>
    </Modal>
    <Modal open={Boolean(secret)} title={t('保存导入凭据')} onCancel={() => setSecret('')} footer={<Button type="primary" onClick={() => setSecret('')}>{t('我已保存')}</Button>}>
      <Space direction="vertical" style={{ display: 'flex' }}>
        <Typography.Text type="danger">{t('此 Key 只会显示这一次。')}</Typography.Text>
        <Input.Password readOnly value={secret} />
        <Button onClick={() => void navigator.clipboard.writeText(secret).then(() => onNotify(t('API Key 已复制'), 'success')).catch(() => onNotify(t('复制失败，请手动复制'), 'error'))}>{t('复制 API Key')}</Button>
      </Space>
    </Modal>
  </Card>
}
