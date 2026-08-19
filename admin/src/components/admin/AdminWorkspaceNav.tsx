import { Menu } from 'antd'
import type { MenuProps } from 'antd'
import { BookOpen, Clapperboard, KeyRound, Layers3, ListChecks, LogOut, MessageSquareWarning, PanelLeftClose, PanelLeftOpen, PencilLine, UserRound, Users, UsersRound, type LucideIcon } from 'lucide-react'
import type { AdminUser } from '@duolinting/shared'

export type AdminSection = 'importer' | 'directory' | 'courses' | 'recorder' | 'feedback' | 'users' | 'collaboration' | 'activity' | 'api-keys' | 'account-settings'

const adminSections: Array<{
  id: AdminSection
  label: string
  Icon: LucideIcon
}> = [
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
  onRequestDisplayNameChange: () => void
  onLogout: () => void
  onSectionChange: (section: AdminSection) => void
}

export function AdminWorkspaceNav({
  activeSection,
  adminUser,
  collapsed = false,
  onCollapsedChange,
  onRequestDisplayNameChange,
  onLogout,
  onSectionChange,
}: AdminWorkspaceNavProps) {
  // 制课工作台只作为“课程管理”里某门课程的编辑页入口，不在侧栏单独出现。
  // 贡献者因此只看到自己获授权的课程管理入口；超级管理员保留完整管理菜单。
  const visibleSections = adminSections.filter((section) =>
    adminUser.role === 'super_admin' || section.id === 'courses' || section.id === 'activity' || section.id === 'account-settings',
  )
  if (adminUser.role === 'super_admin') {
    visibleSections.push({ id: 'collaboration', label: '人员管理', Icon: UsersRound })
    visibleSections.push({ id: 'api-keys', label: '开放内容 API', Icon: KeyRound })
  }
  const workspaceItems: MenuProps['items'] = visibleSections.map(({
    id,
    label,
    Icon,
  }) => ({
    key: id,
    icon: <Icon size={17} aria-hidden="true" />,
    label,
  }))

  const menuItems: MenuProps['items'] = [
    {
      className: 'admin-menu-collapse',
      icon: collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />,
      key: 'collapse',
      label: collapsed ? '展开侧栏' : '收起侧栏',
      title: collapsed ? '展开侧栏' : '收起侧栏',
    },
    {
      className: 'admin-menu-brand',
      disabled: true,
      icon: <img alt="" className="admin-menu-brand-icon" src="/duolinting-logo-ear.png" />,
      key: 'brand',
      label: collapsed ? 'DuolinTing' : 'DuolinTing 管理后台',
    },
    ...workspaceItems,
    { type: 'divider' },
    {
      className: 'admin-menu-account',
      icon: <UserRound size={17} aria-hidden="true" />,
      key: 'account',
      label: collapsed ? '后台账号' : `${adminUser.displayName} · ${adminUser.role === 'super_admin' ? '超级管理员' : '字幕贡献者'}`,
      children: [
        {
          icon: <UserRound size={16} aria-hidden="true" />,
          // 与侧栏工作区使用不同 key，避免 Ant Design 在同一 Menu 树中报重复 key。
          key: 'open-account-settings',
          label: '我的账号',
        },
        ...(adminUser.role === 'subtitle_contributor' ? [{
          icon: <PencilLine size={16} aria-hidden="true" />,
          key: 'change-display-name',
          label: '修改显示名称（90 天一次）',
        }] : []),
        {
          icon: <LogOut size={16} aria-hidden="true" />,
          key: 'logout',
          label: '退出登录',
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
    if (key === 'change-display-name') {
      onRequestDisplayNameChange()
      return
    }
    if (key === 'open-account-settings') {
      onSectionChange('account-settings')
      return
    }
    if (key !== 'account') {
      onSectionChange(key as AdminSection)
    }
  }

  return (
      <Menu
        className={collapsed ? 'admin-workspace-menu is-collapsed' : 'admin-workspace-menu'}
        items={menuItems}
        mode="vertical"
      onClick={handleMenuClick}
      selectedKeys={[activeSection]}
    />
  )
}
