import {
  ArrowDown,
  ArrowUp,
  Edit3,
  Ellipsis,
  Layers3,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useEffect, useState, type Key } from 'react'
import { Avatar, Badge, Button, Card, Descriptions, Divider, Dropdown, Empty, Flex, Form, Input, Space, Tag, Tree, Typography } from 'antd'
import type { DataNode } from 'antd/es/tree'
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

export function DirectoryManager(props: DirectoryManagerProps) {
  const {
    adminToken, categoryGroups, categories, categoryGroupForm, categoryForm, isSaving,
    onNotify, onCategoryGroupFormChange, onCategoryFormChange, onSaveCategoryGroup,
    onSaveCategory, onEditCategoryGroup, onEditCategory, onDeleteCategoryGroup,
    onDeleteCategory, onMoveCategoryGroup, onMoveCategory, onRefresh, onRequestConfirm,
  } = props
  const { t } = useAdminLanguage()
  const [activeEditor, setActiveEditor] = useState<ActiveEditor>(null)
  const [directorySearch, setDirectorySearch] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([])
  const [selectedKey, setSelectedKey] = useState<string>()

  // 目录接口返回后默认展开所有一级分类，并选中第一项。后续刷新只补充新分类，
  // 不覆盖管理员已经手动折叠的节点。
  useEffect(() => {
    if (categoryGroups.length === 0) {
      setSelectedKey(undefined)
      return
    }
    setSelectedKey((current) => {
      const keyStillExists = current?.startsWith('group:')
        ? categoryGroups.some((group) => `group:${group.id}` === current)
        : categories.some((category) => `category:${category.id}` === current)
      return keyStillExists ? current : `group:${categoryGroups[0].id}`
    })
    setExpandedKeys((current) => current.length > 0
      ? current
      : categoryGroups.map((group) => `group:${group.id}`))
  }, [categories, categoryGroups])

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

  const editGroup = (group: MaterialCategory) => {
    onEditCategoryGroup(group)
    setSelectedKey(`group:${group.id}`)
    setActiveEditor({ type: 'edit-group', groupId: group.id })
  }
  const createCategory = (group: MaterialCategory) => {
    onCategoryFormChange(() => ({
      groupId: group.id,
      name: '',
      description: '',
      accent: group.accent,
      coverImageUrl: '',
      sourceUrl: '',
      sortOrder: 10,
    }))
    setSelectedKey(`group:${group.id}`)
    setExpandedKeys((current) => current.includes(`group:${group.id}`) ? current : [...current, `group:${group.id}`])
    setActiveEditor({ type: 'create-category', groupId: group.id })
  }
  const editCategory = (category: ExerciseCategory) => {
    onEditCategory(category)
    setSelectedKey(`category:${category.id}`)
    setActiveEditor({ type: 'edit-category', categoryId: category.id })
  }

  const normalizedSearch = directorySearch.trim().toLocaleLowerCase()
  const visibleGroups = categoryGroups.map((group, groupIndex) => {
    const groupCategories = categories.filter((category) => category.groupId === group.id)
    const groupMatches = !normalizedSearch
      || `${group.name} ${group.description}`.toLocaleLowerCase().includes(normalizedSearch)
    const visibleCategories = groupMatches
      ? groupCategories
      : groupCategories.filter((category) => (
        `${category.name} ${category.description}`.toLocaleLowerCase().includes(normalizedSearch)
      ))
    return { group, groupIndex, groupCategories, visibleCategories, visible: groupMatches || visibleCategories.length > 0 }
  }).filter((entry) => entry.visible)

  const treeData: DataNode[] = visibleGroups.map(({ group, groupIndex, groupCategories, visibleCategories }) => ({
    key: `group:${group.id}`,
    title: (
      <div className="directory-tree-row directory-tree-group-row">
        <Avatar
          shape="square"
          size={28}
          src={group.coverImageUrl ? resolveApiUrl(group.coverImageUrl) : undefined}
          style={{ backgroundColor: group.accent }}
        />
        <span className="directory-tree-copy">
          <Typography.Text ellipsis strong>{group.name}</Typography.Text>
          <Typography.Text className="directory-tree-description" ellipsis type="secondary">
            {group.description || t('暂无说明')}
          </Typography.Text>
        </span>
        <Badge count={groupCategories.length} showZero color="#1cb0f6" />
        <Dropdown
          menu={{
            items: [
              { key: 'edit', icon: <Edit3 size={14} />, label: t('编辑内容分类'), onClick: () => editGroup(group) },
              { key: 'create', icon: <Plus size={14} />, label: t('新建学习系列'), onClick: () => createCategory(group) },
              { type: 'divider' },
              { key: 'up', icon: <ArrowUp size={14} />, label: t('上移内容分类'), disabled: isSaving || groupIndex === 0, onClick: () => onMoveCategoryGroup(group.id, 'up') },
              { key: 'down', icon: <ArrowDown size={14} />, label: t('下移内容分类'), disabled: isSaving || groupIndex === categoryGroups.length - 1, onClick: () => onMoveCategoryGroup(group.id, 'down') },
              { type: 'divider' },
              { key: 'delete', danger: true, icon: <Trash2 size={14} />, label: t('删除内容分类'), disabled: isSaving, onClick: () => void confirmDeleteGroup(group) },
            ],
          }}
          trigger={['click']}
        >
          <Button
            aria-label={t('内容分类操作')}
            disabled={Boolean(activeEditor)}
            icon={<Ellipsis size={16} />}
            onClick={(event) => event.stopPropagation()}
            size="small"
            type="text"
          />
        </Dropdown>
      </div>
    ),
    children: visibleCategories.map((category) => {
      const categoryIndex = groupCategories.findIndex((item) => item.id === category.id)
      return {
        key: `category:${category.id}`,
        title: (
          <div className="directory-tree-row directory-tree-category-row">
            <Avatar
              shape="square"
              size={22}
              src={category.coverImageUrl ? resolveApiUrl(category.coverImageUrl) : undefined}
              style={{ backgroundColor: category.accent }}
            />
            <Typography.Text className="directory-tree-category-name" ellipsis>{category.name}</Typography.Text>
            <Dropdown
              menu={{
                items: [
                  { key: 'edit', icon: <Edit3 size={14} />, label: t('编辑学习系列'), onClick: () => editCategory(category) },
                  { type: 'divider' },
                  { key: 'up', icon: <ArrowUp size={14} />, label: t('上移学习系列'), disabled: isSaving || categoryIndex === 0, onClick: () => onMoveCategory(category.id, 'up') },
                  { key: 'down', icon: <ArrowDown size={14} />, label: t('下移学习系列'), disabled: isSaving || categoryIndex === groupCategories.length - 1, onClick: () => onMoveCategory(category.id, 'down') },
                  { type: 'divider' },
                  { key: 'delete', danger: true, icon: <Trash2 size={14} />, label: t('删除学习系列'), disabled: isSaving, onClick: () => void confirmDeleteCategory(category) },
                ],
              }}
              trigger={['click']}
            >
              <Button
                aria-label={t('学习系列操作')}
                disabled={Boolean(activeEditor)}
                icon={<Ellipsis size={15} />}
                onClick={(event) => event.stopPropagation()}
                size="small"
                type="text"
              />
            </Dropdown>
          </div>
        ),
      }
    }),
  }))

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

  const selectedGroup = selectedKey?.startsWith('group:')
    ? categoryGroups.find((group) => `group:${group.id}` === selectedKey)
    : undefined
  const selectedCategory = selectedKey?.startsWith('category:')
    ? categories.find((category) => `category:${category.id}` === selectedKey)
    : undefined
  const selectedCategoryGroup = selectedCategory
    ? categoryGroups.find((group) => group.id === selectedCategory.groupId)
    : undefined
  const selectedLocalizations = selectedGroup?.localizations ?? selectedCategory?.localizations

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
      <div className="directory-workbench">
        <Card className="directory-tree-panel" size="small">
          <Input.Search
            allowClear
            onChange={(event) => {
              const value = event.target.value
              setDirectorySearch(value)
              if (value.trim()) {
                setExpandedKeys(categoryGroups.map((group) => `group:${group.id}`))
              }
            }}
            placeholder={t('搜索内容分类或学习系列')}
            value={directorySearch}
          />
          <div className="directory-tree-scroll">
            {categoryGroups.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('还没有内容分类，请直接在这里新建。')} />
            ) : treeData.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('没有匹配的目录')} />
            ) : (
              <Tree
                blockNode
                expandedKeys={expandedKeys}
                onExpand={setExpandedKeys}
                onSelect={(keys) => {
                  if (!activeEditor && keys[0]) setSelectedKey(String(keys[0]))
                }}
                selectedKeys={selectedKey ? [selectedKey] : []}
                showLine={{ showLeafIcon: false }}
                treeData={treeData}
              />
            )}
          </div>
        </Card>

        <Card
          className="directory-detail-panel"
          extra={!activeEditor && (selectedGroup || selectedCategory) ? (
            <Space>
              {selectedGroup && (
                <Button icon={<Plus size={15} />} onClick={() => createCategory(selectedGroup)}>
                  {t('新建学习系列')}
                </Button>
              )}
              <Button
                icon={<Edit3 size={15} />}
                onClick={() => selectedGroup ? editGroup(selectedGroup) : selectedCategory && editCategory(selectedCategory)}
                type="primary"
              >
                {t('编辑')}
              </Button>
            </Space>
          ) : null}
          size="small"
          title={activeEditor ? activeEditorTitle : selectedGroup ? t('内容分类详情') : selectedCategory ? t('学习系列详情') : t('目录详情')}
        >
          {activeEditor ? activeEditorContent : selectedGroup || selectedCategory ? (
            <div className="directory-detail-content">
              <div className="directory-detail-hero">
                <Avatar
                  shape="square"
                  size={64}
                  src={(selectedGroup?.coverImageUrl || selectedCategory?.coverImageUrl)
                    ? resolveApiUrl((selectedGroup?.coverImageUrl || selectedCategory?.coverImageUrl) as string)
                    : undefined}
                  style={{ backgroundColor: selectedGroup?.accent || selectedCategory?.accent }}
                />
                <div>
                  <Space size={8} wrap>
                    <Tag color={selectedGroup ? 'blue' : 'cyan'}>{selectedGroup ? t('内容分类') : t('学习系列')}</Tag>
                    <Typography.Title level={4}>{selectedGroup?.name || selectedCategory?.name}</Typography.Title>
                  </Space>
                  <Typography.Paragraph type="secondary">
                    {selectedGroup?.description || selectedCategory?.description || t('暂无说明')}
                  </Typography.Paragraph>
                </div>
              </div>
              <Descriptions bordered column={1} size="small">
                {selectedCategoryGroup && <Descriptions.Item label={t('所属内容分类')}>{selectedCategoryGroup.name}</Descriptions.Item>}
                {selectedGroup && (
                  <Descriptions.Item label={t('学习系列数量')}>
                    {categories.filter((category) => category.groupId === selectedGroup.id).length}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label={t('排序值')}>{selectedGroup?.sortOrder ?? selectedCategory?.sortOrder}</Descriptions.Item>
                <Descriptions.Item label={t('色值')}>
                  <Space><span className="directory-accent-swatch" style={{ backgroundColor: selectedGroup?.accent || selectedCategory?.accent }} />{selectedGroup?.accent || selectedCategory?.accent}</Space>
                </Descriptions.Item>
                {selectedCategory?.sourceUrl && (
                  <Descriptions.Item label={t('来源链接')}>
                    <Typography.Link href={selectedCategory.sourceUrl} rel="noreferrer" target="_blank">{selectedCategory.sourceUrl}</Typography.Link>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label={t('多语言内容')}>
                  <Space wrap>
                    {directoryLocalizationLocales.map((locale) => (
                      <Tag color={selectedLocalizations?.[locale]?.name ? 'green' : 'default'} key={locale}>
                        {t(directoryLocalizationLabels[locale])} · {selectedLocalizations?.[locale]?.name ? t('已填写') : t('未填写')}
                      </Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            </div>
          ) : (
            <Empty description={t('请从左侧选择内容分类或学习系列')} />
          )}
        </Card>
      </div>
    </Card>
  )
}
