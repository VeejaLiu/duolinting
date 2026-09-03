import {
  ArrowDown,
  ArrowUp,
  Edit3,
  Layers3,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Avatar, Badge, Button, Card, Divider, Empty, Flex, Form, Input, List, Modal, Space, Tag, Tooltip, Typography } from 'antd'
import type {
  CreateCategoryGroupRequest,
  CreateCategoryRequest,
  ExerciseCategory,
  MaterialCategory,
} from '@duolinting/shared'
import type { AdminNoticeTone } from './AdminFeedback'
import { CoverImageField } from './CoverImageField'
import { apiClient, resolveApiUrl } from '../../lib/apiClient'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

const directoryLocalizationLocales = ['en-US', 'th-TH', 'ja-JP'] as const
const directoryLocalizationLabels = {
  'en-US': '英语',
  'th-TH': '泰语',
  'ja-JP': '日语',
}

type DirectoryManagerProps = {
  adminToken: string
  categoryGroups: MaterialCategory[]
  categories: ExerciseCategory[]
  categoryGroupForm: CreateCategoryGroupRequest
  categoryForm: CreateCategoryRequest
  isSaving: boolean
  onNotify: (message: string, tone?: AdminNoticeTone) => void
  onCategoryGroupFormChange: (updater: (current: CreateCategoryGroupRequest) => CreateCategoryGroupRequest) => void
  onCategoryFormChange: (updater: (current: CreateCategoryRequest) => CreateCategoryRequest) => void
  onSaveCategoryGroup: () => Promise<boolean>
  onSaveCategory: () => Promise<boolean>
  onEditCategoryGroup: (group: MaterialCategory) => void
  onEditCategory: (category: ExerciseCategory) => void
  onDeleteCategoryGroup: (groupId: number) => void
  onDeleteCategory: (categoryId: number) => void
  onMoveCategoryGroup: (groupId: number, direction: 'up' | 'down') => void
  onMoveCategory: (categoryId: number, direction: 'up' | 'down') => void
  onRefresh: () => Promise<void>
  onRequestConfirm: (options: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'danger' | 'default'
  }) => Promise<boolean>
}

type ActiveEditor =
  | { type: 'create-group' }
  | { type: 'edit-group'; groupId: number }
  | { type: 'create-category'; groupId: number }
  | { type: 'edit-category'; categoryId: number }
  | null

type DirectoryFormProps = {
  adminToken: string
  disabled: boolean
  form: CreateCategoryGroupRequest | CreateCategoryRequest
  kind: 'group' | 'category'
  onCancel: () => void
  onChange: (key: 'name' | 'accent' | 'description' | 'coverImageUrl' | 'sourceUrl' | 'localizations', value: string | Record<string, unknown>) => void
  onNotify: (message: string, tone?: AdminNoticeTone) => void
  onSave: () => void
}

