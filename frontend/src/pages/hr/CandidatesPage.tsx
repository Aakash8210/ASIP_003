import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Calendar, AlertCircle, Users, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { apiClient, ApiError, CandidateProfileSummary } from '@/lib/api'

export function HRCandidatesPage() {
  const navigate = useNavigate()

  const [candidates, setCandidates] = useState<CandidateProfileSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    apiClient
      .listCandidates()
      .then((response) => {
        if (!cancelled) setCandidates(response.candidates)
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof ApiError ? error.message : 'Failed to load candidates')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredCandidates = useMemo(() => {
    if (!searchQuery) return candidates
    const query = searchQuery.toLowerCase()
    return candidates.filter(
      (c) =>
        (c.name ?? '').toLowerCase().includes(query) ||
        (c.email ?? '').toLowerCase().includes(query)
    )
  }, [candidates, searchQuery])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-surface-900 dark:text-zinc-100">
            Candidate Directory
          </h1>
          <p className="text-xs sm:text-sm text-surface-500 dark:text-zinc-400 mt-0.5">
            Registered candidate profiles ready for interview association and telemetry assignment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral" className="text-xs">
            {candidates.length} Profiles Registered
          </Badge>
        </div>
      </div>

      {loadError && (
        <Card className="border-danger-300 dark:border-danger-900/50 bg-danger-500/[0.04]">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-danger-500 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-900 dark:text-zinc-100">Could not load candidates</p>
              <p className="text-xs text-surface-500 dark:text-zinc-400 truncate">{loadError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search & Filter Bar */}
      <Card className="p-4">
        <div className="flex items-center gap-3 max-w-md">
          <Input
            placeholder="Search candidate by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
            aria-label="Search candidates"
          />
        </div>
      </Card>

      {/* Candidates Table */}
      <div className="table-container">
        {isLoading ? (
          <div className="p-6 space-y-3" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-surface-100 dark:bg-white/[0.04] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="h-10 w-10 rounded-xl bg-surface-100 dark:bg-[#1a1d28] border border-surface-200 dark:border-white/[0.06] flex items-center justify-center mx-auto mb-3 text-surface-400 dark:text-zinc-500">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-surface-900 dark:text-zinc-200">
              {candidates.length === 0 ? 'No registered candidates yet' : 'No candidates match your search'}
            </p>
            <p className="text-xs text-surface-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
              {candidates.length === 0
                ? 'Candidates appear automatically once they register with an interviewee account.'
                : 'Try adjusting your search query.'}
            </p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Candidate</th>
                <th scope="col">Email address</th>
                <th scope="col">Account status</th>
                <th scope="col">Registration date</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.map((candidate) => (
                <tr key={candidate.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={candidate.name} size="sm" />
                      <div className="min-w-0">
                        <p className="font-medium text-surface-900 dark:text-zinc-100 truncate">
                          {candidate.name ?? 'Candidate'}
                        </p>
                        <p className="text-[11px] font-mono text-surface-400 dark:text-zinc-500 truncate">
                          ID: {candidate.id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-surface-600 dark:text-zinc-400 font-mono text-xs">
                    {candidate.email ?? '—'}
                  </td>
                  <td>
                    <Badge
                      variant={candidate.status === 'active' ? 'success' : 'neutral'}
                      dot
                      className="text-[10px]"
                    >
                      {candidate.status ?? 'active'}
                    </Badge>
                  </td>
                  <td className="text-surface-600 dark:text-zinc-400 font-mono text-xs tabular-nums">
                    {candidate.created_at
                      ? new Date(candidate.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
                      : '—'}
                  </td>
                  <td className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() =>
                        navigate('/hr/interviews/new', { state: { candidateId: candidate.id } })
                      }
                    >
                      <Calendar className="h-3.5 w-3.5 text-brand-500" aria-hidden="true" />
                      <span>Schedule</span>
                      <ArrowUpRight className="h-3 w-3 opacity-60" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
