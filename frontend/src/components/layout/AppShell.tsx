import { useEffect, useState, type ComponentType } from 'react'
import { Outlet, Link, useLocation, NavLink, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Shield,
  Sun,
  X,
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'

export interface ShellNavItem {
  name: string
  href: string
  icon: ComponentType<{ className?: string }>
  badge?: string | number
  badgeTone?: 'info' | 'danger' | 'success'
}

export interface ShellNotification {
  id: string
  title: string
  message: string
  time: string
  read: boolean
}

interface AppShellProps {
  portalLabel: string
  homeHref: string
  settingsHref: string
  notificationsHref: string
  navigation: ShellNavItem[]
  notifications: ShellNotification[]
  brandIcon?: ComponentType<{ className?: string }>
  layoutId?: string
}

export function AppShell({
  portalLabel,
  homeHref,
  settingsHref,
  notificationsHref,
  navigation,
  notifications,
  brandIcon: BrandIcon = Shield,
}: AppShellProps) {
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/signin', { replace: true })
  }

  const unreadCount = notifications.filter((n) => !n.read).length
  const activeItem = navigation.find((n) => location.pathname.startsWith(n.href))

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-[#0c0d12] text-surface-900 dark:text-zinc-100 lg:flex">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 lg:sticky lg:top-0 lg:h-screen lg:shrink-0',
          'bg-white dark:bg-[#0e1017] border-r border-surface-200 dark:border-white/[0.07]',
          'transition-all duration-200 ease-in-out flex flex-col',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          !sidebarOpen && 'lg:w-[72px]'
        )}
        aria-label="Main navigation"
      >
        {/* Brand Bar */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-surface-200 dark:border-white/[0.07]">
          <Link to={homeHref} className="flex items-center gap-2.5 min-w-0" aria-label="Home">
            <div className="h-8 w-8 rounded-lg bg-[#2A1D18] dark:bg-[#2A1D18] border border-brand-500/30 flex items-center justify-center shrink-0">
              <BrandIcon className="h-4 w-4 text-brand-500" aria-hidden="true" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0 flex flex-col">
                <span className="text-sm font-semibold tracking-tight text-surface-900 dark:text-zinc-100 truncate">
                  AI Interview Integrity
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-surface-400 dark:text-zinc-500 truncate">
                  Enterprise Platform
                </span>
              </div>
            )}
          </Link>
          <button
            type="button"
            className="hidden lg:flex p-1.5 rounded-md text-surface-400 hover:text-surface-700 hover:bg-surface-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-white/[0.04] transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Live Operational Status Indicator */}
        {sidebarOpen && (
          <div className="px-4 pt-3.5 pb-1">
            <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/20 text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Telemetry Active
              </span>
              <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">1 fps CV</span>
            </div>
          </div>
        )}

        {/* Section Label */}
        {sidebarOpen && (
          <div className="px-4 pt-4 pb-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-surface-400 dark:text-zinc-500">
              {portalLabel}
            </p>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto" role="navigation" aria-label={`${portalLabel} navigation`}>
          {navigation.map((item) => {
            const isActive = location.pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={cn(
                  'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 group',
                  isActive
                    ? 'bg-[#2D211C] text-[#E09F80] border border-brand-500/25 shadow-xs font-semibold'
                    : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-white/[0.04]',
                  !sidebarOpen && 'justify-center px-2'
                )}
                aria-current={isActive ? 'page' : undefined}
                title={!sidebarOpen ? item.name : undefined}
                onClick={() => setMobileSidebarOpen(false)}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-colors',
                    isActive ? 'text-[#E09F80]' : 'text-surface-400 dark:text-zinc-500 group-hover:text-surface-700 dark:group-hover:text-zinc-300'
                  )}
                  aria-hidden="true"
                />
                {sidebarOpen && <span className="truncate">{item.name}</span>}
                {item.badge !== undefined && sidebarOpen && (
                  <span
                    className={cn(
                      'ml-auto inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-mono font-medium border',
                      item.badgeTone === 'danger' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
                      item.badgeTone === 'success' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                      (!item.badgeTone || item.badgeTone === 'info') && 'bg-brand-500/10 text-brand-600 dark:text-brand-300 border-brand-500/20'
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Bottom User Profile */}
        <div className="p-3 border-t border-surface-200 dark:border-white/[0.07]">
          <div
            className={cn(
              'rounded-xl border border-surface-200 dark:border-white/[0.07] bg-surface-50 dark:bg-[#14161f] p-2.5 flex items-center gap-2.5',
              !sidebarOpen && 'flex-col p-2'
            )}
          >
            <Link to={settingsHref} className="shrink-0" title={user?.name || 'Profile'}>
              <Avatar src={user?.avatar} name={user?.name} size="sm" status={user?.status} />
            </Link>
            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-surface-900 dark:text-zinc-100 truncate">
                  {user?.name || 'Workspace User'}
                </p>
                <p className="text-[10px] font-mono text-surface-400 dark:text-zinc-500 truncate">
                  {user?.email || portalLabel}
                </p>
              </div>
            )}
            <div className={cn('flex items-center gap-1', !sidebarOpen && 'flex-col')}>
              <button
                type="button"
                onClick={toggleTheme}
                className="p-1.5 rounded-md text-surface-500 hover:text-surface-900 hover:bg-surface-200/60 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 rounded-md text-surface-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-zinc-400 dark:hover:text-rose-400 transition-colors"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 min-h-screen flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 w-full border-b border-surface-200 dark:border-white/[0.07] bg-white/90 dark:bg-[#0c0d12]/90 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8 gap-4">
            {/* Breadcrumb Hierarchy */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="lg:hidden p-1.5 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.06]"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open menu"
                aria-expanded={mobileSidebarOpen}
              >
                <Menu className="h-5 w-5" />
              </button>
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-surface-500 dark:text-zinc-400 min-w-0">
                <span className="hover:text-surface-900 dark:hover:text-zinc-200 transition-colors hidden sm:inline">
                  Platform
                </span>
                <span className="text-surface-300 dark:text-zinc-700 hidden sm:inline">&rsaquo;</span>
                <span className="hover:text-surface-900 dark:hover:text-zinc-200 transition-colors">
                  {portalLabel}
                </span>
                <span className="text-surface-300 dark:text-zinc-700">&rsaquo;</span>
                <span className="text-surface-900 dark:text-zinc-100 font-semibold truncate">
                  {activeItem?.name || 'Workspace'}
                </span>
              </nav>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-2.5">
              {/* Global Search Bar with ⌘K Badge */}
              <div className="relative hidden md:flex items-center">
                <Search className="absolute left-3 h-3.5 w-3.5 text-surface-400 dark:text-zinc-500" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Global search..."
                  className="w-48 lg:w-64 h-8 pl-8 pr-10 text-xs rounded-lg border border-surface-200 dark:border-white/[0.08] bg-surface-50 dark:bg-[#14161f] text-surface-900 dark:text-zinc-200 placeholder:text-surface-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-brand-500/50"
                  aria-label="Global search"
                />
                <kbd className="absolute right-2 px-1.5 py-0.5 text-[10px] font-mono text-surface-400 dark:text-zinc-500 border border-surface-200 dark:border-white/[0.08] rounded bg-white dark:bg-[#1a1d28]">
                  ⌘K
                </kbd>
              </div>

              {/* Live Time Widget */}
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-surface-200 dark:border-white/[0.08] bg-surface-50 dark:bg-[#14161f] text-xs font-mono text-surface-600 dark:text-zinc-400 tabular-nums">
                <Clock className="h-3 w-3 text-brand-500" aria-hidden="true" />
                <span>{currentTime}</span>
              </div>

              {/* Notifications Popover */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative p-2 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.04] transition-colors"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-[#0c0d12]" />
                  )}
                </button>

                <AnimatePresence>
                  {notificationsOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#14161f] rounded-xl shadow-xl border border-surface-200 dark:border-white/[0.1] overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 border-b border-surface-200 dark:border-white/[0.07] flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-700 dark:text-zinc-300">
                          Notifications
                        </h3>
                        <button
                          type="button"
                          onClick={() => setNotificationsOpen(false)}
                          className="p-1 rounded text-surface-400 hover:text-surface-600 dark:text-zinc-500 dark:hover:text-zinc-200"
                          aria-label="Close notifications"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="max-h-80 overflow-y-auto divide-y divide-surface-100 dark:divide-white/[0.06]">
                        {notifications.map((notification) => (
                          <button
                            key={notification.id}
                            type="button"
                            className={cn(
                              'w-full p-3 text-left hover:bg-surface-50 dark:hover:bg-white/[0.02] transition-colors',
                              !notification.read && 'bg-brand-50/30 dark:bg-brand-500/[0.04]'
                            )}
                            onClick={() => setNotificationsOpen(false)}
                          >
                            <p className="font-medium text-xs text-surface-900 dark:text-zinc-100">
                              {notification.title}
                            </p>
                            <p className="text-xs text-surface-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-[10px] font-mono text-surface-400 dark:text-zinc-500 mt-1">
                              {notification.time}
                            </p>
                          </button>
                        ))}
                      </div>
                      <div className="p-2 border-t border-surface-200 dark:border-white/[0.07]">
                        <Link
                          to={notificationsHref}
                          className="text-xs font-medium text-brand-600 hover:text-brand-500 dark:text-brand-400 dark:hover:text-brand-300 block text-center py-1"
                          onClick={() => setNotificationsOpen(false)}
                        >
                          View all notifications
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Link
                to={settingsHref}
                className="p-2 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.04] transition-colors"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8" id="main-content" role="main">
          {mobileSidebarOpen && (
            <div
              className="fixed inset-0 z-30 lg:hidden bg-black/60 backdrop-blur-xs"
              onClick={() => setMobileSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  )
}
