import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, HandHeart, LogIn, LogOut, Settings, User, Volume2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { AuthUser } from '@duolinting/shared'
import { useLanguage } from '../i18n/LanguageProvider'

type TopBarProps = {
  user: AuthUser | null
  onOpenAccount: () => void
  onLogout: () => void
}

// 已登录时账户按钮展开下拉菜单：用户信息 / 设置 / 退出登录；
// 未登录时点击仍是打开登录弹窗。语言切换统一在设置页。
export function TopBar({ user, onOpenAccount, onLogout }: TopBarProps) {
  const { t } = useLanguage()
  const navigate = useNavigate()

  return (
    <header className="topbar">
      <button
        aria-label={t('brand')}
        className="brand-lockup"
        onClick={() => navigate('/')}
        type="button"
      >
        <div className="brand-mark">
          <Volume2 size={20} aria-hidden="true" />
        </div>
        <div>
          <h1>{t('brand')}</h1>
          <p>{t('courseLabel')}</p>
        </div>
      </button>
      <div className="topbar-actions" aria-label={t('topbar.learningOverview')}>
        <button
          className="contribute-trigger"
          onClick={() => navigate('/contribute')}
          type="button"
        >
          <HandHeart size={17} aria-hidden="true" />
          <span>{t('contribute.nav')}</span>
        </button>
        {user ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="account-trigger signed-in" type="button">
                <User size={16} aria-hidden="true" />
                {user.displayName}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" className="topbar-menu" sideOffset={8}>
                <div className="topbar-menu-user">
                  <span className="topbar-menu-avatar" aria-hidden="true">
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="topbar-menu-identity">
                    <strong>{user.displayName}</strong>
                    <span>{user.email}</span>
                  </span>
                </div>
                <DropdownMenu.Separator className="topbar-menu-separator" />
                <DropdownMenu.Item
                  className="topbar-menu-item"
                  onSelect={() => navigate('/contribute')}
                >
                  <HandHeart size={15} aria-hidden="true" />
                  {t('contribute.nav')}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="topbar-menu-item"
                  onSelect={() => navigate('/settings')}
                >
                  <Settings size={15} aria-hidden="true" />
                  {t('settings.title')}
                </DropdownMenu.Item>
                <DropdownMenu.Item className="topbar-menu-item danger" onSelect={onLogout}>
                  <LogOut size={15} aria-hidden="true" />
                  {t('auth.logout')}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : (
          <button className="account-trigger" onClick={onOpenAccount} type="button">
            <LogIn size={16} aria-hidden="true" />
            {t('login')}
          </button>
        )}
      </div>
    </header>
  )
}