function DirectoryForm({
  adminToken,
  disabled,
  form,
  kind,
  onCancel,
  onChange,
  onNotify,
  onSave,
}: DirectoryFormProps) {
  const { t } = useAdminLanguage()
  const entityLabel = kind === 'group' ? t('内容分类') : t('学习系列')
  const [isGeneratingLocalizations, setIsGeneratingLocalizations] = useState(false)
  const updateLocalized = (
    locale: typeof directoryLocalizationLocales[number],
    patch: { name?: string; description?: string },
  ) => {
    const localized = form.localizations?.[locale] ?? {}
    onChange('localizations', {
      ...form.localizations,
      [locale]: { ...localized, ...patch },
    })
  }
  const generateLocalizations = async () => {
    const sourceName = form.name.trim()
    const sourceDescription = form.description.trim()
    if (!sourceName) {
      onNotify(t('请先填写{{entity}}名称', { entity: entityLabel }), 'error')
      return
    }

    setIsGeneratingLocalizations(true)
    try {
      const nextLocalizations = { ...form.localizations }
      // 免费模型并发能力有限，三种语言顺序生成；每次把名称和说明作为独立行提交，
      // 返回结果按相同下标写回，避免名称与说明错位。
      for (const locale of directoryLocalizationLocales) {
        const sourceLines = sourceDescription ? [sourceName, sourceDescription] : [sourceName]
        const result = await apiClient.translateLines(
          sourceLines,
          adminToken,
          'zh-CN',
          locale,
          750,
        )
        if (result.failedIndexes.length > 0 || !result.translations[0]?.trim()) {
          throw new Error(`${directoryLocalizationLabels[locale]}生成失败`)
        }
        nextLocalizations[locale] = {
          name: result.translations[0].trim(),
          description: sourceDescription ? (result.translations[1] ?? '').trim() : '',
        }
      }
      onChange('localizations', nextLocalizations)
      onNotify(`${entityLabel}的英语、泰语和日语内容已生成`, 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'AI 多语言生成失败', 'error')
    } finally {
      setIsGeneratingLocalizations(false)
    }
  }
  return (
    <Card className="directory-editor" size="small">
      <Form layout="vertical">
        <Flex gap={16} wrap>
          <Form.Item label={t('名称')} required style={{ flex: '1 1 260px', marginBottom: 0 }}>
            <Input disabled={disabled} value={form.name} onChange={(event) => onChange('name', event.target.value)} />
          </Form.Item>
          <Form.Item label={t('色值')} style={{ flex: '0 1 180px', marginBottom: 0 }}>
            <Input disabled={disabled} value={form.accent} onChange={(event) => onChange('accent', event.target.value)} />
          </Form.Item>
        </Flex>
        <Form.Item label={kind === 'group' ? t('说明') : t('描述')} style={{ marginTop: 16, marginBottom: 0 }}>
          <Input disabled={disabled} value={form.description} onChange={(event) => onChange('description', event.target.value)} />
        </Form.Item>
        {kind === 'category' && (
          <Form.Item label={t('来源链接（可选）')} style={{ marginTop: 16, marginBottom: 0 }}>
            <Input
              disabled={disabled}
              placeholder="https://example.com/original-material"
              type="url"
              value={(form as CreateCategoryRequest).sourceUrl ?? ''}
              onChange={(event) => onChange('sourceUrl', event.target.value)}
            />
          </Form.Item>
        )}
        <Divider style={{ margin: '20px 0 12px' }}>{t('多语言内容')}</Divider>
        <Flex align="center" justify="space-between" gap={12} style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary">{t('同时检查和编辑所有语言，中文名称与说明作为 AI 翻译源。')}</Typography.Text>
          <Button
            disabled={disabled || isGeneratingLocalizations || !form.name.trim()}
            icon={<Sparkles size={15} />}
            loading={isGeneratingLocalizations}
            onClick={() => void generateLocalizations()}
            type="primary"
          >
            {isGeneratingLocalizations ? t('生成中') : t('AI 填充全部语言')}
          </Button>
        </Flex>
        <div className="directory-localization-grid">
          {directoryLocalizationLocales.map((locale) => {
            const localized = form.localizations?.[locale] ?? {}
            return (
              <Card key={locale} size="small" title={`${t(directoryLocalizationLabels[locale])} · ${locale}`}>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Form.Item label={t('名称')} style={{ marginBottom: 0 }}>
                    <Input
                      disabled={disabled || isGeneratingLocalizations}
                      value={localized.name ?? ''}
                      onChange={(event) => updateLocalized(locale, { name: event.target.value })}
                    />
                  </Form.Item>
                  <Form.Item label={t('说明')} style={{ marginBottom: 0 }}>
                    <Input
                      disabled={disabled || isGeneratingLocalizations}
                      value={localized.description ?? ''}
                      onChange={(event) => updateLocalized(locale, { description: event.target.value })}
                    />
                  </Form.Item>
                </Space>
              </Card>
            )
          })}
        </div>
        <Form.Item label={t('封面图（可选）')} style={{ marginTop: 16, marginBottom: 0 }}>
          <CoverImageField
            adminToken={adminToken}
            disabled={disabled}
            label={`${entityLabel}${t('封面')}`}
            onChange={(url) => onChange('coverImageUrl', url)}
            onNotify={onNotify}
            value={form.coverImageUrl ?? ''}
          />
        </Form.Item>
        <Flex justify="end" gap={8} style={{ marginTop: 16 }}>
          <Button disabled={disabled || isGeneratingLocalizations} onClick={onCancel}>{t('取消')}</Button>
          <Button disabled={disabled || isGeneratingLocalizations} icon={<Save size={15} />} onClick={onSave} type="primary">{t('保存')}{entityLabel}</Button>
        </Flex>
      </Form>
    </Card>
  )
}

