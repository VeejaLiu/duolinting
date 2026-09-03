import { Menu, Select, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { BookOpen, Clapperboard, Inbox, KeyRound, Layers3, ListChecks, LogOut, MessageSquareWarning, PanelLeftClose, PanelLeftOpen, UserRound, Users, UsersRound, type LucideIcon } from 'lucide-react'
import type { AdminUser } from '@duolinting/shared'
import { adminUiLocaleLabels, useAdminLanguage } from '../../i18n/AdminLanguageProvider'

export type AdminSection = 'importer' | 'directory' | 'courses' | 'recorder' | 'feedback' | 'users' | 'collaboration' | 'activity' | 'pool' | 'api-keys' | 'account-settings'

const adminSections: Array<{
  id: AdminSection
  label: string
  Icon: LucideIcon
}> = [
  {
    id: 'pool',
    label: '任务广场',
    Icon: Inbox,
  },
  {
    id: 'directory',
    label: '目录结构',
    Icon: Layers3,
  },
  {
    id: 'courses',
    label: '课程管理',
    Icon: BookOpen,
  },
  {
    id: 'activity',
    label: '协作动态',
    Icon: ListChecks,
  },
  {
    id: 'recorder',
    label: '视频录制',
    Icon: Clapperboard,
  },
  {
    id: 'feedback',
    label: '反馈中心',
    Icon: MessageSquareWarning,
  },
  {
    id: 'users',
    label: '增长分析',
    Icon: Users,
  },
  { id: 'account-settings', label: '我的账号', Icon: UserRound },
]

type AdminWorkspaceNavProps = {
  activeSection: AdminSection
  adminUser: AdminUser
  collapsed?: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onLogout: () => void
  onSectionChange: (section: AdminSection) => void
}

export function AdminWorkspaceNav({
  activeSection,
  adminUser,
  collapsed = false,
  onCollapsedChange,
  onLogout,
  onSectionChange,
}: AdminWorkspaceNavProps) {
  const { t, uiLocale, setUiLocale } = useAdminLanguage()
  // 制课工作台只作为“课程管理”里某门课程的编辑页入口，不在侧栏单独出现。
  // 贡献者因此只看到自己获授权的课程管理入口；超级管理员保留完整管理菜单。
  const visibleSections = adminSections.filter((section) =>
    adminUser.role === 'super_admin'
      ? section.id !== 'account-settings'
      : section.id === 'courses' || section.id === 'pool' || section.id === 'activity' || section.id === 'account-settings',
  )
  if (adminUser.role === 'super_admin') {
    visibleSections.push({ id: 'collaboration', label: t('人员管理'), Icon: UsersRound })
    visibleSections.push({ id: 'api-keys', label: t('开放内容 API'), Icon: KeyRound })
  }
  const workspaceItems: MenuProps['items'] = visibleSections.map(({
    id,
    label,
    Icon,
  }) => ({
    key: id,
    icon: <Icon size={17} aria-hidden="true" />,
    label: t(label),
  }))

  const menuItems: MenuProps['items'] = [
    {
      className: 'admin-menu-collapse',
      icon: collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />,
      key: 'collapse',
      label: collapsed ? t('展开侧栏') : t('收起侧栏'),
      title: collapsed ? t('展开侧栏') : t('收起侧栏'),
    },
    {
      className: 'admin-menu-brand',
      disabled: true,
      icon: <img alt="" className="admin-menu-brand-icon" src="/duolinting-logo-ear.png" />,
      key: 'brand',
      label: collapsed ? 'DuolinTing' : `DuolinTing ${t('管理后台')}`,
    },
    ...workspaceItems,
    { type: 'divider' },
    {
      className: 'admin-menu-account',
      icon: <UserRound size={17} aria-hidden="true" />,
      key: 'account',
      label: collapsed ? t('后台账号') : `${adminUser.displayName} · ${adminUser.role === 'super_admin' ? t('超级管理员') : t('字幕贡献者')}`,
      children: [
        {
          key: 'language',
          label: (
            <div className="admin-account-language" onClick={(event) => event.stopPropagation()}>
              <Typography.Text type="secondary">{t('界面语言')}</Typography.Text>
              <Select
                aria-label={t('界面语言')}
                onChange={setUiLocale}
                onClick={(event) => event.stopPropagation()}
                options={(Object.keys(adminUiLocaleLabels) as Array<keyof typeof adminUiLocaleLabels>).map((locale) => ({
                  label: adminUiLocaleLabels[locale],
                  value: locale,
                }))}
                size="small"
                value={uiLocale}
              />
            </div>
          ),
        },
        {
          icon: <LogOut size={16} aria-hidden="true" />,
          key: 'logout',
          label: t('退出登录'),
        },
      ],
    },
  ]

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'collapse') {
      onCollapsedChange(!collapsed)
      return
    }
    if (key === 'logout') {
      onLogout()
      return
    }
    if (key === 'language') {
      return
    }
    if (key !== 'account') {
      onSectionChange(key as AdminSection)
    }
  }

  return (
    <div className="admin-workspace-nav">
      <Menu
        className={collapsed ? 'admin-workspace-menu is-collapsed' : 'admin-workspace-menu'}
        items={menuItems}
        mode="vertical"
        onClick={handleMenuClick}
        selectedKeys={[activeSection]}
      />
    </div>
  )
}
