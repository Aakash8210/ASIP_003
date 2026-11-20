import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  FileText,
  Search,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
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
      header: 'Interview & Candidate',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
            <FileText className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <p className="font-medium text-surface-900 dark:text-surface-50">
              {row.session_metadata?.title || 'Interview Session'}
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400">
              Candidate: {row.session_metadata?.candidate?.name || 'Unassigned'}
              {row.session_metadata?.interviewer?.name ? ` · Interviewer: ${row.session_metadata.interviewer.name}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'review_status',
      header: 'Review Status',
      render: (row) => {
        switch (row.review_status) {
          case 'REVIEWED':
            return (
              <Badge variant="success" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                Reviewed
              </Badge>
            )
          case 'FLAGGED_FOR_FOLLOWUP':
            return (
              <Badge variant="danger" className="gap-1">
                <ShieldAlert className="h-3 w-3" />
                Follow-up
              </Badge>
            )
          case 'PENDING_REVIEW':
          default:
            return (
              <Badge variant="neutral" className="gap-1 text-surface-600 dark:text-surface-300">
                <Clock className="h-3 w-3" />
                Pending Review
              </Badge>
            )
        }
      },
    },
    {
      key: 'indicators',
      header: 'Integrity Indicators',
      render: (row) => (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-surface-500">Visual:</span>
            <span className="font-medium text-surface-900 dark:text-surface-50">
              {row.integrity_indicators?.visual_consistency?.label || 'Normal'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-surface-500">Stream:</span>
            <span className="font-medium text-surface-900 dark:text-surface-50">
              {row.integrity_indicators?.stream_reliability?.label || 'Stable'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'observations',
      header: 'Events / Evidence',
      render: (row) => (
        <div className="text-xs text-surface-600 dark:text-surface-300 space-y-0.5">
          <p>{row.events?.length ?? 0} timeline event(s)</p>
          <p className="text-surface-400">{row.evidence_summary?.total_evidence ?? 0} linked evidence</p>
        </div>
      ),
    },
    {
      key: 'generated_at',
      header: 'Concluded / Generated',
      render: (row) => (
        <div className="text-xs text-surface-500 dark:text-surface-400">
          <p>{row.generated_at ? formatInterviewDate(row.generated_at) : '—'}</p>
          {row.session_metadata?.duration_seconds ? (
            <p>{Math.round(row.session_metadata.duration_seconds / 60)} min duration</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="neutral"
            onClick={() => setSelectedReport(row)}
            className="gap-1.5"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Open Report</span>
          </Button>
        </div>
      ),
    },
  ]

  const templates = [
    {
      id: 'TPL-001',
      name: 'Standard Technical Interview Report',
      description: 'Standard post-interview audit summary including timeline observations, video stream stability, and secondary presence indicators.',
      type: 'Technical',
      frequency: 'Per-interview',
    },
    {
      id: 'TPL-002',
      name: 'Behavioral & Integrity Summary',
      description: 'Focused summary analyzing participant continuity, focus transitions, and human reviewer notes.',
      type: 'Behavioral',
      frequency: 'Per-interview',
    },
    {
      id: 'TPL-003',
      name: 'Executive & Senior Role Review',
      description: 'Audit report format featuring comprehensive multi-reviewer sign-off workflows and annotated evidence inspection.',
      type: 'Executive',
      frequency: 'Per-interview',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">Post-Interview Reports</h1>
          <p className="text-surface-600 dark:text-surface-400 mt-1">
            Audit-ready post-session integrity records, observable event timelines, and human review sign-offs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="neutral" size="sm" onClick={loadReports} disabled={isLoading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {loadError && (
        <Card className="border-danger-300 dark:border-danger-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-danger-600 dark:text-danger-400" />
              <p className="text-sm text-danger-700 dark:text-danger-300">{loadError}</p>
            </div>
            <Button variant="neutral" size="sm" onClick={loadReports}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'reports' | 'templates')} className="space-y-4">
        <TabsList className="w-auto">
          <TabsTrigger value="reports">Generated Reports ({reports.length})</TabsTrigger>
          <TabsTrigger value="templates">Report Templates ({templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card className="border-surface-200 dark:border-surface-800">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-surface-500">Total Reports</p>
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-50 mt-1">{stats.total}</p>
              </CardContent>
            </Card>
            <Card className="border-surface-200 dark:border-surface-800">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-surface-500">Pending Review</p>
                <p className="text-2xl font-bold text-surface-600 dark:text-surface-300 mt-1">{stats.pending}</p>
              </CardContent>
            </Card>
            <Card className="border-surface-200 dark:border-surface-800">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-surface-500">Reviewed</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.reviewed}</p>
              </CardContent>
            </Card>
            <Card className="border-surface-200 dark:border-surface-800">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-surface-500">Follow-Up Required</p>
                <p className="text-2xl font-bold text-danger-600 dark:text-danger-400 mt-1">{stats.flagged}</p>
              </CardContent>
            </Card>
            <Card className="border-surface-200 dark:border-surface-800">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-surface-500">Stable Streams</p>
                <p className="text-2xl font-bold text-brand-600 dark:text-brand-400 mt-1">{stats.stableStreams}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-surface-200 dark:border-surface-800">
            <CardContent className="p-4 sm:p-5">
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
                    className="input w-48 text-sm"
                  >
                    <option value="all">All Review Statuses</option>
                    <option value="PENDING_REVIEW">Pending Review</option>
                    <option value="REVIEWED">Reviewed</option>
                    <option value="FLAGGED_FOR_FOLLOWUP">Follow-up Required</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-surface-200 dark:border-surface-800">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 bg-surface-100 dark:bg-surface-800 rounded animate-pulse" />
                  ))}
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <FileText className="h-10 w-10 text-surface-400 mx-auto mb-3" aria-hidden="true" />
                  <p className="text-base font-medium text-surface-900 dark:text-surface-50">No reports found</p>
                  <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                    {reports.length === 0
                      ? 'No interview reports have been compiled yet. Complete an interview to generate reports.'
                      : 'No reports matched your search filters.'}
                  </p>
                </div>
              ) : (
                <DataTable
                  columns={reportColumns}
                  data={filteredReports}
                  striped
                  hoverable
                  emptyMessage="No reports found matching your criteria"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => (
              <Card key={tpl.id} className="border-surface-200 dark:border-surface-800">
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{tpl.name}</span>
                    <Badge variant="neutral">{tpl.type}</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">Standard template format</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-surface-600 dark:text-surface-400">{tpl.description}</p>
                </CardContent>
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
