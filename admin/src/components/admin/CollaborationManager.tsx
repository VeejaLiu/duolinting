import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Checkbox, Dropdown, Form, Input, List, Modal, Radio, Select, Space, Tag, Typography } from 'antd'
import { ArrowLeft, MoreHorizontal, UserPlus, UsersRound } from 'lucide-react'
import type { AdminMember, AdminMemberProvisioning, AdminRole, CatalogExerciseSummary, ExerciseCategory, MaterialCategory } from '@duolinting/shared'
import { apiClient } from '../../lib/apiClient'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type CollaborationManagerProps = {
  adminToken: string
  categoryGroups: MaterialCategory[]
  categories: ExerciseCategory[]
  exercises: CatalogExerciseSummary[]
  onEnsureExercises: () => Promise<CatalogExerciseSummary[]>
  onNotify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

type AdminMemberForm = {
  email: string
  displayName: string
  role: AdminRole
}

const initialForm: AdminMemberForm = {
  email: '',
  displayName: '',
  role: 'subtitle_contributor',
}

const roleLabel = (role: AdminRole, t: (key: string) => string) => (
  t(role === 'super_admin' ? '超级管理员' : '字幕贡献者')
)

/** 人员管理覆盖后台协作账号与学习端成员；新后台账号首次登录必须改密。 */
export function CollaborationManager({
  adminToken,
  categoryGroups,
  categories,
  exercises,
  onEnsureExercises,
  onNotify,
}: CollaborationManagerProps) {
  const { t, uiLocale } = useAdminLanguage()
  const [members, setMembers] = useState<AdminMember[]>([])
  const [learnerSearchLoading, setLearnerSearchLoading] = useState(false)
  const [bindingTarget, setBindingTarget] = useState<AdminMember | null>(null)
  const [bindingResults, setBindingResults] = useState<Array<{ id: number; email: string; displayName: string; boundAdminMemberId?: number; boundAdminDisplayName?: string }>>([])
  const [bindingSearch, setBindingSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [memberFormOpen, setMemberFormOpen] = useState(false)
  const [activeArea, setActiveArea] = useState<'members' | 'assignments' | 'learners'>('members')
  const [assignmentTarget, setAssignmentTarget] = useState<AdminMember | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<AdminMember | null>(null)
  const [forcePasswordTarget, setForcePasswordTarget] = useState<AdminMember | null>(null)
  const [profileTarget, setProfileTarget] = useState<AdminMember | null>(null)
  const [profileForm, setProfileForm] = useState<{ email: string; displayName: string; role: AdminRole }>({ email: '', displayName: '', role: 'subtitle_contributor' })
  const [memberSearch, setMemberSearch] = useState('')
  const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | AdminRole>('all')
  const [memberStatusFilter, setMemberStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [form, setForm] = useState<AdminMemberForm>(initialForm)
  const [assignmentIds, setAssignmentIds] = useState<number[]>([])
  const [provisionedMember, setProvisionedMember] = useState<AdminMemberProvisioning | null>(null)
  const [credentialCopied, setCredentialCopied] = useState(false)
  const [availableExercises, setAvailableExercises] = useState<CatalogExerciseSummary[]>(exercises)

  const sortedExercises = useMemo(
    () => [...availableExercises].sort((left, right) => left.title.localeCompare(right.title, 'zh-CN')),
    [availableExercises],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [nextMembers, nextExercises] = await Promise.all([
        apiClient.getAdminMembers(adminToken),
        exercises.length > 0 ? Promise.resolve(exercises) : onEnsureExercises(),
      ])
      setMembers(nextMembers.items)
      setAvailableExercises(nextExercises)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('人员数据加载失败'), 'error')
    } finally {
      setLoading(false)
    }
  }, [adminToken, exercises, onEnsureExercises, onNotify, t])

  useEffect(() => {
    // Deferred startup read keeps the effect limited to initiating I/O; state updates
    // happen only when the asynchronous request resolves.
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const createMember = async () => {
    setSaving(true)
    try {
      const result = await apiClient.createAdminMember(form, adminToken)
      setMemberFormOpen(false)
      setForm(initialForm)
      await refresh()
      setCredentialCopied(false)
      setProvisionedMember(result.member)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('创建后台成员失败'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveAssignments = async () => {
    if (!assignmentTarget) return
    setSaving(true)
    try {
      await apiClient.updateAdminMemberAssignments(assignmentTarget.id, assignmentIds, adminToken)
      // 保存后保留页内编辑上下文，管理员可以继续核对其他分类，不必重新选择成员。
      const updatedMember = { ...assignmentTarget, assignedExerciseIds: assignmentIds }
      setAssignmentTarget(updatedMember)
      setMembers((current) => current.map((member) => (
        member.id === updatedMember.id ? updatedMember : member
      )))
      onNotify(t('已更新 {{name}} 的课程权限', { name: assignmentTarget.displayName }), 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('课程权限保存失败'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const resetMemberPassword = async () => {
    if (!passwordTarget) return
    setSaving(true)
    try {
      const result = await apiClient.resetAdminMemberPassword(passwordTarget.id, adminToken)
      setPasswordTarget(null)
      await refresh()
      setCredentialCopied(false)
      setProvisionedMember(result.member)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('重设临时密码失败'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateProfile = async () => {
    if (!profileTarget) return
    setSaving(true)
    try {
      await apiClient.updateAdminMemberProfile(profileTarget.id, profileForm, adminToken)
      await refresh()
      setProfileTarget(null)
      onNotify(t('人员资料已更新'), 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('人员资料更新失败'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const changeMemberStatus = async (member: AdminMember, isActive: boolean) => {
    try {
      await apiClient.setAdminMemberActive(member.id, isActive, adminToken)
      await refresh()
      onNotify(isActive ? t('已启用 {{name}}', { name: member.displayName }) : t('已停用 {{name}}', { name: member.displayName }), 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('账号状态更新失败'), 'error')
    }
  }

  const revokeSessions = async (member: AdminMember) => {
    try {
      await apiClient.revokeAdminMemberSessions(member.id, adminToken)
      onNotify(t('已撤销 {{name}} 的全部登录会话', { name: member.displayName }), 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('会话撤销失败'), 'error')
    }
  }

  const forcePasswordChange = async () => {
    if (!forcePasswordTarget) return
    try {
      await apiClient.forceAdminMemberPasswordChange(forcePasswordTarget.id, adminToken)
      await refresh()
      setForcePasswordTarget(null)
      onNotify(t('已要求 {{name}} 下次登录修改密码', { name: forcePasswordTarget.displayName }), 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('强制改密设置失败'), 'error')
    }
  }

  const resetDisplayNameCooldown = async (member: AdminMember) => {
    try {
      await apiClient.resetContributorDisplayNameCooldown(member.id, adminToken)
      await refresh()
      onNotify(t('已解除 {{name}} 的改名冷却期', { name: member.displayName }), 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('重置改名冷却期失败'), 'error')
    }
  }

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase()
    return members.filter((member) => {
      if (memberRoleFilter !== 'all' && member.role !== memberRoleFilter) return false
      if (memberStatusFilter === 'active' && !member.isActive) return false
      if (memberStatusFilter === 'inactive' && member.isActive) return false
      if (!query) return true
      return member.displayName.toLowerCase().includes(query) || member.email.toLowerCase().includes(query)
    })
  }, [memberRoleFilter, memberSearch, memberStatusFilter, members])

  const adminMembers = filteredMembers.filter((member) => member.role === 'super_admin')
  const contributorMembers = filteredMembers.filter((member) => member.role === 'subtitle_contributor')

  const memberList = (items: AdminMember[], emptyText: string) => (
    <List
      dataSource={items}
      locale={{ emptyText }}
      renderItem={(member) => (
        <List.Item actions={[
          <Dropdown
            key="actions"
            menu={{
              items: [
                { key: 'edit', label: t('编辑资料') },
                ...(member.role === 'subtitle_contributor' ? [{ key: 'assignments', label: t('课程授权') }] : []),
                ...(member.role === 'subtitle_contributor' ? [{ key: 'binding', label: t('绑定学习端账号') }] : []),
                ...(member.role === 'subtitle_contributor' ? [{ key: 'reset-display-name-cooldown', label: t('重置改名冷却期') }] : []),
                { key: 'reset-password', label: t('重设密码') },
                { key: 'force-password', label: t('强制下次改密') },
                { type: 'divider' },
                { key: 'revoke', label: t('撤销全部会话') },
                { key: 'status', danger: member.isActive, label: member.isActive ? t('停用账号') : t('启用账号') },
              ],
              onClick: ({ key }) => {
                if (key === 'edit') {
                  setProfileTarget(member)
                  setProfileForm({ email: member.email, displayName: member.displayName, role: member.role })
                } else if (key === 'assignments') {
                  setAssignmentTarget(member)
                  setAssignmentIds(member.assignedExerciseIds)
                  setActiveArea('assignments')
                } else if (key === 'binding') {
                  setBindingTarget(member)
                  setBindingSearch('')
                  setBindingResults([])
                } else if (key === 'reset-display-name-cooldown') {
                  Modal.confirm({ title: t('解除 {{name}} 的改名冷却期？', { name: member.displayName }), content: t('解除后，该贡献者可以立即在“我的账号”中修改公开显示名称。不会影响登录会话、课程授权或历史贡献署名。'), okText: t('确认解除'), onOk: () => resetDisplayNameCooldown(member) })
                } else if (key === 'reset-password') {
                  setPasswordTarget(member)
                } else if (key === 'force-password') {
                  setForcePasswordTarget(member)
                } else if (key === 'revoke') {
                  Modal.confirm({ title: t('撤销 {{name}} 的登录会话？', { name: member.displayName }), content: t('该成员需要重新登录，账号资料和课程权限不会改变。'), okText: t('确认撤销'), onOk: () => revokeSessions(member) })
                } else if (key === 'status') {
                  Modal.confirm({ title: member.isActive ? t('停用 {{name}}？', { name: member.displayName }) : t('启用 {{name}}？', { name: member.displayName }), content: member.isActive ? t('停用后立即无法登录，并会撤销当前会话。历史贡献和课程关系会保留。') : t('启用后该成员可以重新登录。'), okText: member.isActive ? t('停用账号') : t('启用账号'), okButtonProps: { danger: member.isActive }, onOk: () => changeMemberStatus(member, !member.isActive) })
                }
              },
            }}
            trigger={['click']}
          >
            <Button icon={<MoreHorizontal size={16} />}>{t('更多操作')}</Button>
          </Dropdown>,
        ]}>
          <List.Item.Meta
            title={(
              <Space wrap>
                <span>{member.displayName}</span>
                <Tag color={member.role === 'super_admin' ? 'purple' : 'blue'}>{roleLabel(member.role, t)}</Tag>
                <Tag color={member.isActive ? 'green' : 'default'}>{member.isActive ? t('正常') : t('已停用')}</Tag>
                {member.mustChangePassword && <Tag color="orange">{t('待首次改密')}</Tag>}
              </Space>
            )}
            description={<Space direction="vertical" size={2}><span>{member.email} · {member.role === 'subtitle_contributor' ? t('负责 {{count}} 门课程', { count: member.assignedExerciseIds.length }) : t('拥有完整后台管理权限')}</span>{member.role === 'subtitle_contributor' && <Typography.Text type={member.learnerUserId ? 'success' : 'warning'}>{member.learnerUserId ? t('学习端：{{name}}（{{email}}）', { name: member.learnerDisplayName ?? '', email: member.learnerEmail ?? '' }) : t('尚未绑定学习端账号')}</Typography.Text>}<Typography.Text type="secondary">{t('创建于 {{created}} · 最近登录 {{lastLogin}}', { created: formatDate(member.createdAt), lastLogin: formatDate(member.lastLoginAt) })}</Typography.Text></Space>}
          />
        </List.Item>
      )}
    />
  )

  const formatDate = (value?: string) => value ? new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : t('从未登录')

  const credentialText = provisionedMember
    ? `${t('DuolinTing 管理后台账号已开通')}\n\n${t('登录邮箱')}：${provisionedMember.email}\n${t('临时密码')}：${provisionedMember.temporaryPassword}\n${t('角色')}：${roleLabel(provisionedMember.role, t)}\n\n${t('请使用以上信息登录管理后台。首次登录后，系统会要求你立即修改临时密码。')}`
    : ''

  const copyCredentials = async () => {
    try {
      await navigator.clipboard.writeText(credentialText)
      setCredentialCopied(true)
      onNotify(t('账号开通信息已复制'), 'success')
    } catch {
      onNotify(t('复制失败，请手动复制后再关闭此窗口'), 'error')
    }
  }

  // 分级授权以既有的内容分类、学习系列、课程为准，便于管理员从课程结构中判断授权范围。
  const coursesByCategory = useMemo(() => {
    const byCategory = new Map<number, CatalogExerciseSummary[]>()
    for (const exercise of sortedExercises) {
      byCategory.set(exercise.categoryId, [...(byCategory.get(exercise.categoryId) ?? []), exercise])
    }
    return byCategory
  }, [sortedExercises])

  const addCourseIds = (courseIds: number[]) => {
    setAssignmentIds((current) => [...new Set([...current, ...courseIds])])
  }

  const removeCourseIds = (courseIds: number[]) => {
    const courseIdSet = new Set(courseIds)
    setAssignmentIds((current) => current.filter((courseId) => !courseIdSet.has(courseId)))
  }

  const isEveryCourseSelected = (courseIds: number[]) => (
    courseIds.length > 0 && courseIds.every((courseId) => assignmentIds.includes(courseId))
  )

  const isSomeCourseSelected = (courseIds: number[]) => (
    courseIds.some((courseId) => assignmentIds.includes(courseId)) && !isEveryCourseSelected(courseIds)
  )

  const statusLabel = (status: CatalogExerciseSummary['status']) => (
    t(status === 'proofread' ? '已校对' : status === 'published' ? '已发布' : status === 'draft' ? '草稿' : '已归档')
  )

  return (
    <section className="admin-section">
      <div className="panel-title"><UsersRound size={18} /><span>{t('人员管理')}</span></div>
      <Typography.Paragraph type="secondary">
        {t('将账号资料、课程授权和学习端预览资格分开维护。新建后台成员使用临时密码首次登录后，必须先修改为自己的密码才能进入后台。')}
      </Typography.Paragraph>

      <Radio.Group
        onChange={(event) => setActiveArea(event.target.value)}
        optionType="button"
        options={[
          { label: t('后台人员'), value: 'members' },
          { label: t('学习端成员'), value: 'learners' },
        ]}
        value={activeArea}
      />

      {activeArea === 'members' && <Card
        extra={<Button icon={<UserPlus size={15} />} onClick={() => setMemberFormOpen(true)} type="primary">{t('添加后台成员')}</Button>}
        loading={loading}
        title={t('后台成员')}
      >
        <Space wrap style={{ marginBottom: 16 }}>
          <Input allowClear onChange={(event) => setMemberSearch(event.target.value)} placeholder={t('搜索姓名或邮箱')} value={memberSearch} style={{ width: 260 }} />
          <Select onChange={setMemberRoleFilter} options={[{ label: t('全部角色'), value: 'all' }, { label: t('超级管理员'), value: 'super_admin' }, { label: t('字幕贡献者'), value: 'subtitle_contributor' }]} value={memberRoleFilter} style={{ width: 150 }} />
          <Select onChange={setMemberStatusFilter} options={[{ label: t('全部状态'), value: 'all' }, { label: t('正常'), value: 'active' }, { label: t('已停用'), value: 'inactive' }]} value={memberStatusFilter} style={{ width: 130 }} />
          <Typography.Text type="secondary">{t('管理员 {{admins}} 人 · 字幕贡献者 {{contributors}} 人', { admins: adminMembers.length, contributors: contributorMembers.length })}</Typography.Text>
        </Space>
        <Space direction="vertical" size={20} style={{ display: 'flex' }}>
          <Card size="small" title={t('管理员账号（{{count}}）', { count: adminMembers.length })}>{memberList(adminMembers, t('暂无管理员账号。'))}</Card>
          <Card size="small" title={t('字幕贡献者（{{count}}）', { count: contributorMembers.length })}>{memberList(contributorMembers, t('暂无字幕贡献者。'))}</Card>
        </Space>
      </Card>}

      {activeArea === 'assignments' && <Card
        extra={<Button icon={<ArrowLeft size={15} />} onClick={() => { setActiveArea('members'); setAssignmentTarget(null) }}>{t('返回人员列表')}</Button>}
        loading={loading}
        title={assignmentTarget ? t('{{name}} · 课程授权', { name: assignmentTarget.displayName }) : t('课程授权')}
      >
        <Typography.Paragraph type="secondary">
          {t('课程与人员的协作关系仅在这里维护。超级管理员默认拥有所有课程权限，无需分配。')}
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label={t('字幕贡献者（可切换人员）')}>
            <Select
              allowClear
              onChange={(memberId: number | undefined) => {
                const member = members.find((item) => item.id === memberId && item.role === 'subtitle_contributor') ?? null
                setAssignmentTarget(member)
                setAssignmentIds(member?.assignedExerciseIds ?? [])
              }}
              options={members
                .filter((member) => member.role === 'subtitle_contributor')
                .map((member) => ({ label: `${member.displayName} · ${member.email}`, value: member.id }))}
              placeholder={t('选择需要配置课程权限的字幕贡献者')}
              value={assignmentTarget?.id}
            />
          </Form.Item>
        </Form>

        {!assignmentTarget && (
          <Typography.Paragraph type="secondary">
            {t('尚未选择字幕贡献者。请先选择一位成员，再按下方目录结构授予课程编辑权限。')}
          </Typography.Paragraph>
        )}

        {assignmentTarget && (
          <div className="assignment-editor">
            <div className="assignment-editor-toolbar">
              <Space wrap>
                <Typography.Text strong>{assignmentTarget.displayName}</Typography.Text>
                <Tag color="blue">{t('字幕贡献者')}</Tag>
                <Typography.Text type="secondary">{t('已选 {{count}} 门课程', { count: assignmentIds.length })}</Typography.Text>
              </Space>
              <Space>
                <Button disabled={assignmentIds.length === sortedExercises.length} onClick={() => setAssignmentIds(sortedExercises.map((exercise) => exercise.id))}>{t('全选所有课程')}</Button>
                <Button disabled={assignmentIds.length === 0} onClick={() => setAssignmentIds([])}>{t('取消全选')}</Button>
                <Button
                  loading={saving}
                  onClick={() => Modal.confirm({
                    title: t('保存 {{name}} 的课程权限？', { name: assignmentTarget.displayName }),
                    content: t('将保留当前勾选的 {{count}} 门课程，未勾选的课程将移除编辑权限。', { count: assignmentIds.length }),
                    okText: t('确认保存'),
                    onOk: () => saveAssignments(),
                  })}
                  type="primary"
                >{t('保存课程权限')}</Button>
              </Space>
            </div>

            <div className="assignment-tree">
              {categoryGroups.length === 0 && (
                <Typography.Text type="secondary">{t('正在加载课程目录；如持续为空，请刷新页面后重试。')}</Typography.Text>
              )}
              {[...categoryGroups]
                .sort((left, right) => left.sortOrder - right.sortOrder)
                .map((group) => {
                  const groupCategories = categories
                    .filter((category) => category.groupId === group.id)
                    .sort((left, right) => left.sortOrder - right.sortOrder)
                  const groupCourseIds = groupCategories.flatMap((category) => (
                    (coursesByCategory.get(category.id) ?? []).map((exercise) => exercise.id)
                  ))
                  return (
                    <section className="assignment-group" key={group.id}>
                      <Checkbox
                        checked={isEveryCourseSelected(groupCourseIds)}
                        indeterminate={isSomeCourseSelected(groupCourseIds)}
                        onChange={(event) => event.target.checked ? addCourseIds(groupCourseIds) : removeCourseIds(groupCourseIds)}
                      >
                        <Typography.Text strong>{group.name}</Typography.Text>
                        <Typography.Text type="secondary"> · {t('{{count}} 门课程', { count: groupCourseIds.length })}</Typography.Text>
                      </Checkbox>

                      {groupCategories.map((category) => {
                        const categoryCourses = coursesByCategory.get(category.id) ?? []
                        const categoryCourseIds = categoryCourses.map((exercise) => exercise.id)
                        return (
                          <div className="assignment-category" key={category.id}>
                            <Checkbox
                              checked={isEveryCourseSelected(categoryCourseIds)}
                              indeterminate={isSomeCourseSelected(categoryCourseIds)}
                              onChange={(event) => event.target.checked ? addCourseIds(categoryCourseIds) : removeCourseIds(categoryCourseIds)}
                            >
                              <Typography.Text strong>{category.name}</Typography.Text>
                              <Typography.Text type="secondary"> · {t('{{count}} 门课程', { count: categoryCourseIds.length })}</Typography.Text>
                            </Checkbox>
                            {categoryCourses.length === 0 ? (
                              <Typography.Text className="assignment-empty" type="secondary">{t('暂无课程')}</Typography.Text>
                            ) : (
                              <Space className="assignment-course-list" direction="vertical" size={6}>
                                {categoryCourses.map((exercise) => (
                                  <Checkbox
                                    checked={assignmentIds.includes(exercise.id)}
                                    key={exercise.id}
                                    onChange={(event) => event.target.checked ? addCourseIds([exercise.id]) : removeCourseIds([exercise.id])}
                                  >
                                    {exercise.title} <Typography.Text type="secondary">· {statusLabel(exercise.status)}</Typography.Text>
                                  </Checkbox>
                                ))}
                              </Space>
                            )}
                          </div>
                        )
                      })}
                    </section>
                  )
                })}
            </div>
          </div>
        )}
      </Card>}

      {activeArea === 'learners' && <Card title={t('贡献者学习端绑定')}>
        <Typography.Paragraph type="secondary">
          {t('学习端预览权限由课程校对人和二审人的绑定关系自动产生，不再使用全局志愿者开关。请在“后台人员”中对字幕贡献者选择“绑定学习端账号”。')}
        </Typography.Paragraph>
        <List dataSource={contributorMembers} pagination={{ pageSize: 10, showSizeChanger: true }} renderItem={(member) => (
          <List.Item actions={[<Button key="binding" onClick={() => { setBindingTarget(member); setBindingSearch(''); setBindingResults([]) }}>{t('管理绑定')}</Button>] }>
            <List.Item.Meta title={member.displayName} description={member.learnerUserId ? `${member.learnerDisplayName} · ${member.learnerEmail}` : t('尚未绑定学习端账号')} />
          </List.Item>
        )} />
      </Card>}

      <Modal
        open={Boolean(bindingTarget)}
        title={bindingTarget ? t('绑定 {{name}} 的学习端账号', { name: bindingTarget.displayName }) : t('绑定学习端账号')}
        confirmLoading={saving}
        okButtonProps={{ disabled: !bindingTarget }}
        okText={t('保存绑定')}
        onCancel={() => setBindingTarget(null)}
        onOk={async () => {
          if (!bindingTarget) return
          setSaving(true)
          try {
            await apiClient.updateContributorLearnerBinding(bindingTarget.id, bindingTarget.learnerUserId ?? null, adminToken)
            await refresh()
            setBindingTarget(null)
            onNotify('学习端绑定已更新', 'success')
          } catch (error) {
            onNotify(error instanceof Error ? error.message : '学习端绑定失败', 'error')
          } finally { setSaving(false) }
        }}
      >
        <Typography.Paragraph type="secondary">{t('绑定后，该贡献者负责的课程草稿会在对应学习端账号的 App 和网页端预览。绑定关系不影响课程授权。')}</Typography.Paragraph>
        <Space.Compact style={{ width: '100%' }}>
          <Input value={bindingSearch} onChange={(event) => setBindingSearch(event.target.value)} onPressEnter={async () => { if (!bindingSearch.trim()) return; setLearnerSearchLoading(true); try { setBindingResults((await apiClient.searchLearnerUsers(bindingSearch, adminToken)).items) } finally { setLearnerSearchLoading(false) } }} placeholder={t('按学习端邮箱或名称搜索')} />
          <Button loading={learnerSearchLoading} type="primary" onClick={async () => { if (!bindingSearch.trim()) return; setLearnerSearchLoading(true); try { setBindingResults((await apiClient.searchLearnerUsers(bindingSearch, adminToken)).items) } finally { setLearnerSearchLoading(false) } }}>{t('搜索')}</Button>
        </Space.Compact>
        <List
          style={{ marginTop: 16 }}
          dataSource={bindingResults}
          locale={{ emptyText: t('搜索后选择一个学习端账号') }}
          renderItem={(item) => <List.Item actions={[<Button key="select" type={bindingTarget?.learnerUserId === item.id ? 'primary' : 'default'} disabled={Boolean(item.boundAdminMemberId && item.boundAdminMemberId !== bindingTarget?.id)} onClick={() => setBindingTarget((current) => current ? { ...current, learnerUserId: item.id, learnerEmail: item.email, learnerDisplayName: item.displayName } : current)}>{item.boundAdminMemberId && item.boundAdminMemberId !== bindingTarget?.id ? t('已绑定：{{name}}', { name: item.boundAdminDisplayName ?? '' }) : bindingTarget?.learnerUserId === item.id ? t('已选择') : t('选择')}</Button>] }><List.Item.Meta title={item.displayName} description={item.email} /></List.Item>}
        />
        {bindingTarget?.learnerUserId && <Button danger type="link" onClick={() => setBindingTarget((current) => current ? { ...current, learnerUserId: undefined, learnerEmail: undefined, learnerDisplayName: undefined } : current)}>{t('解除当前绑定')}</Button>}
      </Modal>

      <Modal
        confirmLoading={saving}
        okButtonProps={{ danger: true }}
        okText={t('确认强制改密')}
        onCancel={() => setForcePasswordTarget(null)}
        onOk={() => void forcePasswordChange()}
        open={Boolean(forcePasswordTarget)}
        title={forcePasswordTarget ? t('要求 {{name}} 下次修改密码', { name: forcePasswordTarget.displayName }) : t('强制修改密码')}
      >
        <Typography.Paragraph type="warning">
          {t('确认后会立即撤销该成员的当前登录会话。对方下次登录时必须使用现有密码登录，并立即设置新密码。')}
        </Typography.Paragraph>
      </Modal>

      <Modal
        confirmLoading={saving}
        okButtonProps={{ disabled: !profileForm.email.trim() || !profileForm.displayName.trim() }}
        onCancel={() => setProfileTarget(null)}
        onOk={() => void updateProfile()}
        open={Boolean(profileTarget)}
        title={profileTarget ? t('编辑 {{name}}', { name: profileTarget.displayName }) : t('编辑人员资料')}
      >
        <Typography.Paragraph type="secondary">
          {t('这里只修改账号资料，不会改变该人员的角色、课程授权或历史贡献记录。')}
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label={t('登录邮箱')}><Input autoComplete="email" type="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} /></Form.Item>
          <Form.Item label={t('显示名称（课程贡献署名）')}><Input value={profileForm.displayName} onChange={(event) => setProfileForm((current) => ({ ...current, displayName: event.target.value }))} /></Form.Item>
          <Form.Item label={t('角色')}><Select onChange={(role: AdminRole) => setProfileForm((current) => ({ ...current, role }))} options={[{ label: t('字幕贡献者'), value: 'subtitle_contributor' }, { label: t('超级管理员'), value: 'super_admin' }]} value={profileForm.role} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        confirmLoading={saving}
        okButtonProps={{ disabled: !form.email.trim() || !form.displayName.trim() }}
        onCancel={() => { setMemberFormOpen(false); setForm(initialForm) }}
        onOk={() => void createMember()}
        open={memberFormOpen}
        title={t('添加后台成员')}
      >
        <Typography.Paragraph type="secondary">
          {t('系统会自动生成临时密码。创建后会一次性展示完整账号信息，请复制后通过安全渠道发送给该成员。')}
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label={t('登录邮箱')}><Input autoComplete="email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></Form.Item>
          <Form.Item label={t('显示名称（将用于课程贡献署名）')}><Input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} /></Form.Item>
          <Form.Item label={t('角色')}>
            <Select
              onChange={(role: AdminRole) => setForm((current) => ({ ...current, role }))}
              options={[
                { label: t('字幕贡献者（仅编辑被分配课程的字幕）'), value: 'subtitle_contributor' },
                { label: t('超级管理员（完整后台管理权限）'), value: 'super_admin' },
              ]}
              value={form.role}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        confirmLoading={saving}
        okButtonProps={{ danger: true }}
        okText={t('生成新临时密码')}
        onCancel={() => setPasswordTarget(null)}
        onOk={() => void resetMemberPassword()}
        open={Boolean(passwordTarget)}
        title={passwordTarget ? t('重设 {{name}} 的临时密码', { name: passwordTarget.displayName }) : t('重设临时密码')}
      >
        <Typography.Paragraph type="secondary">
          {t('确认后系统会生成新的临时密码并立即使该成员当前的登录状态失效。新的临时密码只会展示一次。')}
        </Typography.Paragraph>
      </Modal>

      <Modal
        cancelButtonProps={{ style: { display: 'none' } }}
        okText={credentialCopied ? t('已复制，关闭') : t('关闭（我已安全保存）')}
        onOk={() => { setProvisionedMember(null); setCredentialCopied(false) }}
        open={Boolean(provisionedMember)}
        title={t('账号开通信息（仅显示一次）')}
        closable={false}
        maskClosable={false}
      >
        <Typography.Paragraph type="warning">
          {t('请立即复制并通过安全渠道发送。关闭此窗口后，临时密码不会再次显示，也不会保存在后台。')}
        </Typography.Paragraph>
        <Input.TextArea autoSize={{ minRows: 7, maxRows: 10 }} readOnly value={credentialText} />
        <Button block onClick={() => void copyCredentials()} style={{ marginTop: 12 }} type="primary">
          {credentialCopied ? t('已复制账号信息') : t('复制完整账号信息')}
        </Button>
      </Modal>
    </section>
  )
}
