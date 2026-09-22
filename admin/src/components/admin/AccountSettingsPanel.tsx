import type { AdminUser } from '@duolinting/shared'
import { Alert, Button, Card, Input, Modal, Space, Tooltip, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import { apiClient } from '../../lib/apiClient'
import type { AdminNoticeTone } from './AdminFeedback'

export function AccountSettingsPanel({ adminToken, adminUser, onNotify }: { adminToken: string; adminUser: AdminUser; onNotify: (message: string, tone?: AdminNoticeTone) => void }) {
  const { t, uiLocale } = useAdminLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(adminUser.displayName)
  const [changingName, setChangingName] = useState(false)
  const [isNameEditorOpen, setIsNameEditorOpen] = useState(false)
  const [isBindingEditorOpen, setIsBindingEditorOpen] = useState(false)
  const [boundLearner, setBoundLearner] = useState({
    id: adminUser.learnerUserId,
    displayName: adminUser.learnerDisplayName,
    email: adminUser.learnerEmail,
  })
  useEffect(() => {
    let cancelled = false
    void apiClient.getCurrentAdmin(adminToken).then((current) => {
      if (!cancelled) {
        setBoundLearner({
          id: current.learnerUserId,
          displayName: current.learnerDisplayName,
          email: current.learnerEmail,
        })
      }
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [adminToken])
  const saveName = async () => {
    if (!name.trim() || name.trim() === adminUser.displayName) return
    setChangingName(true)
    try { await apiClient.changeOwnAdminDisplayName(name.trim(), adminToken); onNotify(t('显示名称已更新，请刷新页面查看'), 'success') } catch (error) { onNotify(error instanceof Error ? error.message : t('显示名称修改失败'), 'error') } finally { setChangingName(false) }
  }
  const bind = async () => {
    if (!email.trim() || !password) return false
    setSaving(true)
    try {
      const updatedUser = await apiClient.bindOwnLearnerAccount({ learnerEmail: email.trim(), learnerPassword: password }, adminToken)
      setBoundLearner({ id: updatedUser.learnerUserId, displayName: updatedUser.learnerDisplayName, email: updatedUser.learnerEmail })
      setPassword('')
      onNotify(t('学习端账号绑定成功'), 'success')
      return true
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('学习端账号绑定失败'), 'error')
      return false
    } finally { setSaving(false) }
  }
  const nameChangeLocked = Boolean(adminUser.nextDisplayNameChangeAt)
  const nextNameChangeAt = adminUser.nextDisplayNameChangeAt
    ? new Intl.DateTimeFormat(uiLocale, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(adminUser.nextDisplayNameChangeAt))
    : ''
  // 旧浏览器缓存可能只有 learnerUserId，没有昵称/邮箱；先显示未绑定状态，等待 auth/me 刷新后再展示完整身份。
  const isBound = Boolean(boundLearner.displayName || boundLearner.email)
  const boundLearnerLabel = boundLearner.displayName || t('学习端账号')
  const submitBinding = async () => {
    if (await bind()) setIsBindingEditorOpen(false)
  }
  return <section className="admin-section"><div className="panel-title"><Typography.Title level={3} style={{ margin: 0 }}>{t('我的账号')}</Typography.Title></div><Space direction="vertical" size={16} style={{ display: 'flex', maxWidth: 640 }}><Card title={t('公开资料')}><Typography.Paragraph type="secondary">{t('当前显示名称：{{name}}。该名称会展示在课程贡献者信息中。', { name: adminUser.displayName })}</Typography.Paragraph>{nameChangeLocked && <Alert description={t('你已进入显示名称冷却期，下次可修改时间：{{time}}。', { time: nextNameChangeAt })} message={t('当前无法修改显示名称')} showIcon type="warning" style={{ marginBottom: 12 }} />}<Tooltip title={nameChangeLocked ? t('冷却期内不可修改；{{time}} 后可再次修改', { time: nextNameChangeAt }) : undefined}><span><Button disabled={nameChangeLocked} onClick={() => { setName(adminUser.displayName); setIsNameEditorOpen(true) }}>{t('修改显示名称')}</Button></span></Tooltip></Card><Card title={t('绑定学习端账号')}>{isBound ? <Space direction="vertical" size={10}><Alert description={t('你负责课程的草稿已可在该账号的网页端和 App 中预览。')} message={t('已绑定学习端账号')} showIcon type="success" /><Typography.Text strong>{t('学习端账号：')}{boundLearnerLabel}</Typography.Text>{boundLearner.email && <Typography.Text type="secondary">{t('登录邮箱：')}{boundLearner.email}</Typography.Text>}<Button onClick={() => { setEmail(''); setPassword(''); setIsBindingEditorOpen(true) }}>{t('更换绑定')}</Button></Space> : <><Typography.Paragraph type="secondary">{t('绑定后，你负责的课程草稿会在学习端 App 和网页端中提供预览。')}</Typography.Paragraph><Button type="primary" onClick={() => setIsBindingEditorOpen(true)}>{t('绑定学习端账号')}</Button></>}</Card></Space><Modal confirmLoading={changingName} okButtonProps={{ disabled: !name.trim() || name.trim() === adminUser.displayName }} okText={t('确认修改')} onCancel={() => setIsNameEditorOpen(false)} onOk={async () => { await saveName(); setIsNameEditorOpen(false) }} open={isNameEditorOpen} title={t('修改显示名称')}><Typography.Paragraph type="secondary">{t('保存后 90 天内不能再次修改。')}</Typography.Paragraph><Input autoFocus maxLength={120} onChange={(event) => setName(event.target.value)} value={name} /></Modal><Modal confirmLoading={saving} okButtonProps={{ disabled: !email.trim() || !password }} okText={isBound ? t('验证并更换') : t('验证并绑定')} onCancel={() => setIsBindingEditorOpen(false)} onOk={() => void submitBinding()} open={isBindingEditorOpen} title={isBound ? t('更换学习端账号绑定') : t('绑定学习端账号')}><Typography.Paragraph type="secondary">{t('请输入学习端登录邮箱和密码完成验证。验证成功后，会{{action}}。', { action: isBound ? t('替换当前绑定账号') : t('开启课程草稿预览') })}</Typography.Paragraph><Input autoFocus placeholder={t('学习端登录邮箱')} type="email" value={email} onChange={(event) => setEmail(event.target.value)} /><Input.Password placeholder={t('学习端登录密码')} value={password} onChange={(event) => setPassword(event.target.value)} style={{ marginTop: 12 }} /></Modal></section>
}
