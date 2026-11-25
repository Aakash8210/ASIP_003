import { Outlet, Link } from 'react-router-dom'
import { Sun, Moon, Shield, Eye, FileText, Lock } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

export function AuthLayout() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="min-h-screen flex bg-surface-50 dark:bg-surface-950">
      <div className="hidden lg:flex lg:w-1/2 bg-surface-950 text-surface-50 p-12 flex-col justify-between border-r border-surface-800">
        <div>
          <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Home">
            <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center">
              <Shield className="h-4 w-4 text-surface-950" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">InterviewGuard</span>
          </Link>
        </div>

        <div className="max-w-md space-y-8">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-brand-400 mb-3">
              INTERVIEW INTEGRITY WORKSPACE
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white leading-tight">
              Transparent monitoring built for human reviewers.
            </h1>
            <p className="mt-3 text-sm text-surface-400 leading-relaxed">
              Conduct structured video interviews with real-time 1 fps computer vision telemetry,
              observable behavioural signals, and evidence-linked reports.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-surface-800 bg-surface-900/70">
              <Eye className="h-4 w-4 text-brand-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-surface-100">Observable Visual Telemetry</p>
                <p className="text-xs text-surface-400 mt-0.5">Face presence and multi-face detection via local OpenCV YuNet.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-surface-800 bg-surface-900/70">
              <Lock className="h-4 w-4 text-brand-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-surface-100">Privacy-First Architecture</p>
                <p className="text-xs text-surface-400 mt-0.5">Explicit candidate consent and zero raw video frame persistence.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-surface-800 bg-surface-900/70">
              <FileText className="h-4 w-4 text-brand-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-surface-100">Evidence-Linked Reports</p>
                <p className="text-xs text-surface-400 mt-0.5">Chronological event timelines and human-in-the-loop review workflows.</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs font-mono text-surface-500">
          LOCAL-FIRST · ZERO EXTERNAL AI APIS
        </p>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-6">
            <Link to="/" className="flex items-center gap-2.5 lg:invisible" aria-label="Home">
              <div className="h-8 w-8 rounded-lg bg-surface-900 dark:bg-surface-100 flex items-center justify-center">
                <Shield className="h-4 w-4 text-white dark:text-surface-900" aria-hidden="true" />
              </div>
              <span className="text-sm font-semibold text-surface-900 dark:text-surface-50">
                InterviewGuard
              </span>
            </Link>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100 dark:text-surface-400 dark:hover:text-surface-200 dark:hover:bg-surface-800 transition-colors"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          <div className="bg-white dark:bg-surface-900 rounded-xl shadow-xs p-6 sm:p-8 border border-surface-200 dark:border-surface-800">
            <Outlet />
          </div>

          <p className="mt-6 text-center text-xs text-surface-500 dark:text-surface-400">
            &copy; {new Date().getFullYear()} InterviewGuard. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
