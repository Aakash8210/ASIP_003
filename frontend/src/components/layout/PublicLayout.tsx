import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { Menu, X, Sun, Moon, Shield, BarChart2, LogOut } from 'lucide-react'
import { buttonVariants } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { useTheme } from '@/hooks/useTheme'
import { useAuth, getRoleDashboardPath } from '@/hooks/useAuth'

const navigation = [
  { name: 'Capabilities', href: '/#features' },
  { name: 'Workflow', href: '/#how-it-works' },
  { name: 'Ethics & Privacy', href: '/#trust' },
]

export function PublicLayout() {
  const { theme, toggleTheme } = useTheme()
  const { user, isLoading, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userMenuOpen])

  const handleUserMenuSelect = async (value: string) => {
    setUserMenuOpen(false)
    if (value === 'signout') {
      await logout()
      navigate('/', { replace: true })
      return
    }
    if (user) {
      const dashboardPath = getRoleDashboardPath(String(user.role))
      const settingsPath =
        user.role === 'hr' ? '/hr/settings' : user.role === 'interviewer' ? '/interviewer/settings' : '/interviewee/settings'
      if (value === 'dashboard') navigate(dashboardPath)
      else navigate(settingsPath)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-50 dark:bg-[#0c0d12] text-surface-900 dark:text-zinc-100">
      <header className="sticky top-0 z-40 w-full border-b border-surface-200 dark:border-white/[0.07] bg-white/90 dark:bg-[#0c0d12]/90 backdrop-blur-md">
        <nav className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2.5" aria-label="Home">
                <div className="h-8 w-8 rounded-lg bg-[#2A1D18] border border-brand-500/30 flex items-center justify-center shrink-0">
                  <Shield className="h-4 w-4 text-brand-500" aria-hidden="true" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold tracking-tight text-surface-900 dark:text-zinc-100">
                    AI Interview Integrity
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-surface-400 dark:text-zinc-500">
                    Platform
                  </span>
                </div>
              </Link>

              <div className="hidden md:flex md:items-center md:gap-6">
                {navigation.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    className="text-xs font-medium text-surface-600 hover:text-surface-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                  >
                    {item.name}
                  </a>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.04] transition-colors"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              {isLoading ? (
                <div className="h-8 w-8 animate-pulse bg-surface-200 dark:bg-white/[0.06] rounded-full" />
              ) : user ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-white/[0.04] transition-colors"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                  >
                    <Avatar
                      src={user.avatar}
                      name={user.name}
                      size="sm"
                      status={user.status}
                    />
                    <span className="hidden sm:block text-xs font-medium text-surface-700 dark:text-zinc-300">
                      {user.name}
                    </span>
                  </button>
                  {userMenuOpen && (
                    <div
                      className="dropdown"
                      role="menu"
                    >
                      <button
                        type="button"
                        className="dropdown-item text-left text-xs"
                        role="menuitem"
                        onClick={() => handleUserMenuSelect('dashboard')}
                      >
                        <BarChart2 className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" /> Dashboard
                      </button>
                      <button
                        type="button"
                        className="dropdown-item text-left text-xs"
                        role="menuitem"
                        onClick={() => handleUserMenuSelect('settings')}
                      >
                        <Shield className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" /> Settings
                      </button>
                      <div className="dropdown-divider" />
                      <button
                        type="button"
                        className="dropdown-item text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-left text-xs"
                        role="menuitem"
                        onClick={() => handleUserMenuSelect('signout')}
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-2">
                  <Link
                    to="/signin"
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    className={buttonVariants({ variant: 'primary', size: 'sm' })}
                  >
                    Open Console
                  </Link>
                </div>
              )}

              <button
                type="button"
                className="md:hidden p-2 rounded-lg text-surface-500 hover:text-surface-700 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-white/[0.04] transition-colors"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div id="mobile-menu" className="md:hidden py-4 border-t border-surface-200 dark:border-white/[0.07]">
              <div className="flex flex-col gap-3">
                {navigation.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    className="text-xs font-medium text-surface-600 hover:text-surface-900 dark:text-zinc-400 dark:hover:text-zinc-100 py-1"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.name}
                  </a>
                ))}
                {!user && (
                  <div className="flex items-center gap-2 pt-3 border-t border-surface-200 dark:border-white/[0.07]">
                    <Link
                      to="/signin"
                      className={buttonVariants({ variant: 'outline', size: 'sm', fullWidth: true })}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Sign in
                    </Link>
                    <Link
                      to="/signup"
                      className={buttonVariants({ variant: 'primary', size: 'sm', fullWidth: true })}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Open Console
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </nav>
      </header>

      <main className="flex-1" id="main-content">
        <Outlet />
      </main>

      <footer className="border-t border-surface-200 dark:border-white/[0.07] bg-white dark:bg-[#0c0d12]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-md bg-[#2A1D18] border border-brand-500/30 flex items-center justify-center">
              <Shield className="h-3 w-3 text-brand-500" aria-hidden="true" />
            </div>
            <span className="text-xs font-medium text-surface-600 dark:text-zinc-400">
              AI Interview Integrity Platform · Objective Telemetry & Human Decision-Making
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-surface-500 dark:text-zinc-400">
            <a href="/#features" className="hover:text-surface-900 dark:hover:text-zinc-100 transition-colors">Capabilities</a>
            <a href="/#how-it-works" className="hover:text-surface-900 dark:hover:text-zinc-100 transition-colors">Workflow</a>
            <a href="/#trust" className="hover:text-surface-900 dark:hover:text-zinc-100 transition-colors">Ethics & Privacy</a>
            <Link to="/signin" className="hover:text-surface-900 dark:hover:text-zinc-100 transition-colors">Console</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
