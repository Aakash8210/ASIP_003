import { useState } from 'react'
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Printer,
  Shield,
  User,
  AlertTriangle,
  Flag,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import {
  apiClient,
  EvidenceItem,
  InterviewReport,
  LiveMonitoringEventItem,
} from '@/lib/api'

interface InterviewReportViewProps {
  report: InterviewReport
  onReportUpdated?: (updated: InterviewReport) => void
  onClose?: () => void
}

export function InterviewReportView({ report, onReportUpdated, onClose }: InterviewReportViewProps) {
  const [reviewStatus, setReviewStatus] = useState<string>(report.review_status || 'PENDING_REVIEW')
  const [reviewNotes, setReviewNotes] = useState<string>(report.review_notes || '')
  const [isSavingReview, setIsSavingReview] = useState(false)
  const [reviewMessage, setReviewMessage] = useState<string | null>(null)

  // Evidence Modal state
  const [inspectingEvent, setInspectingEvent] = useState<LiveMonitoringEventItem | null>(null)
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([])
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  const handlePrint = () => {
    window.print()
  }

  const handleSaveReview = async () => {
    setIsSavingReview(true)
    setReviewMessage(null)
    try {
      const res = await apiClient.updateReportReview(report.interview_id, {
        review_status: reviewStatus,
        review_notes: reviewNotes,
      })
      if (onReportUpdated) {
        onReportUpdated(res.report)
      }
      setReviewMessage('Review status updated successfully.')
    } catch {
      setReviewMessage('Failed to save review status.')
    } finally {
      setIsSavingReview(false)
    }
  }

  const handleInspectEvidence = async (event: LiveMonitoringEventItem) => {
    setInspectingEvent(event)
    setIsEvidenceLoading(true)
    setEvidenceError(null)

    try {
      const targetId = event.event_id || event._id
      const res = await apiClient.getInterviewEvidence(report.interview_id, { eventId: targetId })
      setEvidenceList(res.evidence)
    } catch {
      setEvidenceError('Unable to load contextual evidence for this observation.')
    } finally {
      setIsEvidenceLoading(false)
    }
  }

  const indicators = report.integrity_indicators
  const metadata = report.session_metadata

  return (
    <div className="space-y-6 max-w-5xl mx-auto print:max-w-none print:p-0">
      {/* Action Bar (hidden in print) */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-surface-200 dark:border-surface-800 print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          <span className="font-semibold text-surface-900 dark:text-surface-100">
            Interview Report: {metadata?.title || report.interview_id}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="neutral" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="h-4 w-4" />
            Print / Export PDF
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Printable Report Document Container */}
      <div className="space-y-6 print:space-y-4">
        {/* Document Header */}
        <div className="p-6 rounded-xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-700 print:border-none print:p-0">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-surface-900 dark:text-surface-50">
                {metadata?.title || 'Post-Interview Integrity Report'}
              </h1>
              <p className="text-xs text-surface-500 font-mono">
                Report ID: {report.report_id || report.id} · Interview ID: {report.interview_id}
              </p>
              <div className="pt-2 flex items-center gap-4 text-xs text-surface-600 dark:text-surface-300 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-surface-400" />
                  Candidate: <strong>{metadata?.candidate?.name || 'Candidate'}</strong> ({metadata?.candidate?.email || 'N/A'})
                </span>
                <span className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-surface-400" />
                  Interviewer: <strong>{metadata?.interviewer?.name || 'Interviewer'}</strong>
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:items-end gap-1.5 text-xs text-surface-500">
              <Badge
                variant="neutral"
                className={
                  report.review_status === 'REVIEWED'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                    : report.review_status === 'FLAGGED_FOR_FOLLOWUP'
                      ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                }
              >
                {report.review_status}
              </Badge>
              {report.generated_at && (
                <span>Generated: {new Date(report.generated_at).toLocaleString()}</span>
              )}
              {metadata?.duration_seconds !== undefined && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Duration: {Math.round(metadata.duration_seconds / 60)} min ({metadata.duration_seconds}s)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Interpretable Integrity Indicators (UX-INT-002, PRD-FR-009) */}
        {indicators && (
          <div>
            <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-100 mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              Interpretable Integrity Dimensions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Visual Continuity */}
              <Card className="border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900">
                <CardContent className="p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-surface-500 font-medium">Visual Continuity</span>
                    <Badge
                      variant="neutral"
                      className={
                        indicators.visual_consistency.status === 'NORMAL'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300'
                      }
                    >
                      {indicators.visual_consistency.status}
                    </Badge>
                  </div>
                  <div className="font-semibold text-surface-900 dark:text-surface-100">
                    {indicators.visual_consistency.label}
                  </div>
                  <p className="text-[11px] text-surface-500">{indicators.visual_consistency.description}</p>
                </CardContent>
              </Card>

              {/* Stream Reliability */}
              <Card className="border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900">
                <CardContent className="p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-surface-500 font-medium">Stream Reliability</span>
                    <Badge
                      variant="neutral"
                      className={
                        indicators.stream_reliability.status === 'STABLE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-800 dark:text-surface-400'
                      }
                    >
                      {indicators.stream_reliability.status}
                    </Badge>
                  </div>
                  <div className="font-semibold text-surface-900 dark:text-surface-100">
                    {indicators.stream_reliability.label}
                  </div>
                  <p className="text-[11px] text-surface-500">{indicators.stream_reliability.description}</p>
                </CardContent>
              </Card>

              {/* Secondary Presence */}
              <Card className="border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900">
                <CardContent className="p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-surface-500 font-medium">Secondary Presence</span>
                    <Badge
                      variant="neutral"
                      className={
                        indicators.multi_presence.status === 'CLEAR'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300'
                      }
                    >
                      {indicators.multi_presence.status}
                    </Badge>
                  </div>
                  <div className="font-semibold text-surface-900 dark:text-surface-100">
                    {indicators.multi_presence.label}
                  </div>
                  <p className="text-[11px] text-surface-500">{indicators.multi_presence.description}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Factual Observation Summary Narrative */}
        <Card className="border-surface-200 dark:border-surface-700">
          <CardHeader className="py-3 px-4 border-b border-surface-200 dark:border-surface-700">
            <CardTitle className="text-sm font-semibold">Observation Narrative & Context</CardTitle>
          </CardHeader>
          <CardContent className="p-4 text-xs leading-relaxed text-surface-700 dark:text-surface-300 whitespace-pre-wrap">
            {report.summary || 'No observation narrative generated for this session.'}
          </CardContent>
        </Card>

        {/* Chronological Observable Events Timeline */}
        <Card className="border-surface-200 dark:border-surface-700">
          <CardHeader className="py-3 px-4 border-b border-surface-200 dark:border-surface-700 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-600" />
              Chronological Event Observations ({report.events?.length || 0})
            </CardTitle>
            <span className="text-xs text-surface-500">
              {report.evidence_ids?.length || 0} linked evidence items
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {!report.events || report.events.length === 0 ? (
              <p className="text-xs text-surface-500 py-6 text-center">
                No notable monitoring events recorded during this session.
              </p>
            ) : (
              <div className="divide-y divide-surface-200 dark:divide-surface-800 text-xs">
                {report.events.map((event) => (
                  <div
                    key={event.event_id || event._id}
                    className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="neutral"
                          className={
                            event.severity === 'high'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }
                        >
                          {event.event_type}
                        </Badge>
                        <span className="font-mono text-[11px] text-surface-500">
                          {new Date(event.first_observed_at || event.last_observed_at).toLocaleTimeString()}
                        </span>
                        {event.confidence !== undefined && (
                          <span className="text-surface-500">
                            Confidence: <strong>{Math.round(event.confidence * 100)}%</strong>
                          </span>
                        )}
                        {event.duration_ms > 0 && (
                          <span className="text-surface-500">
                            Duration: <strong>{event.duration_ms}ms</strong>
                          </span>
                        )}
                      </div>
                      {event.explanation && (
                        <p className="text-surface-600 dark:text-surface-300">{event.explanation}</p>
                      )}
                    </div>

                    <div className="shrink-0 print:hidden">
                      <Button
                        variant="neutral"
                        size="sm"
                        className="h-7 text-xs px-2 gap-1"
                        onClick={() => handleInspectEvidence(event)}
                      >
                        <FileText className="h-3 w-3" />
                        Inspect Evidence
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Human Review Status Workflow (Print shows state; non-print allows editing) */}
        <Card className="border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-850/50">
          <CardHeader className="py-3 px-4 border-b border-surface-200 dark:border-surface-700">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Human Review & Verification Workflow
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-medium text-surface-700 dark:text-surface-300">
                  Review Status
                </label>
                <select
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value)}
                  className="w-full text-xs rounded border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 p-2 text-surface-900 dark:text-surface-100"
                >
                  <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                  <option value="REVIEWED">REVIEWED</option>
                  <option value="FLAGGED_FOR_FOLLOWUP">FLAGGED_FOR_FOLLOWUP</option>
                </select>
              </div>

              <div className="space-y-1 text-surface-500">
                {report.reviewed_by && (
                  <p>
                    Last reviewed by: <strong className="text-surface-800 dark:text-surface-200">{report.reviewed_by}</strong>
                  </p>
                )}
                {report.reviewed_at && (
                  <p>Reviewed timestamp: {new Date(report.reviewed_at).toLocaleString()}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-surface-700 dark:text-surface-300">
                Reviewer Evaluation Notes
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                placeholder="Enter objective reviewer notes, follow-up actions, or observation clarifications..."
                className="w-full text-xs rounded border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 p-2 text-surface-900 dark:text-surface-100"
              />
            </div>

            <div className="flex items-center justify-between pt-1 print:hidden">
              <span className="text-xs text-brand-600 dark:text-brand-400 font-medium">{reviewMessage}</span>
              <Button size="sm" onClick={handleSaveReview} loading={isSavingReview}>
                Save Review Status
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contextual Evidence Modal */}
      <Modal
        isOpen={inspectingEvent !== null}
        onClose={() => setInspectingEvent(null)}
        title="Event Evidence Context"
        description="Structured observation context and telemetry captured for this monitoring event."
      >
        <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto">
          {inspectingEvent && (
            <div className="p-3 rounded-lg bg-surface-100 dark:bg-surface-800 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="neutral" className="bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
                  {inspectingEvent.event_type}
                </Badge>
                <span className="font-semibold text-surface-900 dark:text-surface-100">
                  ID: {inspectingEvent.event_id || inspectingEvent._id}
                </span>
              </div>
              <p className="text-surface-600 dark:text-surface-300">
                {inspectingEvent.explanation || 'Observation recorded during session.'}
              </p>
              <p className="text-[11px] text-surface-400">
                Timestamp: {new Date(inspectingEvent.first_observed_at || inspectingEvent.last_observed_at).toLocaleString()}
              </p>
            </div>
          )}

          {isEvidenceLoading ? (
            <div className="py-6 text-center text-xs text-surface-500">Loading observation context...</div>
          ) : evidenceError ? (
            <div className="p-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded border border-rose-200 dark:border-rose-900">
              {evidenceError}
            </div>
          ) : evidenceList.length === 0 ? (
            <p className="text-xs text-surface-500 py-4 text-center">
              No structured evidence items attached to this event.
            </p>
          ) : (
            <div className="space-y-3">
              {evidenceList.map((item) => (
                <div
                  key={item.evidence_id}
                  className="p-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-850 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral" className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 font-mono text-[10px]">
                        {item.evidence_type}
                      </Badge>
                      <span className="font-medium text-surface-800 dark:text-surface-200">
                        ID: {item.evidence_id.slice(0, 8)}...
                      </span>
                    </div>
                    <span className="text-[11px] text-surface-400">Retention: {item.retention_class}</span>
                  </div>

                  {item.metadata.confidence !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-surface-500">Confidence:</span>
                      <span className="font-semibold text-surface-900 dark:text-surface-100">
                        {Math.round(item.metadata.confidence * 100)}%
                      </span>
                    </div>
                  )}

                  {item.metadata.metrics && (
                    <div className="bg-surface-100 dark:bg-surface-800 p-2 rounded text-[11px] font-mono space-y-0.5">
                      <div className="font-semibold text-surface-700 dark:text-surface-300 mb-1">Observation Telemetry:</div>
                      {Object.entries(item.metadata.metrics).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-surface-500">{k}:</span>
                          <span className="text-surface-900 dark:text-surface-100">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-surface-400 pt-1 border-t border-surface-200 dark:border-surface-700">
                    <span>Captured: {new Date(item.captured_at).toLocaleTimeString()}</span>
                    <span>Expires: {new Date(item.expires_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="neutral" size="sm" onClick={() => setInspectingEvent(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
export default InterviewReportView
