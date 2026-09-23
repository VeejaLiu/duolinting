import { useState } from 'react'
import { Alert, Button, Input, Modal, Space, Typography } from 'antd'
import { Copy, Sparkles } from 'lucide-react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import { buildCourseMetadataPrompt, parseCourseMetadataJson, serializeCourseMetadataJson, type CourseMetadataJson } from '../../lib/courseMetadataJson'
import type { AdminNoticeTone } from './AdminFeedback'

type Props = {
  form: CourseMetadataJson
  disabled: boolean
  onApply: (metadata: CourseMetadataJson) => void
  onNotify: (message: string, tone?: AdminNoticeTone) => void
}

export function CourseMetadataAiTools({ form, disabled, onApply, onNotify }: Props) {
  const { t } = useAdminLanguage()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [manualPrompt, setManualPrompt] = useState('')
  const [manualTitle, setManualTitle] = useState('复制提示词')
  const copyJson = async () => {
    const json = serializeCourseMetadataJson(form)
    try {
      await navigator.clipboard.writeText(json)
      onNotify(t('JSON 已复制'), 'success')
    } catch { setManualTitle('复制 JSON'); setManualPrompt(json) }
  }
  const copy = async () => {
    if (!form.title.trim()) {
      onNotify(t('请先填写课程标题'), 'error')
      return
    }
    const prompt = buildCourseMetadataPrompt(form)
    try {
      await navigator.clipboard.writeText(prompt)
      onNotify(t('提示词已复制'), 'success')
    } catch { setManualTitle('复制提示词'); setManualPrompt(prompt) }
  }
  const apply = () => {
    if (disabled) return
    try {
      const metadata = parseCourseMetadataJson(input)
      onApply(metadata)
      setOpen(false)
      setInput('')
      setError('')
      onNotify(t('JSON 已填入表单，请检查后保存'), 'success')
    } catch (failure) {
      setError(t('JSON 无效或字段不符合要求：{{field}}', { field: failure instanceof Error ? failure.message : 'JSON' }))
    }
  }
  return (
    <div className="course-metadata-ai-tools">
      <Typography.Text strong>{t('ChatGPT 校对与翻译')}</Typography.Text>
      <Typography.Text type="secondary">{t('复制课程标题与简介的翻译任务，粘贴 JSON 后检查并保存。')}</Typography.Text>
      <Space wrap>
        <Button icon={<Copy size={15} aria-hidden="true" />} disabled={disabled} onClick={() => void copyJson()}>{t('复制 JSON')}</Button>
        <Button className="ai-action-button" icon={<Sparkles size={15} aria-hidden="true" />} disabled={disabled} onClick={() => void copy()}>{t('复制提示词')}</Button>
        <Button className="ai-action-button" icon={<Sparkles size={15} aria-hidden="true" />} disabled={disabled} onClick={() => setOpen(true)}>{t('粘贴 JSON 导入')}</Button>
      </Space>
      <Modal open={open} title={t('粘贴 JSON 导入')} onCancel={() => setOpen(false)} onOk={apply}
        okText={t('填入表单')} cancelText={t('取消')} okButtonProps={{ disabled: disabled || !input.trim() }}>
        <Typography.Paragraph>{t('仅更新课程标题、简介和对应译文，检查后使用原有保存按钮保存。')}</Typography.Paragraph>
        <Input.TextArea aria-label={t('粘贴 JSON 导入')} rows={14} value={input} disabled={disabled}
          onChange={(event) => { setInput(event.target.value); setError('') }} />
        {error && <Alert type="error" title={error} showIcon style={{ marginTop: 12 }} />}
      </Modal>
      <Modal open={Boolean(manualPrompt)} title={t(manualTitle)} onCancel={() => setManualPrompt('')} footer={null}>
        <Typography.Paragraph>{t('点击文本框可全选后手动复制')}</Typography.Paragraph>
        <Input.TextArea aria-label={t(manualTitle)} rows={14} value={manualPrompt} readOnly onClick={(event) => event.currentTarget.select()} />
      </Modal>
    </div>
  )
}
