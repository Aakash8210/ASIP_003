import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, Clock, Eye, FileText, Shield, User, Video } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { apiClient, ApiError, AssignedInterview, InterviewReport } from '@/lib/api'
import { interviewStatusConfig, formatInterviewDate } from '@/pages/hr/interviewStatus'
import { InterviewReportView } from '@/components/reports/InterviewReportView'

export function InterviewerInterviewDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [interview, setInterview] = useState<AssignedInterview | null>(null)
  const [report, setReport] = useState<InterviewReport | null>(null)
  const [reportUnavailable, setReportUnavailable] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await apiClient.getAssignedInterview(id)
      setInterview(response.interview)
      try {
        const reportResponse = await apiClient.getAssignedInterviewReport(id)
        setReport(reportResponse.report)
        setReportUnavailable(false)
      } catch (reportError) {
        if (reportError instanceof ApiError && reportError.statusCode === 404) {
          setReportUnavailable(true)
          setReport(null)
        }
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setLoadError(
          error.statusCode === 403
            ? 'You are not authorized to open this interview'
            : error.statusCode === 404
              ? 'Interview not found'
              : error.message
        )
      } else {
        setLoadError('Failed to load the interview')
      }
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl" aria-busy="true">
        <div className="h-8 w-64 bg-surface-200 dark:bg-surface-800 rounded-lg animate-pulse" />
        <div className="h-64 bg-surface-200 dark:bg-surface-800 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (loadError || !interview) {
    return (
      <div className="max-w-3xl">
        <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 mb-4">
          <Link to="/interviewer/interviews">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to my interviews
          </Link>
        </Button>
        <Card className="border-surface-200 dark:border-surface-800">
          <CardContent className="py-12 text-center">
            <Shield className="h-8 w-8 text-surface-400 mx-auto mb-3" aria-hidden="true" />
            <p className="text-surface-900 dark:text-surface-50 font-medium">{loadError ?? 'Interview not found'}</p>
            <p className="text-surface-500 dark:text-surface-400 text-sm mt-1">
              This interview could not be loaded. It may not exist, or you may not be assigned to it.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const status = interviewStatusConfig(interview.status)
  const StatusIcon = status.icon

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 mb-2">
          <Link to="/interviewer/interviews">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to my interviews
          </Link>
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50 truncate">{interview.title}</h1>
            <Badge variant="neutral" className={status.className}>
              <StatusIcon className="h-3 w-3" aria-hidden="true" />
              {status.label}
            </Badge>
          </div>
        </div>
        <p className="text-surface-600 dark:text-surface-400 mt-1">
          You are assigned as the interviewer for this session.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-surface-200 dark:border-surface-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-brand-600" aria-hidden="true" />
              Candidate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium text-surface-900 dark:text-surface-50">
              {interview.candidate?.name ?? 'Candidate'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-surface-200 dark:border-surface-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-brand-600" aria-hidden="true" />
              Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-surface-600 dark:text-surface-400">
              <span className="font-medium text-surface-900 dark:text-surface-50">Scheduled start:</span>{' '}
              {formatInterviewDate(interview.scheduled_start_at)}
            </p>
            {interview.started_at && (
              <p className="text-surface-600 dark:text-surface-400">
                <span className="font-medium text-surface-900 dark:text-surface-50">Started:</span>{' '}
                {formatInterviewDate(interview.started_at)}
              </p>
            )}
            {interview.ended_at && (
              <p className="text-surface-600 dark:text-surface-400">
                <span className="font-medium text-surface-900 dark:text-surface-50">Ended:</span>{' '}
                {formatInterviewDate(interview.ended_at)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-surface-200 dark:border-surface-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Video className="h-5 w-5 text-brand-600" aria-hidden="true" />
            Interview Session
          </CardTitle>
          <CardDescription>Session entry for the assigned interview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 rounded-lg bg-surface-50 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700 p-4">
            <Clock className="h-5 w-5 text-surface-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-medium text-surface-900 dark:text-surface-50">
                {interview.status === 'in_progress'
                  ? 'This interview is currently active in the interview room.'
                  : interview.status === 'completed'
                    ? 'This interview has been completed.'
                    : 'The interview room is available for your assigned session.'}
              </p>
              <p className="text-surface-500 dark:text-surface-400 mt-1">
                {interview.status === 'completed'
                  ? 'The interview session is concluded. Review the post-interview report below when available.'
                  : 'You can enter the room to conduct the interview session with the candidate.'}
              </p>
            </div>
          </div>
          {interview.status !== 'completed' && (
            <div className="mt-4">
              <Button asChild>
                <Link to={`/interviewer/interviews/${interview.id}/room`}>
                  Enter Interview Room
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-surface-200 dark:border-surface-800">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-600" aria-hidden="true" />
            Report
          </CardTitle>
          <CardDescription>Post-interview report for this session</CardDescription>
        </CardHeader>
        <CardContent>
          {report ? (
            <div className="space-y-3 text-sm">
              <p className="text-surface-600 dark:text-surface-400 whitespace-pre-wrap">
                {report.summary ?? 'Report available'}
              </p>
              {report.generated_at && (
                <p className="text-xs text-surface-400 dark:text-surface-500">
                  Generated {formatInterviewDate(report.generated_at)}
                </p>
              )}
              <div className="pt-2">
                <Button size="sm" onClick={() => setShowReportModal(true)} className="gap-2">
                  <Eye className="h-4 w-4" />
                  View Full Report & Integrity Indicators
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-surface-500 dark:text-surface-400">
                {reportUnavailable || interview.status !== 'completed'
                  ? 'The report will be available after the interview is completed and reviewed.'
                  : 'No report is available for this interview yet.'}
              </p>
              {interview.status === 'completed' && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isGeneratingReport}
                  onClick={async () => {
                    setIsGeneratingReport(true)
                    try {
                      const res = await apiClient.generateInterviewReport(interview.id)
                      setReport(res.report)
                      setShowReportModal(true)
                    } catch (err) {
                      // fallback to standard get
                      try {
                        const res2 = await apiClient.getInterviewReport(interview.id)
                        setReport(res2.report)
                        setShowReportModal(true)
                      } catch (e) {
                        setLoadError(e instanceof ApiError ? e.message : 'Failed to generate report')
                      }
                    } finally {
                      setIsGeneratingReport(false)
                    }
                  }}
                >
                  Generate & View Report
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={showReportModal && Boolean(report)}
        onClose={() => setShowReportModal(false)}
        title={report?.session_metadata?.title ? `Report: ${report.session_metadata.title}` : 'Post-Interview Integrity Report'}
        size="xl"
      >
        {report && (
          <div className="max-h-[82vh] overflow-y-auto pr-1">
            <InterviewReportView
              report={report}
              onReportUpdated={(updated) => setReport(updated)}
              onClose={() => setShowReportModal(false)}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
