import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Calendar,
  Clock,
  Send,
  Plus,
  AlertCircle,
  Video,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { apiClient, ApiError, InterviewSession } from '@/lib/api'
import { interviewStatusConfig, formatInterviewDate } from './interviewStatus'

const STATUS_FILTERS = [
  { value: 'all', label: 'All Sessions' },
  { value: 'in_progress', label: 'Live' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'invited', label: 'Invited' },
  { value: 'completed', label: 'Completed' },
  { value: 'draft', label: 'Draft' },
]

export function HRInterviewsPage() {
  const [interviews, setInterviews] = useState<InterviewSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

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

  const filteredInterviews = useMemo(() => {
    let result = [...interviews]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(query) ||
          (i.candidate?.name ?? '').toLowerCase().includes(query) ||
          (i.candidate?.email ?? '').toLowerCase().includes(query)
      )
    }

    if (statusFilter !== 'all') {
      result = result.filter((i) => i.status === statusFilter)
    }

    return result
  }, [interviews, searchQuery, statusFilter])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-surface-900 dark:text-zinc-100">
            Interview Sessions
          </h1>
          <p className="text-xs sm:text-sm text-surface-500 dark:text-zinc-400 mt-0.5">
            Manage scheduled interviews, candidate invites, and live WebRTC monitoring sessions
          </p>
        </div>
        <Button size="sm" asChild className="gap-2">
          <Link to="/hr/interviews/new">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Create Interview</span>
          </Link>
        </Button>
      </div>

      {loadError && (
        <Card className="border-danger-300 dark:border-danger-900/50 bg-danger-500/[0.04]">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-danger-500 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-900 dark:text-zinc-100">Could not load interviews</p>
              <p className="text-xs text-surface-500 dark:text-zinc-400 truncate">{loadError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="max-w-md w-full">
            <Input
              placeholder="Search by title, candidate name, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              aria-label="Search interviews"
            />
          </div>

          {/* Status Filter Pills (Matching Reference Image) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors select-none ${
                  statusFilter === f.value
                    ? 'bg-[#2D211C] text-[#E09F80] border border-brand-500/25 shadow-xs font-semibold'
                    : 'text-surface-600 hover:text-surface-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-surface-100 dark:hover:bg-white/[0.03]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table Container */}
      <div className="table-container">
        {isLoading ? (
          <div className="p-6 space-y-3" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-surface-100 dark:bg-white/[0.04] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="h-10 w-10 rounded-xl bg-surface-100 dark:bg-[#1a1d28] border border-surface-200 dark:border-white/[0.06] flex items-center justify-center mx-auto mb-3 text-surface-400 dark:text-zinc-500">
              <Calendar className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-surface-900 dark:text-zinc-200">
              {interviews.length === 0 ? 'No interviews scheduled yet' : 'No sessions match your search criteria'}
            </p>
            <p className="text-xs text-surface-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
              {interviews.length === 0
                ? 'Create your first interview session to configure candidate invites and reviewers.'
                : 'Try adjusting your search terms or status filter.'}
            </p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Session title</th>
                <th scope="col">Candidate</th>
                <th scope="col">Scheduled window</th>
                <th scope="col">Status</th>
                <th scope="col">Invite telemetry</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInterviews.map((interview) => {
                const status = interviewStatusConfig(interview.status)
                const canInvite = interview.status === 'draft'
                const isLive = interview.status === 'in_progress'

                return (
                  <tr key={interview.id}>
                    <td>
                      <div>
                        <Link
                          to={`/hr/interviews/${interview.id}`}
                          className="font-medium text-surface-900 dark:text-zinc-100 hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
                        >
                          {interview.title}
                        </Link>
                        <p className="text-[11px] font-mono text-surface-400 dark:text-zinc-500 mt-0.5">
                          ID: {interview.id.slice(0, 8)}...
                        </p>
                      </div>
                    </td>
                    <td>
                      {interview.candidate ? (
                        <div className="flex items-center gap-2.5">
                          <Avatar name={interview.candidate.name} size="xs" />
                          <div className="min-w-0">
                            <p className="font-medium text-surface-900 dark:text-zinc-200 truncate">
                              {interview.candidate.name ?? 'Candidate'}
                            </p>
                            <p className="text-[11px] font-mono text-surface-400 dark:text-zinc-500 truncate">
                              {interview.candidate.email ?? ''}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-surface-400 dark:text-zinc-500 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="text-xs text-surface-600 dark:text-zinc-400 font-mono tabular-nums">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-surface-400 dark:text-zinc-500" />
                        <span>{formatInterviewDate(interview.scheduled_start_at)}</span>
                      </div>
                    </td>
                    <td>
                      <Badge
                        variant={
                          isLive
                            ? 'danger'
                            : interview.status === 'completed'
                              ? 'success'
                              : interview.status === 'scheduled' || interview.status === 'ready'
                                ? 'info'
                                : 'neutral'
                        }
                        dot
                        className="text-[10px]"
                      >
                        {status.label}
                      </Badge>
                    </td>
                    <td className="text-xs font-mono">
                      {interview.invite_reference ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <Send className="h-3 w-3" />
                          Dispatched
                        </span>
                      ) : (
                        <span className="text-surface-400 dark:text-zinc-500">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isLive && (
                          <Button variant="danger" size="sm" asChild className="gap-1.5 text-xs py-1">
                            <Link to={`/hr/interviews/${interview.id}/live`}>
                              <Video className="h-3 w-3" />
                              <span>Live Room</span>
                            </Link>
                          </Button>
                        )}
                        {canInvite && (
                          <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs py-1">
                            <Link to={`/hr/interviews/${interview.id}`}>
                              <Send className="h-3 w-3 text-brand-500" />
                              <span>Invite</span>
                            </Link>
                          </Button>
                        )}
                        <Button variant="outline" size="sm" asChild className="text-xs py-1">
                          <Link to={`/hr/interviews/${interview.id}`} className="gap-1">
                            <span>Details</span>
                            <ArrowRight className="h-3 w-3 opacity-60" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
