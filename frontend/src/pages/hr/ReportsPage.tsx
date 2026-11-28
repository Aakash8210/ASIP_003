import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  FileText,
  Search,
  Eye,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, TableColumn } from '@/components/ui/Table'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { apiClient, ApiError, InterviewReport } from '@/lib/api'
import { formatInterviewDate } from '@/pages/hr/interviewStatus'
import { InterviewReportView } from '@/components/reports/InterviewReportView'

export function HRReportsPage() {
  const [reports, setReports] = useState<InterviewReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedReport, setSelectedReport] = useState<InterviewReport | null>(null)
  const [activeTab, setActiveTab] = useState<'reports' | 'templates'>('reports')

  const loadReports = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await apiClient.listReports({ limit: 100 })
      setReports(res.reports || [])
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load post-interview reports')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const filteredReports = useMemo(() => {
    let result = [...reports]

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(
        (r) =>
          r.session_metadata?.title?.toLowerCase().includes(query) ||
          r.session_metadata?.candidate?.name?.toLowerCase().includes(query) ||
          r.session_metadata?.candidate?.email?.toLowerCase().includes(query) ||
          r.session_metadata?.interviewer?.name?.toLowerCase().includes(query) ||
          r.interview_id?.toLowerCase().includes(query)
      )
    }

    if (statusFilter !== 'all') {
      result = result.filter((r) => r.review_status === statusFilter)
    }

    return result
  }, [reports, searchQuery, statusFilter])

  const stats = useMemo(() => {
    const total = reports.length
    const reviewed = reports.filter((r) => r.review_status === 'REVIEWED').length
    const pending = reports.filter((r) => r.review_status === 'PENDING_REVIEW' || !r.review_status).length
    const flagged = reports.filter((r) => r.review_status === 'FLAGGED_FOR_FOLLOWUP').length
    const stableStreams = reports.filter(
      (r) => r.integrity_indicators?.stream_reliability?.status === 'PASS'
    ).length

    return { total, reviewed, pending, flagged, stableStreams }
  }, [reports])

  const handleReviewUpdated = (updated: InterviewReport) => {
    setSelectedReport(updated)
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }

  const reportColumns: TableColumn<InterviewReport>[] = [
    {
      key: 'title',
      header: 'Interview session',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-md bg-[#2D211C] border border-brand-500/25 flex items-center justify-center shrink-0">
            <FileText className="h-3.5 w-3.5 text-brand-500" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-surface-900 dark:text-zinc-100 truncate">
              {row.session_metadata?.title || 'Interview Session'}
            </p>
            <p className="text-[11px] text-surface-500 dark:text-zinc-400 font-mono truncate">
              Candidate: {row.session_metadata?.candidate?.name || 'Unassigned'}
              {row.session_metadata?.interviewer?.name ? ` · Reviewer: ${row.session_metadata.interviewer.name}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'review_status',
      header: 'Human review status',
      render: (row) => {
        switch (row.review_status) {
          case 'REVIEWED':
            return (
              <Badge variant="success" dot className="text-[10px]">
                Reviewed
              </Badge>
            )
          case 'FLAGGED_FOR_FOLLOWUP':
            return (
              <Badge variant="danger" dot className="text-[10px]">
                Follow-up required
              </Badge>
            )
          case 'PENDING_REVIEW':
          default:
            return (
              <Badge variant="neutral" dot className="text-[10px]">
                Pending review
              </Badge>
            )
        }
      },
    },
    {
      key: 'indicators',
      header: 'Integrity indicators',
      render: (row) => (
        <div className="text-xs font-mono space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-surface-400 dark:text-zinc-500 text-[11px]">Continuity:</span>
            <span className="font-medium text-surface-900 dark:text-zinc-200">
              {row.integrity_indicators?.visual_consistency?.label || 'Normal'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-surface-400 dark:text-zinc-500 text-[11px]">Stream:</span>
            <span className="font-medium text-surface-900 dark:text-zinc-200">
              {row.integrity_indicators?.stream_reliability?.label || 'Stable'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'observations',
      header: 'Observable evidence',
      render: (row) => (
        <div className="text-xs font-mono text-surface-600 dark:text-zinc-300 space-y-0.5">
          <p>{row.events?.length ?? 0} timestamped events</p>
          <p className="text-[11px] text-surface-400 dark:text-zinc-500">{row.evidence_summary?.total_evidence ?? 0} linked frames</p>
        </div>
      ),
    },
    {
      key: 'generated_at',
      header: 'Concluded date',
      render: (row) => (
        <div className="text-xs font-mono text-surface-500 dark:text-zinc-400 tabular-nums">
          <p>{row.generated_at ? formatInterviewDate(row.generated_at) : '—'}</p>
          {row.session_metadata?.duration_seconds ? (
            <p className="text-[11px] text-surface-400 dark:text-zinc-500">{Math.round(row.session_metadata.duration_seconds / 60)} min duration</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Audit view',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedReport(row)}
            className="gap-1.5 text-xs py-1"
          >
            <Eye className="h-3.5 w-3.5 text-brand-500" />
            <span>Open Report</span>
          </Button>
        </div>
      ),
    },
  ]

  const templates = [
    {
      id: 'TPL-001',
      name: 'Standard Technical Assessment Report',
      description: 'Audit-ready post-interview summary capturing chronological event timelines, stream stability telemetry, and human review sign-offs.',
      type: 'Technical',
    },
    {
      id: 'TPL-002',
      name: 'Behavioral Signal Telemetry Summary',
      description: 'Analyzes face presence consistency, camera continuity, and human reviewer notes without speculative fraud scoring.',
      type: 'Behavioral',
    },
    {
      id: 'TPL-003',
      name: 'Executive & Senior Role Review',
      description: 'Comprehensive multi-stakeholder sign-off workflow with linked observation context inspection.',
      type: 'Executive',
    },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-surface-900 dark:text-zinc-100">
            Post-Interview Reports
          </h1>
          <p className="text-xs sm:text-sm text-surface-500 dark:text-zinc-400 mt-0.5">
            Audit-ready integrity records, factual telemetry timelines, and human review sign-offs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadReports} disabled={isLoading} className="gap-2 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {loadError && (
        <Card className="border-danger-300 dark:border-danger-900/50 bg-danger-500/[0.04]">
          <CardContent className="p-4 flex items-center justify-between">
            <p className="text-xs text-danger-600 dark:text-danger-400">{loadError}</p>
            <Button variant="outline" size="sm" onClick={loadReports}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-surface-500 dark:text-zinc-400">Total Reports</p>
          <p className="text-2xl font-semibold tracking-tight text-surface-900 dark:text-zinc-100 mt-1 tabular-nums">{stats.total}</p>
          <span className="text-[11px] font-mono text-surface-400 dark:text-zinc-500">all sessions</span>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-surface-500 dark:text-zinc-400">Reviewed</p>
          <p className="text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">{stats.reviewed}</p>
          <span className="text-[11px] font-mono text-emerald-600/70 dark:text-emerald-400/70">human signed-off</span>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-surface-500 dark:text-zinc-400">Pending Review</p>
          <p className="text-2xl font-semibold tracking-tight text-amber-600 dark:text-amber-400 mt-1 tabular-nums">{stats.pending}</p>
          <span className="text-[11px] font-mono text-amber-600/70 dark:text-amber-400/70">awaiting review</span>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-surface-500 dark:text-zinc-400">Follow-Up Required</p>
          <p className="text-2xl font-semibold tracking-tight text-rose-600 dark:text-rose-400 mt-1 tabular-nums">{stats.flagged}</p>
          <span className="text-[11px] font-mono text-rose-600/70 dark:text-rose-400/70">reviewer flagged</span>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'reports' | 'templates')} variant="pills" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reports">Generated Reports ({reports.length})</TabsTrigger>
          <TabsTrigger value="templates">Report Templates ({templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" aria-hidden="true" />
                <Input
                  placeholder="Search by candidate, interviewer, or interview title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input w-48 text-xs font-mono"
                  aria-label="Filter by review status"
                >
                  <option value="all">All review statuses</option>
                  <option value="PENDING_REVIEW">Pending review</option>
                  <option value="REVIEWED">Reviewed</option>
                  <option value="FLAGGED_FOR_FOLLOWUP">Follow-up required</option>
                </select>
              </div>
            </div>
          </Card>

          <div className="table-container">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 bg-surface-100 dark:bg-white/[0.04] rounded-lg animate-pulse" />
                ))}
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="py-16 px-4 text-center">
                <div className="h-10 w-10 rounded-xl bg-surface-100 dark:bg-[#1a1d28] border border-surface-200 dark:border-white/[0.06] flex items-center justify-center mx-auto mb-3 text-surface-400 dark:text-zinc-500">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium text-surface-900 dark:text-zinc-200">No reports found</p>
                <p className="text-xs text-surface-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                  {reports.length === 0
                    ? 'Completed interviews automatically compile into structured integrity reports.'
                    : 'No reports matched your search filters.'}
                </p>
              </div>
            ) : (
              <DataTable
                columns={reportColumns}
                data={filteredReports}
                hoverable
                emptyMessage="No reports found matching your criteria"
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => (
              <Card key={tpl.id} className="p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-surface-200/80 dark:border-white/[0.06]">
                    <span className="text-xs font-semibold text-surface-900 dark:text-zinc-100">{tpl.name}</span>
                    <Badge variant="neutral" className="text-[10px]">{tpl.type}</Badge>
                  </div>
                  <p className="text-xs text-surface-600 dark:text-zinc-400 mt-3 leading-relaxed">
                    {tpl.description}
                  </p>
                </div>
                <div className="pt-4 mt-4 border-t border-surface-200/80 dark:border-white/[0.06] flex items-center justify-between text-xs text-surface-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5 font-mono text-[11px]">
                    <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
                    Standard Format
                  </span>
                  <span className="text-brand-500 font-medium hover:underline cursor-pointer flex items-center gap-1">
                    Preview <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Report Modal */}
      <Modal
        isOpen={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
        title={selectedReport?.session_metadata?.title ? `Report: ${selectedReport.session_metadata.title}` : 'Post-Interview Integrity Report'}
        size="xl"
      >
        {selectedReport && (
          <div className="max-h-[82vh] overflow-y-auto pr-1">
            <InterviewReportView
              report={selectedReport}
              onReportUpdated={handleReviewUpdated}
              onClose={() => setSelectedReport(null)}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
