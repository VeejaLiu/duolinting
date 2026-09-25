import type { AdminSponsor, SaveSponsorRequest } from '@duolinting/shared'
import { Button, Card, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import { apiClient, resolveApiUrl } from '../../lib/apiClient'
import type { AdminNoticeTone } from './AdminFeedback'

type Props = {
  adminToken: string
  onNotify: (message: string, tone?: AdminNoticeTone) => void
  onRequestConfirm: (options: { title: string; message: string; confirmLabel?: string; tone?: 'danger' | 'default' }) => Promise<boolean>
}

const emptySponsor: SaveSponsorRequest = {
  name: '', description: '', logoUrl: null, websiteUrl: null, sortOrder: 0, isPublished: false,
  startsAt: null, endsAt: null, bannerImageUrl: null, bannerTargetUrl: null,
}

const toLocalDateTime = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function SponsorManager({ adminToken, onNotify, onRequestConfirm }: Props) {
  const { t } = useAdminLanguage()
  const [form] = Form.useForm<SaveSponsorRequest>()
  const [items, setItems] = useState<AdminSponsor[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState<AdminSponsor | null>(null)
  const [open, setOpen] = useState(false)
  const logoUrl = Form.useWatch('logoUrl', form)
  const bannerImageUrl = Form.useWatch('bannerImageUrl', form)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setItems((await apiClient.getSponsors(adminToken)).items)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('赞助方加载失败'), 'error')
    } finally {
      setLoading(false)
    }
  }, [adminToken, onNotify, t])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const edit = (item?: AdminSponsor) => {
    setEditing(item ?? null)
    form.setFieldsValue(item ? { ...item, startsAt: toLocalDateTime(item.startsAt), endsAt: toLocalDateTime(item.endsAt) } : emptySponsor)
    setOpen(true)
  }

  const save = async () => {
    let values: SaveSponsorRequest
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      const startsAt = values.startsAt ? new Date(values.startsAt).toISOString() : null
      const endsAt = values.endsAt ? new Date(values.endsAt).toISOString() : null
      if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
        onNotify(t('结束时间必须晚于开始时间'), 'error')
        return
      }
      const request: SaveSponsorRequest = {
        name: values.name.trim(),
        description: values.description?.trim() ?? '',
        logoUrl: values.logoUrl?.trim() || null,
        websiteUrl: values.websiteUrl?.trim() || null,
        sortOrder: values.sortOrder ?? 0,
        isPublished: Boolean(values.isPublished),
        startsAt,
        endsAt,
        bannerImageUrl: values.bannerImageUrl?.trim() || null,
        bannerTargetUrl: values.bannerTargetUrl?.trim() || null,
      }
      if (editing) {
        await apiClient.updateSponsor(editing.id, request, adminToken)
      } else {
        await apiClient.createSponsor(request, adminToken)
      }
      onNotify(t('赞助方已保存'), 'success')
      setOpen(false)
      await refresh()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('赞助方保存失败'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: AdminSponsor) => {
    if (!(await onRequestConfirm({ title: t('删除赞助方'), message: t('确定删除这条赞助记录？'), confirmLabel: t('删除'), tone: 'danger' }))) return
    try {
      await apiClient.deleteSponsor(item.id, adminToken)
      onNotify(t('赞助方已删除'), 'success')
      await refresh()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('赞助方删除失败'), 'error')
    }
  }

  const uploadImage = async (file: File, field: 'logoUrl' | 'bannerImageUrl') => {
    if (!file.type.startsWith('image/')) {
      onNotify(t('请选择图片文件'), 'error')
      return
    }
    setUploading(true)
    try {
      const result = await apiClient.uploadImage(file, adminToken)
      form.setFieldValue(field, result.publicUrl)
      onNotify(t('图片已上传'), 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('图片上传失败'), 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="admin-sponsor-manager" title={t('企业赞助商')} extra={<Space><Button onClick={() => void refresh()}>{t('刷新')}</Button><Button type="primary" onClick={() => edit()}>{t('新增赞助方')}</Button></Space>}>
      <Typography.Paragraph type="secondary">{t('可设置展示排期与横幅素材；横幅暂不在学习端展示。')}</Typography.Paragraph>
      <Table rowKey="id" dataSource={items} loading={loading} pagination={false} scroll={{ x: 760 }} columns={[
        { title: t('Logo'), dataIndex: 'logoUrl', width: 88, render: (value: string | null) => value ? <img alt="" src={resolveApiUrl(value)} style={{ width: 54, height: 54, objectFit: 'contain' }} /> : '—' },
        { title: t('名称'), dataIndex: 'name' },
        { title: t('排序'), dataIndex: 'sortOrder', width: 90 },
        { title: t('状态'), dataIndex: 'isPublished', width: 100, render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? t('已发布') : t('草稿')}</Tag> },
        { title: t('操作'), width: 160, render: (_value: unknown, item: AdminSponsor) => <Space><Button onClick={() => edit(item)}>{t('编辑')}</Button><Button danger onClick={() => void remove(item)}>{t('删除')}</Button></Space> },
      ]} />
      <Modal title={editing ? t('编辑赞助方') : t('新增赞助方')} open={open} onCancel={() => setOpen(false)} onOk={() => void save()} okButtonProps={{ loading: saving || uploading }} forceRender>
        <Form form={form} layout="vertical" initialValues={emptySponsor}>
          <Form.Item name="name" label={t('名称')} rules={[{ required: true, whitespace: true, max: 160, message: t('请填写赞助方名称') }]}><Input maxLength={160} /></Form.Item>
          <Form.Item name="description" label={t('简介')} rules={[{ max: 600 }]}><Input.TextArea rows={3} maxLength={600} showCount /></Form.Item>
          <Form.Item name="logoUrl" label={t('Logo 地址')}><Input maxLength={1024} placeholder="https://" /></Form.Item>
          <input aria-label={t('上传 Logo')} type="file" accept="image/*" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file, 'logoUrl'); event.target.value = '' }} />
          {logoUrl ? <img alt={t('Logo 预览')} src={resolveApiUrl(logoUrl)} style={{ display: 'block', width: 96, height: 96, objectFit: 'contain', marginTop: 12 }} /> : null}
          <Form.Item name="websiteUrl" label={t('官网链接')} rules={[{ type: 'url', warningOnly: false, message: t('请输入有效的链接') }]}><Input maxLength={1024} placeholder="https://" /></Form.Item>
          <Form.Item name="sortOrder" label={t('排序')}><InputNumber min={0} max={1000000} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="startsAt" label={t('展示开始时间（可选）')}><Input type="datetime-local" /></Form.Item>
          <Form.Item name="endsAt" label={t('展示结束时间（可选）')}><Input type="datetime-local" /></Form.Item>
          <Form.Item name="bannerImageUrl" label={t('横幅图片地址（预留）')}><Input maxLength={1024} placeholder="https://" /></Form.Item>
          <input aria-label={t('上传横幅')} type="file" accept="image/*" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file, 'bannerImageUrl'); event.target.value = '' }} />
          {bannerImageUrl ? <img alt={t('横幅预览')} src={resolveApiUrl(bannerImageUrl)} style={{ display: 'block', maxWidth: '100%', maxHeight: 120, objectFit: 'contain', marginTop: 12 }} /> : null}
          <Form.Item name="bannerTargetUrl" label={t('横幅跳转链接（预留）')} rules={[{ type: 'url', message: t('请输入有效的链接') }]}><Input maxLength={1024} placeholder="https://" /></Form.Item>
          <Form.Item name="isPublished" label={t('发布状态')} valuePropName="checked"><Switch checkedChildren={t('已发布')} unCheckedChildren={t('草稿')} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
