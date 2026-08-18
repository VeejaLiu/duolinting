import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Checkbox, Form, Input, List, Modal, Radio, Select, Space, Switch, Tag, Typography } from 'antd'
import { KeyRound, UserPlus, UsersRound } from 'lucide-react'
import type { AdminMember, AdminMemberProvisioning, AdminRole, CatalogExerciseSummary, ExerciseCategory, MaterialCategory, PreviewVolunteer } from '@duolinting/shared'
import { apiClient } from '../../lib/apiClient'

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

const roleLabel = (role: AdminRole) => (
  role === 'super_admin' ? '超级管理员' : '字幕贡献者'
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
  const [members, setMembers] = useState<AdminMember[]>([])
  const [volunteers, setVolunteers] = useState<PreviewVolunteer[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [memberFormOpen, setMemberFormOpen] = useState(false)
  const [activeArea, setActiveArea] = useState<'members' | 'assignments' | 'learners'>('members')
  const [assignmentTarget, setAssignmentTarget] = useState<AdminMember | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<AdminMember | null>(null)
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
      const [nextMembers, nextVolunteers, nextExercises] = await Promise.all([
        apiClient.getAdminMembers(adminToken),
        apiClient.getPreviewVolunteers(adminToken),
        exercises.length > 0 ? Promise.resolve(exercises) : onEnsureExercises(),
      ])
      setMembers(nextMembers.items)
      setVolunteers(nextVolunteers.items)
      setAvailableExercises(nextExercises)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '人员数据加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [adminToken, exercises, onEnsureExercises, onNotify])

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
      onNotify(error instanceof Error ? error.message : '创建后台成员失败', 'error')
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
      onNotify(`已更新 ${assignmentTarget.displayName} 的课程权限`, 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '课程权限保存失败', 'error')
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
      onNotify(error instanceof Error ? error.message : '重设临时密码失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const credentialText = provisionedMember
    ? `DuolinTing 管理后台账号已开通\n\n登录邮箱：${provisionedMember.email}\n临时密码：${provisionedMember.temporaryPassword}\n角色：${roleLabel(provisionedMember.role)}\n\n请使用以上信息登录管理后台。首次登录后，系统会要求你立即修改临时密码。`
    : ''

  const copyCredentials = async () => {
    try {
      await navigator.clipboard.writeText(credentialText)
      setCredentialCopied(true)
      onNotify('账号开通信息已复制', 'success')
    } catch {
      onNotify('复制失败，请手动复制后再关闭此窗口', 'error')
    }
  }

  const toggleVolunteer = async (volunteer: PreviewVolunteer, checked: boolean) => {
    try {
      await apiClient.updatePreviewVolunteer(volunteer.id, checked, adminToken)
      setVolunteers((current) => current.map((item) => (
        item.id === volunteer.id ? { ...item, isPreviewVolunteer: checked } : item
      )))
      onNotify(checked ? '已开启志愿者预览' : '已关闭志愿者预览', 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '志愿者状态更新失败', 'error')
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
    status === 'proofread' ? '已校对' : status === 'published' ? '已发布' : status === 'draft' ? '草稿' : '已归档'
  )

  return (
    <section className="admin-section">
      <div className="panel-title"><UsersRound size={18} /><span>人员管理</span></div>
      <Typography.Paragraph type="secondary">
        将账号资料、课程授权和学习端预览资格分开维护。新建后台成员使用临时密码首次登录后，必须先修改为自己的密码才能进入后台。
      </Typography.Paragraph>

      <Radio.Group
        onChange={(event) => setActiveArea(event.target.value)}
        optionType="button"
        options={[
          { label: '后台人员', value: 'members' },
          { label: '课程授权', value: 'assignments' },
          { label: '学习端成员', value: 'learners' },
        ]}
        value={activeArea}
      />

      {activeArea === 'members' && <Card
        extra={<Button icon={<UserPlus size={15} />} onClick={() => setMemberFormOpen(true)} type="primary">添加后台成员</Button>}
        loading={loading}
        title="后台成员"
      >
        <List
          dataSource={members}
          locale={{ emptyText: '尚未添加后台成员。' }}
          renderItem={(member) => (
            <List.Item actions={[
              <Button icon={<KeyRound size={14} />} key="reset-password" onClick={() => setPasswordTarget(member)}>重设临时密码</Button>,
            ]}>
              <List.Item.Meta
                title={(
                  <Space wrap>
                    <span>{member.displayName}</span>
                    <Tag color={member.role === 'super_admin' ? 'purple' : 'blue'}>{roleLabel(member.role)}</Tag>
                    {member.mustChangePassword && <Tag color="orange">待首次改密</Tag>}
                  </Space>
                )}
                description={`${member.email} · ${member.role === 'subtitle_contributor' ? '仅能编辑在“课程授权”中配置的课程字幕' : '拥有完整后台管理权限'}${member.mustChangePassword ? ' · 首次登录尚未完成' : ''}`}
              />
            </List.Item>
          )}
        />
      </Card>}

      {activeArea === 'assignments' && <Card loading={loading} title="课程授权">
        <Typography.Paragraph type="secondary">
          课程与人员的协作关系仅在这里维护。超级管理员默认拥有所有课程权限，无需分配。
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label="字幕贡献者">
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
              placeholder="选择需要配置课程权限的字幕贡献者"
              value={assignmentTarget?.id}
            />
          </Form.Item>
        </Form>

        {!assignmentTarget && (
          <Typography.Paragraph type="secondary">
            尚未选择字幕贡献者。请先选择一位成员，再按下方目录结构授予课程编辑权限。
          </Typography.Paragraph>
        )}

        {assignmentTarget && (
          <div className="assignment-editor">
            <div className="assignment-editor-toolbar">
              <Space wrap>
                <Typography.Text strong>{assignmentTarget.displayName}</Typography.Text>
                <Tag color="blue">字幕贡献者</Tag>
                <Typography.Text type="secondary">已选 {assignmentIds.length} 门课程</Typography.Text>
              </Space>
              <Space>
                <Button disabled={assignmentIds.length === sortedExercises.length} onClick={() => setAssignmentIds(sortedExercises.map((exercise) => exercise.id))}>全选所有课程</Button>
                <Button disabled={assignmentIds.length === 0} onClick={() => setAssignmentIds([])}>取消全选</Button>
                <Button loading={saving} onClick={() => void saveAssignments()} type="primary">保存课程权限</Button>
              </Space>
            </div>

            <div className="assignment-tree">
              {categoryGroups.length === 0 && (
                <Typography.Text type="secondary">正在加载课程目录；如持续为空，请刷新页面后重试。</Typography.Text>
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
                        <Typography.Text type="secondary"> · {groupCourseIds.length} 门课程</Typography.Text>
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
                              <Typography.Text type="secondary"> · {categoryCourseIds.length} 门课程</Typography.Text>
                            </Checkbox>
                            {categoryCourses.length === 0 ? (
                              <Typography.Text className="assignment-empty" type="secondary">暂无课程</Typography.Text>
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

      {activeArea === 'learners' && <Card loading={loading} title="学习端成员">
        <List
          dataSource={volunteers}
          locale={{ emptyText: '还没有学习端成员。学习者注册后会显示在这里。' }}
          renderItem={(volunteer) => (
            <List.Item actions={[
              <Switch
                checked={volunteer.isPreviewVolunteer}
                checkedChildren="志愿者"
                key="preview"
                onChange={(checked) => void toggleVolunteer(volunteer, checked)}
                unCheckedChildren="普通"
              />,
            ]}>
              <List.Item.Meta
                title={(
                  <Space>
                    <span>{volunteer.displayName}</span>
                    {volunteer.isPreviewVolunteer && <Tag color="green">志愿者预览</Tag>}
                  </Space>
                )}
                description={`${volunteer.email} · ${volunteer.isPreviewVolunteer ? '可预览草稿与已校对课程' : '仅可查看已发布课程'}`}
              />
            </List.Item>
          )}
        />
      </Card>}

      <Modal
        confirmLoading={saving}
        okButtonProps={{ disabled: !form.email.trim() || !form.displayName.trim() }}
        onCancel={() => { setMemberFormOpen(false); setForm(initialForm) }}
        onOk={() => void createMember()}
        open={memberFormOpen}
        title="添加后台成员"
      >
        <Typography.Paragraph type="secondary">
          系统会自动生成临时密码。创建后会一次性展示完整账号信息，请复制后通过安全渠道发送给该成员。
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label="登录邮箱"><Input autoComplete="email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></Form.Item>
          <Form.Item label="显示名称（将用于课程贡献署名）"><Input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} /></Form.Item>
          <Form.Item label="角色">
            <Select
              onChange={(role: AdminRole) => setForm((current) => ({ ...current, role }))}
              options={[
                { label: '字幕贡献者（仅编辑被分配课程的字幕）', value: 'subtitle_contributor' },
                { label: '超级管理员（完整后台管理权限）', value: 'super_admin' },
              ]}
              value={form.role}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        confirmLoading={saving}
        okButtonProps={{ danger: true }}
        okText="生成新临时密码"
        onCancel={() => setPasswordTarget(null)}
        onOk={() => void resetMemberPassword()}
        open={Boolean(passwordTarget)}
        title={passwordTarget ? `重设 ${passwordTarget.displayName} 的临时密码` : '重设临时密码'}
      >
        <Typography.Paragraph type="secondary">
          确认后系统会生成新的临时密码并立即使该成员当前的登录状态失效。新的临时密码只会展示一次。
        </Typography.Paragraph>
      </Modal>

      <Modal
        cancelButtonProps={{ style: { display: 'none' } }}
        okText={credentialCopied ? '已复制，关闭' : '关闭（我已安全保存）'}
        onOk={() => { setProvisionedMember(null); setCredentialCopied(false) }}
        open={Boolean(provisionedMember)}
        title="账号开通信息（仅显示一次）"
        closable={false}
        maskClosable={false}
      >
        <Typography.Paragraph type="warning">
          请立即复制并通过安全渠道发送。关闭此窗口后，临时密码不会再次显示，也不会保存在后台。
        </Typography.Paragraph>
        <Input.TextArea autoSize={{ minRows: 7, maxRows: 10 }} readOnly value={credentialText} />
        <Button block onClick={() => void copyCredentials()} style={{ marginTop: 12 }} type="primary">
          {credentialCopied ? '已复制账号信息' : '复制完整账号信息'}
        </Button>
      </Modal>
    </section>
  )
}