function ActionButton({ disabled, label, onClick, children, danger = false }: {
  children: ReactNode
  danger?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  const { t } = useAdminLanguage()
  return <Tooltip title={t(label)}><Button danger={danger} disabled={disabled} icon={children} onClick={onClick} size="small" type="text" /></Tooltip>
}

export function DirectoryManager(props: DirectoryManagerProps) {
  const {
    adminToken, categoryGroups, categories, categoryGroupForm, categoryForm, isSaving,
    onNotify, onCategoryGroupFormChange, onCategoryFormChange, onSaveCategoryGroup,
    onSaveCategory, onEditCategoryGroup, onEditCategory, onDeleteCategoryGroup,
    onDeleteCategory, onMoveCategoryGroup, onMoveCategory, onRefresh, onRequestConfirm,
} = props
  const { t } = useAdminLanguage()
  const [activeEditor, setActiveEditor] = useState<ActiveEditor>(null)

  // 保存成功后才关闭编辑器；失败（如 400 校验错误，已有 toast 提示）保留当前编辑内容
  const saveGroup = async () => {
    if (await onSaveCategoryGroup()) {
      setActiveEditor(null)
    }
  }
  const saveCategory = async () => {
    if (await onSaveCategory()) {
      setActiveEditor(null)
    }
  }

  // 删除前二次确认：删除内容分类/学习系列会连带删除其封面媒体文件，且不可撤销
  const confirmDeleteGroup = async (group: MaterialCategory) => {
    const confirmed = await onRequestConfirm({
      title: t('删除内容分类'),
      message: t('删除内容分类“{{name}}”后，会同时删除其封面等媒体文件。此操作不可撤销。', { name: group.name }),
      confirmLabel: t('确认删除'),
      tone: 'danger',
    })
    if (confirmed) {
      onDeleteCategoryGroup(group.id)
    }
  }
  const confirmDeleteCategory = async (category: ExerciseCategory) => {
    const confirmed = await onRequestConfirm({
      title: t('删除学习系列'),
      message: t('删除学习系列“{{name}}”后，会同时删除其封面等媒体文件。此操作不可撤销。', { name: category.name }),
      confirmLabel: t('确认删除'),
      tone: 'danger',
    })
    if (confirmed) {
      onDeleteCategory(category.id)
    }
  }

  const groupForm = (onSave: () => void) => <DirectoryForm
    adminToken={adminToken} disabled={isSaving} form={categoryGroupForm} kind="group"
    onCancel={() => setActiveEditor(null)} onNotify={onNotify} onSave={onSave}
    onChange={(key, value) => onCategoryGroupFormChange((current) => ({ ...current, [key]: value }))}
  />
  const categoryEditor = (onSave: () => void) => <DirectoryForm
    adminToken={adminToken} disabled={isSaving} form={categoryForm} kind="category"
    onCancel={() => setActiveEditor(null)} onNotify={onNotify} onSave={onSave}
    onChange={(key, value) => onCategoryFormChange((current) => ({ ...current, [key]: value }))}
  />
  const activeCategoryGroup = activeEditor?.type === 'create-category'
    ? categoryGroups.find((group) => group.id === activeEditor.groupId)
    : null
  const activeEditorTitle = (() => {
    if (activeEditor?.type === 'create-group') return t('新建内容分类')
    if (activeEditor?.type === 'edit-group') return t('编辑内容分类')
    if (activeEditor?.type === 'create-category') {
      return `${t('新建学习系列')}${activeCategoryGroup ? ` · ${activeCategoryGroup.name}` : ''}`
    }
    if (activeEditor?.type === 'edit-category') return t('编辑学习系列')
    return ''
  })()
  const activeEditorContent =
    activeEditor?.type === 'create-group' || activeEditor?.type === 'edit-group'
      ? groupForm(saveGroup)
      : activeEditor?.type === 'create-category' || activeEditor?.type === 'edit-category'
        ? categoryEditor(saveCategory)
        : null

  const refreshDirectory = async () => {
    try {
      await onRefresh()
      onNotify(t('目录已刷新'), 'success')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('目录刷新失败'), 'error')
    }
  }

  return (
    <Card
      className="directory-manager"
      extra={<Space>
        <Button disabled={isSaving} icon={<RefreshCw size={15} />} onClick={() => void refreshDirectory()}>{t('刷新')}</Button>
        <Button disabled={isSaving} icon={<Plus size={15} />} onClick={() => {
          onCategoryGroupFormChange(() => ({ name: '', description: '', accent: '#1cb0f6', coverImageUrl: '', sortOrder: 10 }))
          setActiveEditor({ type: 'create-group' })
        }} type="primary">{t('新建内容分类')}</Button>
      </Space>}
      title={<Space><Layers3 size={18} /><span>{t('目录结构')}</span></Space>}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {categoryGroups.length === 0 ? <Empty description={t('还没有内容分类，请直接在这里新建。')} /> : (
          <List
            dataSource={categoryGroups}
            renderItem={(group, groupIndex) => {
              const groupCategories = categories.filter((category) => category.groupId === group.id)
              return <List.Item className="directory-group-item">
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Flex align="center" gap={12} justify="space-between">
                    <Space size={12}>
                      <Avatar shape="square" size={32} src={group.coverImageUrl ? resolveApiUrl(group.coverImageUrl) : undefined} style={{ backgroundColor: group.accent }} />
                      <Space direction="vertical" size={0}>
                        <Space size={8}><Tag color="blue">{t('内容分类')}</Tag><Typography.Text strong>{group.name}</Typography.Text></Space>
                        <Typography.Text type="secondary">{group.description}</Typography.Text>
                      </Space>
                    </Space>
                    <Space size={2}>
                      <ActionButton disabled={isSaving || groupIndex === 0} label="上移内容分类" onClick={() => onMoveCategoryGroup(group.id, 'up')}><ArrowUp size={16} /></ActionButton>
                      <ActionButton disabled={isSaving || groupIndex === categoryGroups.length - 1} label="下移内容分类" onClick={() => onMoveCategoryGroup(group.id, 'down')}><ArrowDown size={16} /></ActionButton>
                      <ActionButton label="编辑内容分类" onClick={() => { onEditCategoryGroup(group); setActiveEditor({ type: 'edit-group', groupId: group.id }) }}><Edit3 size={16} /></ActionButton>
                      <ActionButton danger disabled={isSaving} label="删除内容分类" onClick={() => void confirmDeleteGroup(group)}><Trash2 size={16} /></ActionButton>
                      <ActionButton disabled={isSaving} label="新建学习系列" onClick={() => { onCategoryFormChange(() => ({ groupId: group.id, name: '', description: '', accent: group.accent, coverImageUrl: '', sourceUrl: '', sortOrder: 10 })); setActiveEditor({ type: 'create-category', groupId: group.id }) }}><Plus size={16} /></ActionButton>
                    </Space>
                  </Flex>
                  <div className="directory-category-area">
                    <Flex align="center" justify="space-between">
                      <Typography.Text type="secondary">{t('学习系列')}</Typography.Text>
                      <Badge count={groupCategories.length} showZero color="#1cb0f6" />
                    </Flex>
                    {groupCategories.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('这个内容分类下还没有学习系列')} /> : (
                      <List
                        className="directory-category-list"
                        dataSource={groupCategories}
                        renderItem={(category, categoryIndex) => {
                        return <List.Item>
                          <Space direction="vertical" size={12} style={{ width: '100%' }}>
                            <Flex align="center" gap={12} justify="space-between">
                              <Space size={12}>
                                <Avatar shape="square" size={24} src={category.coverImageUrl ? resolveApiUrl(category.coverImageUrl) : undefined} style={{ backgroundColor: category.accent }} />
                                <Space direction="vertical" size={0}><Typography.Text>{category.name}</Typography.Text><Typography.Text type="secondary">{category.description}</Typography.Text></Space>
                              </Space>
                              <Space size={2}>
                                <ActionButton disabled={isSaving || categoryIndex === 0} label="上移学习系列" onClick={() => onMoveCategory(category.id, 'up')}><ArrowUp size={16} /></ActionButton>
                                <ActionButton disabled={isSaving || categoryIndex === groupCategories.length - 1} label="下移学习系列" onClick={() => onMoveCategory(category.id, 'down')}><ArrowDown size={16} /></ActionButton>
                                <ActionButton label="编辑学习系列" onClick={() => { onEditCategory(category); setActiveEditor({ type: 'edit-category', categoryId: category.id }) }}><Edit3 size={16} /></ActionButton>
                                <ActionButton danger disabled={isSaving} label="删除学习系列" onClick={() => void confirmDeleteCategory(category)}><Trash2 size={16} /></ActionButton>
                              </Space>
                            </Flex>
                          </Space>
                        </List.Item>
                        }}
                      />
                    )}
                  </div>
                </Space>
              </List.Item>
            }}
          />
        )}
      </Space>
      <Modal
        className="directory-editor-modal"
        destroyOnHidden
        footer={null}
        onCancel={() => setActiveEditor(null)}
        open={activeEditor !== null}
        styles={{ body: { maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' } }}
        title={activeEditorTitle}
        width="min(1200px, calc(100vw - 48px))"
      >
        {activeEditorContent}
      </Modal>
    </Card>
  )
}
