import type { AdminDonation, SaveDonationRequest } from '@duolinting/shared'
import { Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import { apiClient } from '../../lib/apiClient'
import type { AdminNoticeTone } from './AdminFeedback'

type Props = {
  adminToken: string
  onNotify: (message: string, tone?: AdminNoticeTone) => void
  onRequestConfirm: (options: { title: string; message: string; confirmLabel?: string; tone?: 'danger' | 'default' }) => Promise<boolean>
}

type DonationForm = Omit<SaveDonationRequest, 'donatedAt'> & { donatedAt: string }

// datetime-local uses the administrator's wall clock. The API stores a UTC ISO instant.
const toLocalDateTime = (value: string) => {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const emptyDonation = (): DonationForm => ({
  donorName: '', isAnonymous: false, amount: '', currency: 'CNY',
  donationItem: '', donatedAt: toLocalDateTime(new Date().toISOString()), referenceNote: '', isPublished: false,
})

export function DonationManager({ adminToken, onNotify, onRequestConfirm }: Props) {
  const { t, uiLocale } = useAdminLanguage()
  const [form] = Form.useForm<DonationForm>()
  const [items, setItems] = useState<AdminDonation[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AdminDonation | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const receiptInputRef = useRef<HTMLInputElement | null>(null)
  const isAnonymous = Form.useWatch('isAnonymous', form)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setItems((await apiClient.getDonations(adminToken)).items)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('捐赠记录加载失败'), 'error')
    } finally {
      setLoading(false)
    }
  }, [adminToken, onNotify, t])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  useEffect(() => () => {
    if (receiptPreview) URL.revokeObjectURL(receiptPreview)
  }, [receiptPreview])

  const edit = (item?: AdminDonation) => {
    setEditing(item ?? null)
    setReceiptFile(null)
    if (receiptInputRef.current) receiptInputRef.current.value = ''
    form.setFieldsValue(item ? { ...item, donatedAt: toLocalDateTime(item.donatedAt) } : emptyDonation())
    setOpen(true)
  }

  const save = async () => {
    let values: DonationForm
    try { values = await form.validateFields() } catch { return }
    const timestamp = new Date(values.donatedAt)
    if (Number.isNaN(timestamp.getTime())) {
      onNotify(t('请输入有效的捐赠时间'), 'error')
      return
    }
    const request: SaveDonationRequest = {
      donorName: values.donorName?.trim() || null,
      isAnonymous: Boolean(values.isAnonymous),
      // Preserve the user's decimal digits exactly; binary floats can round money.
      amount: (() => { const [whole, fraction = ''] = values.amount.split('.'); return `${whole}.${fraction.padEnd(2, '0')}` })(),
      currency: values.currency,
      donationItem: values.donationItem?.trim() ?? '',
      donatedAt: timestamp.toISOString(),
      referenceNote: values.referenceNote?.trim() ?? '',
      isPublished: Boolean(values.isPublished),
    }
    setSaving(true)
    try {
      const saved = editing
        ? await apiClient.updateDonation(editing.id, request, adminToken)
        : await apiClient.createDonation(request, adminToken)
      setEditing(saved)
      if (receiptFile) {
        try {
          await apiClient.uploadDonationReceipt(saved.id, receiptFile, adminToken)
          setReceiptFile(null)
        } catch (error) {
          onNotify(error instanceof Error ? `${t('捐赠已保存，凭证上传失败，请重试')}：${error.message}` : t('捐赠已保存，凭证上传失败，请重试'), 'error')
          await refresh()
          return
        }
      }
      onNotify(t('捐赠记录已保存'), 'success')
      setOpen(false)
      await refresh()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('捐赠记录保存失败'), 'error')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: AdminDonation) => {
    if (!(await onRequestConfirm({ title: t('删除捐赠记录'), message: t('确定删除这条捐赠记录及其凭证？'), confirmLabel: t('删除'), tone: 'danger' }))) return
    try {
      await apiClient.deleteDonation(item.id, adminToken)
      onNotify(t('捐赠记录已删除'), 'success')
      await refresh()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('捐赠记录删除失败'), 'error')
    }
  }

  const viewReceipt = async (id: number) => {
    try {
      const blob = await apiClient.getDonationReceipt(id, adminToken)
      setReceiptPreview(URL.createObjectURL(blob))
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('凭证加载失败'), 'error')
    }
  }

  const removeReceipt = async (item: AdminDonation) => {
    if (!(await onRequestConfirm({ title: t('删除订单凭证'), message: t('确定删除这张订单凭证？'), confirmLabel: t('删除'), tone: 'danger' }))) return
    try {
      await apiClient.deleteDonationReceipt(item.id, adminToken)
      onNotify(t('凭证已删除'), 'success')
      await refresh()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('凭证删除失败'), 'error')
    }
  }

  return <Card title={t('捐赠赞助')} extra={<Space><Button onClick={() => void refresh()}>{t('刷新')}</Button><Button type="primary" onClick={() => edit()}>{t('登记捐赠')}</Button></Space>}>
    <Typography.Paragraph type="secondary">{t('匿名捐赠公开时只显示“匿名”；订单凭证仅后台可查看。')}</Typography.Paragraph>
    <Table rowKey="id" dataSource={items} loading={loading} scroll={{ x: 880 }} pagination={{ pageSize: 20 }} columns={[
      { title: t('捐赠者'), render: (_value: unknown, item: AdminDonation) => <Space>{item.donorName || t('未填写')}{item.isAnonymous ? <Tag>{t('匿名')}</Tag> : null}</Space> },
      { title: t('金额'), render: (_value: unknown, item: AdminDonation) => `${item.currency} ${item.amount}` },
      { title: t('捐赠项目'), dataIndex: 'donationItem', render: (value: string) => value || '—' },
      { title: t('捐赠时间'), render: (_value: unknown, item: AdminDonation) => new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.donatedAt)) },
      { title: t('状态'), render: (_value: unknown, item: AdminDonation) => <Tag color={item.isPublished ? 'green' : 'default'}>{item.isPublished ? t('已发布') : t('草稿')}</Tag> },
      { title: t('订单凭证'), render: (_value: unknown, item: AdminDonation) => item.hasReceipt ? <Space><Button onClick={() => void viewReceipt(item.id)}>{t('查看')}</Button><Button danger onClick={() => void removeReceipt(item)}>{t('删除')}</Button></Space> : '—' },
      { title: t('操作'), render: (_value: unknown, item: AdminDonation) => <Space><Button onClick={() => edit(item)}>{t('编辑')}</Button><Button danger onClick={() => void remove(item)}>{t('删除')}</Button></Space> },
    ]} />
    <Modal title={editing ? t('编辑捐赠') : t('登记捐赠')} open={open} onCancel={() => setOpen(false)} onOk={() => void save()} okButtonProps={{ loading: saving }} forceRender>
      <Form form={form} layout="vertical">
        <Form.Item name="isAnonymous" label={t('匿名捐赠')} valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="donorName" label={isAnonymous ? t('捐赠者姓名（仅后台可见，可选）') : t('捐赠者姓名')} rules={[{ required: !isAnonymous, whitespace: true, max: 120, message: t('请填写捐赠者姓名') }]}><Input maxLength={120} /></Form.Item>
        <Space align="start" style={{ width: '100%' }}>
          <Form.Item name="amount" label={t('金额')} rules={[{ required: true, pattern: /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, message: t('请输入有效金额') }, { validator: async (_rule, value: string) => { if (Number(value) <= 0) throw new Error(t('金额必须大于零')) } }]}><Input inputMode="decimal" placeholder="100.00" /></Form.Item>
          <Form.Item name="currency" label={t('币种')}><Select style={{ width: 120 }} options={['CNY', 'THB', 'USD', 'EUR'].map((value) => ({ label: value, value }))} /></Form.Item>
        </Space>
        <Form.Item name="donationItem" label={t('捐赠项目（可选）')} rules={[{ max: 160 }]}><Input maxLength={160} /></Form.Item>
        <Form.Item name="donatedAt" label={t('捐赠时间')} rules={[{ required: true, message: t('请选择捐赠时间') }]}><Input type="datetime-local" /></Form.Item>
        <Form.Item name="referenceNote" label={t('订单备注（仅后台）')} rules={[{ max: 255 }]}><Input maxLength={255} /></Form.Item>
        <Form.Item label={t('订单截图（仅后台）')}>
          <input ref={receiptInputRef} aria-label={t('上传订单截图')} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
            const file = event.target.files?.[0] ?? null
            if (file && (file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) {
              onNotify(t('凭证须为 5 MB 内的 PNG、JPEG 或 WebP 图片'), 'error')
              setReceiptFile(null)
              event.target.value = ''
            } else setReceiptFile(file)
          }} />
          {receiptFile ? <Typography.Text type="secondary">{receiptFile.name}</Typography.Text> : null}
        </Form.Item>
        <Form.Item name="isPublished" label={t('公开展示')} valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Modal>
    <Modal title={t('订单凭证')} open={Boolean(receiptPreview)} footer={null} onCancel={() => setReceiptPreview(null)}>
      {receiptPreview ? <img src={receiptPreview} alt={t('订单凭证')} style={{ maxWidth: '100%' }} /> : null}
    </Modal>
  </Card>
}
