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
  layoutId = 'app-shell-nav-pill',
}: AppShellProps) {
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationItems, setNotificationItems] = useState<ShellNotification[]>(notifications)
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

  const unreadCount = notificationItems.filter((n) => !n.read).length
  const activeItem = navigation.find((n) => location.pathname.startsWith(n.href))

  const markNotificationRead = (id: string) => {
    setNotificationItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const markAllRead = () => {
    setNotificationItems((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-[#08090E] text-surface-900 dark:text-zinc-100 lg:flex">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-60 lg:sticky lg:top-0 lg:h-screen lg:shrink-0',
          'bg-white dark:bg-[#0A0B11] border-r border-surface-200 dark:border-white/[0.07]',
          'transition-all duration-200 ease-in-out flex flex-col',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          !sidebarOpen && 'lg:w-[68px]'
        )}
        aria-label="Main navigation"
      >
        {/* Brand Bar */}
        <div className="flex h-14 items-center justify-between px-3.5 border-b border-surface-200 dark:border-white/[0.07]">
          <Link to={homeHref} className="flex items-center gap-2.5 min-w-0" aria-label="Home">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-b from-cyan-500 to-brand-600 flex items-center justify-center shrink-0 shadow-[0_0_14px_rgba(6,182,212,0.35)]">
              <BrandIcon className="h-3.5 w-3.5 text-white" aria-hidden="true" />
            </div>
            {sidebarOpen && (
              <span className="text-sm font-semibold tracking-tight text-surface-900 dark:text-white truncate">
                InterviewGuard
              </span>
            )}
          </Link>
          <button
            type="button"
            className="hidden lg:flex p-1.5 rounded-md text-surface-400 hover:text-surface-700 hover:bg-surface-100 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-white/[0.06] transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Live System Status Pill */}
        {sidebarOpen && (
          <div className="px-3.5 pt-3.5 pb-1">
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/20 text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
              <span className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                System Normal
              </span>
              <span className="text-[10px] opacity-75">v2.0</span>
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto" role="navigation" aria-label={`${portalLabel} navigation`}>
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
                    ? 'text-surface-950 dark:text-white'
                    : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100/80 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.04]',
                  !sidebarOpen && 'justify-center px-2'
                )}
                aria-current={isActive ? 'page' : undefined}
                title={!sidebarOpen ? item.name : undefined}
                onClick={() => setMobileSidebarOpen(false)}
              >
                {isActive && (
                  <motion.span
                    layoutId={layoutId}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-lg bg-surface-100 dark:bg-white/[0.07] border border-surface-200/80 dark:border-white/[0.08]"
                    aria-hidden="true"
                  />
                )}
                <Icon
                  className={cn(
                    'relative z-10 h-4 w-4 shrink-0 transition-colors',
                    isActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-surface-400 dark:text-zinc-500 group-hover:text-surface-700 dark:group-hover:text-zinc-300'
                  )}
                  aria-hidden="true"
                />
                {sidebarOpen && <span className="relative z-10 truncate">{item.name}</span>}
                {item.badge !== undefined && sidebarOpen && (
                  <span
                    className={cn(
                      'relative z-10 ml-auto inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-mono font-medium border',
                      item.badgeTone === 'danger' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
                      item.badgeTone === 'success' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                      (!item.badgeTone || item.badgeTone === 'info') && 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Bottom Elevated Profile Card */}
        <div className="p-2.5 border-t border-surface-200 dark:border-white/[0.07]">
          <div
            className={cn(
              'rounded-xl border border-surface-200 dark:border-white/[0.08] bg-surface-50 dark:bg-[#0F111A] p-2.5 flex items-center gap-2.5',
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
                <p className="text-[11px] font-mono text-surface-500 dark:text-zinc-500 truncate uppercase">
                  {portalLabel}
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
        <header className="sticky top-0 z-30 w-full border-b border-surface-200 dark:border-white/[0.07] bg-white/80 dark:bg-[#08090E]/80 backdrop-blur-xl">
          <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
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
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
                <span className="text-surface-400 dark:text-zinc-500 font-medium hidden sm:inline">
                  {portalLabel}
                </span>
                <span className="text-surface-300 dark:text-zinc-700 hidden sm:inline">/</span>
                <span className="font-semibold tracking-tight text-surface-900 dark:text-white truncate">
                  {activeItem?.name || 'Workspace'}
                </span>
              </nav>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Live Time Widget */}
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-surface-200 dark:border-white/[0.08] bg-surface-50 dark:bg-white/[0.02] text-xs font-mono text-surface-600 dark:text-zinc-400 tabular-nums">
                <Clock className="h-3.5 w-3.5 text-cyan-500" aria-hidden="true" />
                <span>{currentTime}</span>
              </div>

              {/* Notifications Popover */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative p-2 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-cyan-500 ring-2 ring-white dark:ring-[#08090E]" />
                  )}
                </button>

                <AnimatePresence>
                  {notificationsOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.14 }}
                      className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#0F111A] rounded-xl shadow-2xl border border-surface-200 dark:border-white/[0.1] backdrop-blur-xl overflow-hidden z-50"
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
                        {notificationItems.map((notification) => (
                          <button
                            key={notification.id}
                            type="button"
                            className={cn(
                              'w-full p-3.5 text-left hover:bg-surface-50 dark:hover:bg-[#171926] transition-colors',
                              !notification.read && 'bg-cyan-50/40 dark:bg-cyan-500/[0.05]'
                            )}
                            onClick={() => {
                              markNotificationRead(notification.id)
                              setNotificationsOpen(false)
                            }}
                          >
                            <p className="font-medium text-xs text-surface-900 dark:text-zinc-100">
                              {notification.title}
                            </p>
                            <p className="text-xs text-surface-500 dark:text-zinc-400 mt-1 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-[11px] font-mono text-surface-400 dark:text-zinc-500 mt-1.5">
                              {notification.time}
                            </p>
                          </button>
                        ))}
                      </div>
                      <div className="p-2.5 border-t border-surface-200 dark:border-white/[0.07] flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={markAllRead}
                          className="text-xs font-medium text-surface-600 hover:text-surface-900 dark:text-zinc-400 dark:hover:text-zinc-100 px-2 py-1"
                        >
                          Mark all read
                        </button>
                        <Link
                          to={homeHref}
                          className="text-xs font-medium text-cyan-600 hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300 px-2 py-1"
                          onClick={() => setNotificationsOpen(false)}
                        >
                          Go to dashboard
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Link
                to={settingsHref}
                className="p-2 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </header>

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
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  )
}
