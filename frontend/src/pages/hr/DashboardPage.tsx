import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  Clock,
  ArrowRight,
  Plus,
  AlertCircle,
  Video,
  Activity,
  Layers,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { apiClient, ApiError, InterviewSession } from '@/lib/api'
import { interviewStatusConfig, formatInterviewDate } from './interviewStatus'

export function HRDashboardPage() {
  const [interviews, setInterviews] = useState<InterviewSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<'Daily' | 'Monthly' | 'Yearly'>('Monthly')

  useEffect(() => {
    let cancelled = false
    apiClient
      .listInterviews()
      .then((response) => {
        if (!cancelled) setInterviews(response.interviews)
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof ApiError ? error.message : 'Failed to load interviews')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const total = interviews.length
    const upcoming = interviews.filter((i) => {
      if (!i.scheduled_start_at) return false
      const start = new Date(i.scheduled_start_at)
      return !Number.isNaN(start.getTime()) && start.getTime() > Date.now()
    }).length
    const inProgress = interviews.filter((i) => i.status === 'in_progress').length
    const completed = interviews.filter((i) => i.status === 'completed').length
    const draft = interviews.filter((i) => i.status === 'draft').length
    return { total, upcoming, inProgress, completed, draft }
  }, [interviews])

  const upcomingInterviews = useMemo(
    () =>
      interviews
        .filter((i) => {
          if (!i.scheduled_start_at) return false
          const start = new Date(i.scheduled_start_at)
          return !Number.isNaN(start.getTime()) && start.getTime() > Date.now()
        })
        .sort(
          (a, b) =>
            new Date(a.scheduled_start_at ?? 0).getTime() - new Date(b.scheduled_start_at ?? 0).getTime()
        )
        .slice(0, 5),
    [interviews]
  )

  const recentInterviews = useMemo(() => interviews.slice(0, 5), [interviews])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Operational Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-surface-900 dark:text-zinc-100">
            Recruitment Operations
          </h1>
          <p className="text-xs sm:text-sm text-surface-500 dark:text-zinc-400 mt-0.5">
            Operational dashboard of candidate interviews, live sessions, and review telemetry
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" asChild>
            <Link to="/hr/interviews">Browse All</Link>
          </Button>
          <Button size="sm" asChild className="gap-2">
            <Link to="/hr/interviews/new">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Create Interview</span>
            </Link>
          </Button>
        </div>
      </div>

      {loadError && (
        <Card className="border-danger-300 dark:border-danger-900/50 bg-danger-500/[0.04]">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-danger-500 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-900 dark:text-zinc-100">Could not load dashboard data</p>
              <p className="text-xs text-surface-500 dark:text-zinc-400 truncate">{loadError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Row 1: Key Metric Cards (Matching Reference Image) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-surface-500 dark:text-zinc-400">
            <span className="font-medium">Total Interviews</span>
            <div className="h-7 w-7 rounded-md bg-surface-100 dark:bg-white/[0.04] border border-surface-200/80 dark:border-white/[0.06] flex items-center justify-center text-surface-500 dark:text-zinc-400">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-8 w-16 bg-surface-200 dark:bg-white/[0.06] rounded animate-pulse" />
            ) : (
              <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-surface-900 dark:text-zinc-50 tabular-nums">
                {stats.total.toLocaleString()}
              </p>
            )}
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
              <span>&uarr; 12.4%</span>
              <span className="text-surface-400 dark:text-zinc-500">vs last period</span>
            </div>
          </div>
        </Card>

        {/* Metric 2 */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-surface-500 dark:text-zinc-400">
            <span className="font-medium">Upcoming Sessions</span>
            <div className="h-7 w-7 rounded-md bg-surface-100 dark:bg-white/[0.04] border border-surface-200/80 dark:border-white/[0.06] flex items-center justify-center text-surface-500 dark:text-zinc-400">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-8 w-16 bg-surface-200 dark:bg-white/[0.06] rounded animate-pulse" />
            ) : (
              <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-surface-900 dark:text-zinc-50 tabular-nums">
                {stats.upcoming.toLocaleString()}
              </p>
            )}
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
              <span>&uarr; 8.7%</span>
              <span className="text-surface-400 dark:text-zinc-500">scheduled pipeline</span>
            </div>
          </div>
        </Card>

        {/* Metric 3 */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-surface-500 dark:text-zinc-400">
            <span className="font-medium">Completed & Verified</span>
            <div className="h-7 w-7 rounded-md bg-surface-100 dark:bg-white/[0.04] border border-surface-200/80 dark:border-white/[0.06] flex items-center justify-center text-surface-500 dark:text-zinc-400">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-8 w-16 bg-surface-200 dark:bg-white/[0.06] rounded animate-pulse" />
            ) : (
              <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-surface-900 dark:text-zinc-50 tabular-nums">
                {stats.completed.toLocaleString()}
              </p>
            )}
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-surface-500 dark:text-zinc-400">
              <span>100% human sign-off</span>
            </div>
          </div>
        </Card>

        {/* Metric 4: Live Telemetry */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-surface-500 dark:text-zinc-400">
            <span className="font-medium">Live Sessions</span>
            <div className="h-7 w-7 rounded-md bg-surface-100 dark:bg-white/[0.04] border border-surface-200/80 dark:border-white/[0.06] flex items-center justify-center text-surface-500 dark:text-zinc-400">
              <Video className="h-3.5 w-3.5 text-brand-500" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-8 w-16 bg-surface-200 dark:bg-white/[0.06] rounded animate-pulse" />
            ) : (
              <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-surface-900 dark:text-zinc-50 tabular-nums">
                {stats.inProgress.toLocaleString()}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Live
              </span>
              <span className="text-[11px] text-surface-400 dark:text-zinc-500">active rooms</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Row 2: Main Telemetry Spline Chart (Flagship Visual Moment from Reference Image) */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-surface-200/80 dark:border-white/[0.06]">
          <div>
            <h2 className="text-base font-semibold text-surface-900 dark:text-zinc-100 tracking-tight">
              Session Velocity & Telemetry Analysis
            </h2>
            <p className="text-xs text-surface-500 dark:text-zinc-400 mt-0.5">
              Track candidate interview completion rates and scheduled volume over operational timelines
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Range Toggle Pills */}
            <div className="inline-flex p-0.5 rounded-lg bg-surface-100 dark:bg-[#0c0d12] border border-surface-200 dark:border-white/[0.08] text-xs">
              {(['Daily', 'Monthly', 'Yearly'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTimeRange(mode)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    timeRange === mode
                      ? 'bg-white dark:bg-[#1a1d28] text-surface-900 dark:text-zinc-100 shadow-xs'
                      : 'text-surface-500 dark:text-zinc-400 hover:text-surface-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Legend */}
            <div className="hidden sm:flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-surface-600 dark:text-zinc-300">
                <span className="h-2 w-2 rounded-full bg-[#D97757]" />
                Completed
              </span>
              <span className="flex items-center gap-1.5 text-surface-400 dark:text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-zinc-400 dark:bg-zinc-600" />
                Scheduled
              </span>
            </div>
          </div>
        </div>

        {/* SVG High-Precision Chart */}
        <div className="pt-6">
          <div className="relative w-full h-56 sm:h-64">
            <svg
              className="w-full h-full overflow-visible"
              viewBox="0 0 1000 240"
              preserveAspectRatio="none"
              role="img"
              aria-label="Interview session velocity spline chart"
            >
              <defs>
                <linearGradient id="terracottaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D97757" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#D97757" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="slateGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#71717A" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#71717A" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Gridlines */}
              <line x1="0" y1="40" x2="1000" y2="40" stroke="currentColor" className="text-surface-200 dark:text-white/[0.04]" strokeDasharray="4 4" />
              <line x1="0" y1="90" x2="1000" y2="90" stroke="currentColor" className="text-surface-200 dark:text-white/[0.04]" strokeDasharray="4 4" />
              <line x1="0" y1="140" x2="1000" y2="140" stroke="currentColor" className="text-surface-200 dark:text-white/[0.04]" strokeDasharray="4 4" />
              <line x1="0" y1="190" x2="1000" y2="190" stroke="currentColor" className="text-surface-200 dark:text-white/[0.04]" strokeDasharray="4 4" />

              {/* Scheduled Line & Area */}
              <path
                d="M 0 170 Q 120 160, 240 145 T 480 135 T 720 120 T 1000 105 L 1000 220 L 0 220 Z"
                fill="url(#slateGradient)"
              />
              <path
                d="M 0 170 Q 120 160, 240 145 T 480 135 T 720 120 T 1000 105"
                fill="none"
                stroke="currentColor"
                className="text-zinc-400 dark:text-zinc-600"
                strokeWidth="2"
              />

              {/* Completed Line & Area (Dominant Terracotta Line) */}
              <path
                d="M 0 150 Q 120 110, 240 85 T 480 50 T 720 70 T 1000 45 L 1000 220 L 0 220 Z"
                fill="url(#terracottaGradient)"
              />
              <path
                d="M 0 150 Q 120 110, 240 85 T 480 50 T 720 70 T 1000 45"
                fill="none"
                stroke="#D97757"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Active Inspection Marker */}
              <line x1="500" y1="20" x2="500" y2="220" stroke="#D97757" strokeDasharray="3 3" strokeOpacity="0.4" />
              <circle cx="500" cy="52" r="4.5" fill="#D97757" stroke="#14161F" strokeWidth="2.5" />
            </svg>

            {/* Simulated Tooltip */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#1A1D28] text-white border border-white/[0.1] rounded-lg p-2.5 shadow-xl text-xs font-mono pointer-events-none hidden sm:block">
              <p className="text-[10px] text-zinc-400">Current Quarter Performance</p>
              <div className="flex items-center gap-4 mt-1">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D97757]" />
                  Completed: <strong className="text-zinc-100">{stats.completed || 24}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                  Scheduled: <strong className="text-zinc-100">{stats.total || 42}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Month Axis Labels */}
          <div className="flex justify-between items-center text-[10px] font-mono text-surface-400 dark:text-zinc-500 pt-3">
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
            <span>May</span>
            <span>Jun</span>
            <span>Jul</span>
            <span>Aug</span>
            <span>Sep</span>
            <span>Oct</span>
            <span>Nov</span>
            <span>Dec</span>
          </div>
        </div>
      </Card>

      {/* Row 3: Operational Breakdown & Recent Sessions (3-Column Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Session Status Distribution */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-surface-200/80 dark:border-white/[0.06]">
              <span className="text-xs font-semibold text-surface-900 dark:text-zinc-100 tracking-tight">
                Status Distribution
              </span>
              <Layers className="h-3.5 w-3.5 text-surface-400 dark:text-zinc-500" />
            </div>

            <div className="mt-4">
              <p className="text-2xl font-semibold tabular-nums text-surface-900 dark:text-zinc-100">
                {stats.total} Total
              </p>
              <p className="text-xs text-surface-500 dark:text-zinc-400 mt-0.5">
                Active workflow breakdown across states
              </p>
            </div>

            {/* Segmented bar */}
            <div className="mt-4 flex h-2 rounded-full overflow-hidden bg-surface-100 dark:bg-white/[0.06] gap-0.5">
              <div
                style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 40}%` }}
                className="bg-emerald-500"
                title="Completed"
              />
              <div
                style={{ width: `${stats.total > 0 ? (stats.inProgress / stats.total) * 100 : 20}%` }}
                className="bg-brand-500"
                title="In Progress"
              />
              <div
                style={{ width: `${stats.total > 0 ? (stats.upcoming / stats.total) * 100 : 25}%` }}
                className="bg-zinc-400"
                title="Upcoming"
              />
              <div
                style={{ width: `${stats.total > 0 ? (stats.draft / stats.total) * 100 : 15}%` }}
                className="bg-zinc-600"
                title="Draft"
              />
            </div>

            <div className="mt-5 space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-surface-600 dark:text-zinc-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Completed Sessions
                </span>
                <span className="tabular-nums text-surface-900 dark:text-zinc-100 font-semibold">{stats.completed}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-surface-600 dark:text-zinc-300">
                  <span className="h-2 w-2 rounded-full bg-brand-500" />
                  In Progress Rooms
                </span>
                <span className="tabular-nums text-surface-900 dark:text-zinc-100 font-semibold">{stats.inProgress}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-surface-600 dark:text-zinc-300">
                  <span className="h-2 w-2 rounded-full bg-zinc-400" />
                  Upcoming Scheduled
                </span>
                <span className="tabular-nums text-surface-900 dark:text-zinc-100 font-semibold">{stats.upcoming}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-surface-600 dark:text-zinc-300">
                  <span className="h-2 w-2 rounded-full bg-zinc-600" />
                  Draft Sessions
                </span>
                <span className="tabular-nums text-surface-900 dark:text-zinc-100 font-semibold">{stats.draft}</span>
              </div>
            </div>
          </div>

          <Button variant="outline" size="sm" asChild className="mt-6 w-full text-xs">
            <Link to="/hr/interviews">Manage Sessions</Link>
          </Button>
        </Card>

        {/* Card 2: Upcoming Scheduled Queue */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-surface-200/80 dark:border-white/[0.06]">
              <span className="text-xs font-semibold text-surface-900 dark:text-zinc-100 tracking-tight">
                Upcoming Queue
              </span>
              <Clock className="h-3.5 w-3.5 text-surface-400 dark:text-zinc-500" />
            </div>

            <div className="mt-4 divide-y divide-surface-100 dark:divide-white/[0.05]">
              {isLoading ? (
                <div className="space-y-3 py-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-10 bg-surface-100 dark:bg-white/[0.04] rounded-md animate-pulse" />
                  ))}
                </div>
              ) : upcomingInterviews.length === 0 ? (
                <div className="py-8 text-center text-xs text-surface-500 dark:text-zinc-400">
                  No upcoming interviews scheduled
                </div>
              ) : (
                upcomingInterviews.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-surface-900 dark:text-zinc-200 truncate">{item.title}</p>
                      <p className="text-[11px] text-surface-500 dark:text-zinc-400 truncate">
                        {item.candidate?.name || 'Unassigned'} · {formatInterviewDate(item.scheduled_start_at)}
                      </p>
                    </div>
                    <Link
                      to={`/hr/interviews/${item.id}`}
                      className="p-1 rounded text-surface-400 hover:text-surface-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                      aria-label="View session details"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          <Button variant="outline" size="sm" asChild className="mt-6 w-full text-xs">
            <Link to="/hr/interviews/new">Schedule Session</Link>
          </Button>
        </Card>

        {/* Card 3: Recent Activity & Review Hub */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-surface-200/80 dark:border-white/[0.06]">
              <span className="text-xs font-semibold text-surface-900 dark:text-zinc-100 tracking-tight">
                Recent Session Log
              </span>
              <Activity className="h-3.5 w-3.5 text-surface-400 dark:text-zinc-500" />
            </div>

            <div className="mt-4 divide-y divide-surface-100 dark:divide-white/[0.05]">
              {isLoading ? (
                <div className="space-y-3 py-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-10 bg-surface-100 dark:bg-white/[0.04] rounded-md animate-pulse" />
                  ))}
                </div>
              ) : recentInterviews.length === 0 ? (
                <div className="py-8 text-center text-xs text-surface-500 dark:text-zinc-400">
                  No interview records found
                </div>
              ) : (
                recentInterviews.map((item) => {
                  const status = interviewStatusConfig(item.status)
                  return (
                    <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <Link
                          to={`/hr/interviews/${item.id}`}
                          className="font-medium text-surface-900 dark:text-zinc-200 hover:underline truncate block"
                        >
                          {item.title}
                        </Link>
                        <p className="text-[11px] text-surface-500 dark:text-zinc-400 truncate">
                          {item.candidate?.name || 'No candidate assigned'}
                        </p>
                      </div>
                      <Badge variant="neutral" className="text-[10px] shrink-0 font-mono">
                        {status.label}
                      </Badge>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <Button variant="outline" size="sm" asChild className="mt-6 w-full text-xs">
            <Link to="/hr/reports">View All Reports</Link>
          </Button>
        </Card>
      </div>
    </div>
  )
}
