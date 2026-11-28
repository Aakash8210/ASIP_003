import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, AlertCircle, Eye, CheckCircle2, Clock, ShieldAlert, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { apiClient, ApiError, InterviewReport, AssignedInterview } from '@/lib/api'
import { formatInterviewDate } from '@/pages/hr/interviewStatus'
import { InterviewReportView } from '@/components/reports/InterviewReportView'

export function InterviewerReportsPage() {
  const [reports, setReports] = useState<InterviewReport[]>([])
  const [interviews, setInterviews] = useState<AssignedInterview[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeReport, setActiveReport] = useState<InterviewReport | null>(null)
  const [isOpeningReport, setIsOpeningReport] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [reportsRes, interviewsRes] = await Promise.all([
        apiClient.listReports({ limit: 50 }).catch(() => ({ reports: [] })),
        apiClient.listAssignedInterviews().catch(() => ({ interviews: [] })),
      ])
      setReports(reportsRes.reports || [])
      setInterviews(interviewsRes.interviews || [])
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Failed to load report data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const completedInterviews = useMemo(
    () => interviews.filter((i) => i.status === 'completed'),
    [interviews]
  )

  const openReportForInterview = async (interviewId: string) => {
    setIsOpeningReport(true)
    setActionError(null)
    try {
      const existing = reports.find((r) => r.interview_id === interviewId)
      if (existing) {
        setActiveReport(existing)
        return
      }
      const res = await apiClient.getInterviewReport(interviewId)
      setActiveReport(res.report)
      setReports((prev) => [res.report, ...prev.filter((r) => r.id !== res.report.id)])
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not open report')
    } finally {
      setIsOpeningReport(false)
    }
  }

  const handleReviewUpdated = (updated: InterviewReport) => {
    setActiveReport(updated)
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }

  const reviewStatusBadge = (status?: string) => {
    switch (status) {
      case 'REVIEWED':
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
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
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">Post-Interview Reports</h1>
          <p className="text-surface-600 dark:text-surface-400 mt-1">
            Objective integrity records, timeline observations, and reviewer sign-off for completed sessions
          </p>
        </div>
        <Button variant="neutral" size="sm" onClick={loadData} disabled={isLoading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loadError && (
        <Card className="border-danger-300 dark:border-danger-800">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-danger-600 dark:text-danger-400" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium text-surface-900 dark:text-surface-50">Could not load reports</p>
              <p className="text-sm text-surface-500 dark:text-surface-400">{loadError}</p>
            </div>
            <Button variant="neutral" size="sm" onClick={loadData}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {actionError && (
        <Card className="border-danger-300 dark:border-danger-800">
          <CardContent className="p-4 flex items-center justify-between">
            <p className="text-sm text-danger-600 dark:text-danger-400">{actionError}</p>
            <Button variant="ghost" size="sm" onClick={() => setActionError(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-surface-200 dark:border-surface-800">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-surface-500">Total Reports</p>
            <p className="text-2xl font-bold text-surface-900 dark:text-surface-50 mt-1">{reports.length}</p>
          </CardContent>
        </Card>
        <Card className="border-surface-200 dark:border-surface-800">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-surface-500">Completed Sessions</p>
            <p className="text-2xl font-bold text-brand-600 dark:text-brand-400 mt-1">{completedInterviews.length}</p>
          </CardContent>
        </Card>
        <Card className="border-surface-200 dark:border-surface-800">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-surface-500">Reviewed</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {reports.filter((r) => r.review_status === 'REVIEWED').length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-surface-200 dark:border-surface-800">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-surface-500">Needs Follow-Up</p>
            <p className="text-2xl font-bold text-danger-600 dark:text-danger-400 mt-1">
              {reports.filter((r) => r.review_status === 'FLAGGED_FOR_FOLLOWUP').length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-surface-200 dark:border-surface-800">
        <CardHeader>
          <CardTitle>Interview Reports</CardTitle>
          <CardDescription>
            Audit-ready post-interview summaries containing chronological timeline observations, interpretable indicators, and human review sign-offs
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 bg-surface-100 dark:bg-surface-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : reports.length === 0 && completedInterviews.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <FileText className="h-10 w-10 text-surface-400 mx-auto mb-3" aria-hidden="true" />
              <p className="text-base font-medium text-surface-900 dark:text-surface-50">No reports generated yet</p>
              <p className="text-sm text-surface-500 dark:text-surface-400 mt-1 max-w-md mx-auto">
                Reports are automatically compiled when assigned interviews conclude, or you can generate them upon completion.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-surface-100 dark:divide-surface-800">
              {reports.map((report) => (
                <div key={report.id || report._id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-50/50 dark:hover:bg-surface-800/40 transition-colors">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-surface-900 dark:text-surface-50 text-base">
                        {report.session_metadata?.title || 'Interview Session'}
                      </p>
                      {reviewStatusBadge(report.review_status)}
                    </div>
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                      <span>Candidate: {report.session_metadata?.candidate?.name || 'Assigned Candidate'}</span>
                      {report.session_metadata?.ended_at && (
                        <span> · Concluded {formatInterviewDate(report.session_metadata.ended_at)}</span>
                      )}
                      {report.session_metadata?.duration_seconds && (
                        <span> · Duration {Math.round(report.session_metadata.duration_seconds / 60)} min</span>
                      )}
                    </p>
                    {report.integrity_indicators && (
                      <div className="flex items-center gap-3 pt-1 text-xs text-surface-600 dark:text-surface-300">
                        <span>Consistency: <strong>{report.integrity_indicators.visual_consistency?.label || 'Normal'}</strong></span>
                        <span>Stream: <strong>{report.integrity_indicators.stream_reliability?.label || 'Stable'}</strong></span>
                        {report.integrity_indicators.multi_presence?.occurrences ? (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            {report.integrity_indicators.multi_presence.occurrences} secondary presence event(s)
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      onClick={() => setActiveReport(report)}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      View Full Report
                    </Button>
                    <Button
                      variant="neutral"
                      size="sm"
                      asChild
                    >
                      <Link to={`/interviewer/interviews/${report.interview_id}`}>
                        Session Details
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}

              {completedInterviews
                .filter((ci) => !reports.some((r) => r.interview_id === ci.id))
                .map((interview) => (
                  <div key={interview.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-50/40 dark:bg-surface-800/20">
                    <div className="space-y-1 min-w-0">
                      <p className="font-semibold text-surface-900 dark:text-surface-50">
                        {interview.title}
                      </p>
                      <p className="text-xs text-surface-500 dark:text-surface-400">
                        Candidate: {interview.candidate?.name || 'Candidate'} · Completed
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openReportForInterview(interview.id)}
                      disabled={isOpeningReport}
                      className="gap-2"
                    >
                      <FileText className="h-4 w-4 text-brand-600" />
                      Generate & View Report
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={Boolean(activeReport)}
        onClose={() => setActiveReport(null)}
        title={activeReport?.session_metadata?.title ? `Report: ${activeReport.session_metadata.title}` : 'Post-Interview Integrity Report'}
        size="xl"
      >
        {activeReport && (
          <div className="max-h-[82vh] overflow-y-auto pr-1">
            <InterviewReportView
              report={activeReport}
              onReportUpdated={handleReviewUpdated}
              onClose={() => setActiveReport(null)}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
