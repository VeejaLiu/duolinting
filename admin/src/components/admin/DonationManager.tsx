import type { AdminDonation, DonationSocialPlatform, SaveDonationRequest } from '@duolinting/shared'
import { GlobalOutlined, WeiboOutlined, XOutlined } from '@ant-design/icons'
import instagramLogo from '../../../../packages/ui-tokens/assets/instagram-logo.png'
import linkedinLogo from '../../../../packages/ui-tokens/assets/linkedin-bug.svg'
import githubLogo from '../../../../packages/ui-tokens/assets/github-mark.svg'
import { Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import { apiClient } from '../../lib/apiClient'
import type { AdminNoticeTone } from './AdminFeedback'
import { ImagePasteInput } from './ImagePasteInput'

type Props = {
  adminToken: string
  onNotify: (message: string, tone?: AdminNoticeTone) => void
  onRequestConfirm: (options: { title: string; message: string; confirmLabel?: string; tone?: 'danger' | 'default' }) => Promise<boolean>
}

type DonationForm = Omit<SaveDonationRequest, 'donatedAt' | 'socialLinks'> & {
  donatedAt: string
  socialUrls: Record<DonationSocialPlatform, string>
}

// datetime-local uses the administrator's wall clock. The API stores a UTC ISO instant.
const toLocalDateTime = (value: string) => {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const emptyDonation = (): DonationForm => ({
  donorName: '', isAnonymous: false, amount: '', currency: 'CNY',
  donationItem: '', socialUrls: { instagram: '', x: '', linkedin: '', github: '', weibo: '', website: '' },
  showSocialLinksPublicly: false, contactEmail: null, showEmailPublicly: false,
  donatedAt: toLocalDateTime(new Date().toISOString()), referenceNote: '', isPublished: false,
})

const socialPlatforms: DonationSocialPlatform[] = ['instagram', 'x', 'linkedin', 'github', 'weibo', 'website']
const platformNames: Record<DonationSocialPlatform, string> = {
  instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn', github: 'GitHub', weibo: '微博', website: '个人网站',
}
const platformIcons = {
  instagram: <img alt="" src={instagramLogo} />, x: <XOutlined />, linkedin: <img alt="" src={linkedinLogo} />,
  github: <img alt="" src={githubLogo} />, weibo: <WeiboOutlined />, website: <GlobalOutlined />,
}

function SocialBrandMark({ platform }: { platform: DonationSocialPlatform }) {
  return <span className={`sponsorship-brand-mark is-${platform}`} aria-hidden="true">{platformIcons[platform]}</span>
}

export function DonationManager({ adminToken, onNotify, onRequestConfirm }: Props) {
  const { t, uiLocale } = useAdminLanguage()
  const [form] = Form.useForm<DonationForm>()
  const [items, setItems] = useState<AdminDonation[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AdminDonation | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [savedReceiptUrl, setSavedReceiptUrl] = useState('')
  const savedReceiptUrlRef = useRef('')
  const receiptRequestSerialRef = useRef(0)
  const isAnonymous = Form.useWatch('isAnonymous', form)
  const contactEmail = Form.useWatch('contactEmail', form)
  const socialUrlsValue = Form.useWatch('socialUrls', form)

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
    if (savedReceiptUrlRef.current) URL.revokeObjectURL(savedReceiptUrlRef.current)
  }, [])

  const clearSavedReceiptPreview = () => {
    receiptRequestSerialRef.current += 1
    if (savedReceiptUrlRef.current) URL.revokeObjectURL(savedReceiptUrlRef.current)
    savedReceiptUrlRef.current = ''
    setSavedReceiptUrl('')
  }

  const edit = (item?: AdminDonation) => {
    clearSavedReceiptPreview()
    setEditing(item ?? null)
    setReceiptFile(null)
    const defaults = emptyDonation()
    const socialUrls = { ...defaults.socialUrls }
    item?.socialLinks.forEach((link) => { socialUrls[link.platform] = link.url })
    form.setFieldsValue(item ? { ...item, donatedAt: toLocalDateTime(item.donatedAt), socialUrls } : defaults)
    setOpen(true)
    if (item?.hasReceipt) {
      const requestSerial = receiptRequestSerialRef.current
      void apiClient.getDonationReceipt(item.id, adminToken).then((blob) => {
        if (requestSerial !== receiptRequestSerialRef.current) return
        const url = URL.createObjectURL(blob)
        savedReceiptUrlRef.current = url
        setSavedReceiptUrl(url)
      }).catch(() => { if (requestSerial === receiptRequestSerialRef.current) onNotify(t('凭证加载失败'), 'error') })
    }
  }

  const save = async () => {
    let values: DonationForm
    try { values = await form.validateFields() } catch { return }
    const timestamp = new Date(values.donatedAt)
    if (Number.isNaN(timestamp.getTime())) {
      onNotify(t('请输入有效的捐赠时间'), 'error')
      return
    }
    const socialLinks = socialPlatforms.flatMap((platform) => {
      const url = values.socialUrls?.[platform]?.trim()
      return url ? [{ platform, url }] : []
    })
    const request: SaveDonationRequest = {
      donorName: values.donorName?.trim() || null,
      isAnonymous: Boolean(values.isAnonymous),
      // Preserve the user's decimal digits exactly; binary floats can round money.
      amount: (() => { const [whole, fraction = ''] = values.amount.split('.'); return `${whole}.${fraction.padEnd(2, '0')}` })(),
      currency: values.currency,
      donationItem: values.donationItem?.trim() ?? '',
      socialLinks,
      showSocialLinksPublicly: !values.isAnonymous && socialLinks.length > 0 && Boolean(values.showSocialLinksPublicly),
      contactEmail: values.contactEmail?.trim() || null,
      showEmailPublicly: !values.isAnonymous && Boolean(values.contactEmail?.trim()) && Boolean(values.showEmailPublicly),
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
      clearSavedReceiptPreview()
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

  const removeReceipt = async (item: AdminDonation) => {
    if (!(await onRequestConfirm({ title: t('删除订单凭证'), message: t('确定删除这张订单凭证？'), confirmLabel: t('删除'), tone: 'danger' }))) return
    try {
      await apiClient.deleteDonationReceipt(item.id, adminToken)
      clearSavedReceiptPreview()
      setEditing((current) => current?.id === item.id ? { ...current, hasReceipt: false } : current)
      onNotify(t('凭证已删除'), 'success')
      await refresh()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('凭证删除失败'), 'error')
    }
  }

  return <Card title={t('捐赠赞助')} extra={<Space><Button onClick={() => void refresh()}>{t('刷新')}</Button><Button type="primary" onClick={() => edit()}>{t('登记捐赠')}</Button></Space>}>
    <Typography.Paragraph type="secondary">{t('匿名捐赠公开时只显示“匿名”；订单凭证仅后台可查看。')}</Typography.Paragraph>
    <Table rowKey="id" dataSource={items} loading={loading} scroll={{ x: 980 }} pagination={{ pageSize: 20 }} columns={[
      { title: t('捐赠者'), render: (_value: unknown, item: AdminDonation) => <Space>{item.donorName || t('未填写')}{item.isAnonymous ? <Tag>{t('匿名')}</Tag> : null}</Space> },
      { title: t('金额'), render: (_value: unknown, item: AdminDonation) => `${item.currency} ${item.amount}` },
      { title: t('捐赠项目'), dataIndex: 'donationItem', render: (value: string) => value || '—' },
      { title: t('社交链接'), render: (_value: unknown, item: AdminDonation) => item.socialLinks.length ? item.socialLinks.map((link) => t(platformNames[link.platform])).join('、') : '—' },
      { title: t('捐赠时间'), render: (_value: unknown, item: AdminDonation) => new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.donatedAt)) },
      { title: t('状态'), render: (_value: unknown, item: AdminDonation) => <Tag color={item.isPublished ? 'green' : 'default'}>{item.isPublished ? t('已发布') : t('草稿')}</Tag> },
      { title: t('操作'), width: 160, render: (_value: unknown, item: AdminDonation) => <Space.Compact>
        <Button size="small" onClick={() => edit(item)}>{t('编辑')}</Button>
        <Button size="small" danger onClick={() => void remove(item)}>{t('删除')}</Button>
      </Space.Compact> },
    ]} />
    <Modal
      className="sponsorship-modal"
      title={editing ? t('编辑捐赠') : t('登记捐赠')}
      open={open}
      width={980}
      style={{ maxWidth: 'calc(100vw - 32px)' }}
      styles={{ body: { maxHeight: 'calc(100dvh - 200px)', overflowY: 'auto' } }}
      onCancel={() => { setOpen(false); setReceiptFile(null); clearSavedReceiptPreview() }}
      onOk={() => void save()}
      okButtonProps={{ loading: saving }}
      forceRender
    >
      <Form form={form} layout="horizontal" className="sponsorship-form" colon={false} labelAlign="left">
        <section className="sponsorship-form-section" aria-labelledby="donation-details-heading">
          <h3 className="sponsorship-form-heading" id="donation-details-heading">{t('捐赠赞助')}</h3>
          <Form.Item name="donorName" label={isAnonymous ? t('捐赠者姓名（仅后台可见，可选）') : t('捐赠者姓名')} rules={[{ required: !isAnonymous, whitespace: true, max: 120, message: t('请填写捐赠者姓名') }]}><Input maxLength={120} /></Form.Item>
          <Form.Item name="isAnonymous" label={t('匿名捐赠')} valuePropName="checked"><Switch /></Form.Item>
          <Form.Item label={t('金额 / 币种')} required>
            <div className="sponsorship-amount-row">
              <Form.Item name="amount" rules={[{ required: true, pattern: /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, message: t('请输入有效金额') }, { validator: async (_rule, value: string) => { if (Number(value) <= 0) throw new Error(t('金额必须大于零')) } }]}><Input inputMode="decimal" placeholder="100.00" /></Form.Item>
              <Form.Item name="currency"><Select aria-label={t('币种')} options={['CNY', 'THB', 'USD', 'EUR'].map((value) => ({ label: value, value }))} /></Form.Item>
            </div>
          </Form.Item>
          <Form.Item name="donationItem" label={t('捐赠项目（可选）')} rules={[{ max: 160 }]}><Input maxLength={160} /></Form.Item>
          <Form.Item name="donatedAt" label={t('捐赠时间')} rules={[{ required: true, message: t('请选择捐赠时间') }]}><Input type="datetime-local" /></Form.Item>
          <Form.Item name="isPublished" label={t('公开展示')} valuePropName="checked"><Switch /></Form.Item>
        </section>
        <section className="sponsorship-form-section" aria-labelledby="donation-social-heading">
          <h3 className="sponsorship-form-heading" id="donation-social-heading">{t('社交链接')}</h3>
          {socialPlatforms.map((platform) => <Form.Item key={platform} name={['socialUrls', platform]} label={<span className="sponsorship-platform-label"><SocialBrandMark platform={platform} />{t(platformNames[platform])}</span>} rules={[{ type: 'url', message: t('请输入有效的 HTTPS 链接') }, { pattern: /^https:\/\//i, message: t('请输入有效的 HTTPS 链接') }]}>
            <Input aria-label={t(platformNames[platform])} maxLength={1024} placeholder="https://" />
          </Form.Item>)}
          <Form.Item label={t('捐赠者同意公开社交链接')}>
            <Space size={10} wrap>
              <Form.Item name="showSocialLinksPublicly" valuePropName="checked" noStyle><Switch disabled={Boolean(isAnonymous) || !socialPlatforms.some((platform) => Boolean(socialUrlsValue?.[platform]?.trim()))} /></Form.Item>
              <Typography.Text type="secondary">{t('可添加 Instagram、X、LinkedIn、GitHub、微博和个人网站。匿名捐赠不会公开链接。')}</Typography.Text>
            </Space>
          </Form.Item>
          <Form.Item name="contactEmail" label={t('个人邮箱（可选，仅后台保存）')} rules={[{ type: 'email', message: t('请输入有效的邮箱') }]}><Input maxLength={255} /></Form.Item>
          <Form.Item label={t('捐赠者同意公开邮箱')}>
            <Space size={10} wrap>
              <Form.Item name="showEmailPublicly" valuePropName="checked" noStyle><Switch disabled={Boolean(isAnonymous) || !contactEmail} /></Form.Item>
              <Typography.Text type="secondary">{t('只有获得本人同意后才开启公开邮箱；匿名捐赠始终隐藏邮箱。')}</Typography.Text>
            </Space>
          </Form.Item>
        </section>
        <section className="sponsorship-form-section" aria-labelledby="donation-receipt-heading">
          <h3 className="sponsorship-form-heading" id="donation-receipt-heading">{t('订单资料')}</h3>
          <Form.Item name="referenceNote" label={t('订单备注（仅后台）')} rules={[{ max: 255 }]}><Input maxLength={255} /></Form.Item>
          <Form.Item label={t('订单截图（仅后台）')}>
            <ImagePasteInput
              label={t('上传订单截图')}
              acceptedTypes={['image/png', 'image/jpeg', 'image/webp']}
              maxBytes={5 * 1024 * 1024}
              selectedFile={receiptFile}
              previewUrl={savedReceiptUrl}
              previewVariant="receipt"
              onFile={(file) => setReceiptFile(file)}
              onError={(message) => onNotify(message, 'error')}
            />
            {editing?.hasReceipt ? <Button danger size="small" type="link" onClick={() => void removeReceipt(editing)}>{t('删除订单凭证')}</Button> : null}
          </Form.Item>
        </section>
      </Form>
    </Modal>
  </Card>
}
