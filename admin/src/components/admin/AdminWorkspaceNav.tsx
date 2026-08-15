import { Menu } from 'antd'
import type { MenuProps } from 'antd'
import { BookOpen, Clapperboard, Layers3, LogOut, MessageSquareWarning, PanelLeftClose, PanelLeftOpen, Scissors, UserRound, Users } from 'lucide-react'
import type { AdminUser } from '@duolinting/shared'

export type AdminSection = 'importer' | 'directory' | 'courses' | 'recorder' | 'feedback' | 'users'

const adminSections: Array<{
  id: AdminSection
  label: string
  Icon: typeof Scissors
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
    id: 'importer',
    label: '制课工作台',
    Icon: Scissors,
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
  const workspaceItems: MenuProps['items'] = adminSections.map(({
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
      label: collapsed ? '管理员账号' : `${adminUser.displayName} · ${adminUser.username}`,
      children: [
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
