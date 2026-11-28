import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  Eye,
  FileText,
  Mail,
  Pencil,
  Send,
  User,
  UserPlus,
  Clock,
  Shield,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { apiClient, ApiError, InterviewerUserSummary, InterviewReport, InterviewSession } from '@/lib/api'
import { interviewStatusConfig, formatInterviewDate } from './interviewStatus'
import { InterviewReportView } from '@/components/reports/InterviewReportView'

export function HRInterviewDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { success, danger } = useToast()

  const [interview, setInterview] = useState<InterviewSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [report, setReport] = useState<InterviewReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editScheduledAt, setEditScheduledAt] = useState('')
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  const [showInviteModal, setShowInviteModal] = useState(false)
  const [isInviting, setIsInviting] = useState(false)

  const [showAssignModal, setShowAssignModal] = useState(false)
  const [interviewers, setInterviewers] = useState<InterviewerUserSummary[]>([])
  const [interviewersLoading, setInterviewersLoading] = useState(false)
  const [selectedInterviewerId, setSelectedInterviewerId] = useState('')
  const [isAssigning, setIsAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  const loadInterview = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await apiClient.getInterview(id)
      setInterview(response.interview)
      if (response.interview.status === 'completed') {
        try {
          const reportRes = await apiClient.getInterviewReport(id)
          setReport(reportRes.report)
        } catch {
          // report not yet generated
        }
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setLoadError(
          error.statusCode === 403
            ? 'You are not authorized to view this interview'
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
    loadInterview()
  }, [loadInterview])

  const startEditing = () => {
    if (!interview) return
    setEditTitle(interview.title)
    setEditScheduledAt(
      interview.scheduled_start_at
        ? new Date(interview.scheduled_start_at).toISOString().slice(0, 16)
        : ''
    )
    setEditErrors({})
    setIsEditing(true)
  }

  const validateEdit = () => {
    const next: Record<string, string> = {}
    if (!editTitle.trim()) {
      next.title = 'Interview title is required'
    }
    if (editScheduledAt) {
      const parsed = new Date(editScheduledAt)
      if (Number.isNaN(parsed.getTime())) {
        next.scheduledAt = 'Please provide a valid date and time'
      }
    }
    setEditErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSave = async () => {
    if (!interview || !validateEdit()) return
    setIsSaving(true)
    try {
      const response = await apiClient.updateInterview(interview.id, {
        title: editTitle.trim(),
        scheduledStartAt: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
      })
      setInterview(response.interview)
      setIsEditing(false)
      success('Interview updated', 'The interview details were saved successfully')
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update the interview'
      danger('Update failed', message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleInvite = async () => {
    if (!interview) return
    setIsInviting(true)
    try {
      const response = await apiClient.inviteInterview(interview.id)
      setInterview(response.interview)
      setShowInviteModal(false)
      success('Invitation dispatched', 'Candidate invitation link and token were generated')
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to initiate the invitation'
      danger('Invitation failed', message)
    } finally {
      setIsInviting(false)
    }
  }

  const openAssignModal = async () => {
    if (!interview) return
    setSelectedInterviewerId(interview.interviewer?.id ?? '')
    setAssignError(null)
    setShowAssignModal(true)
    setInterviewersLoading(true)
    try {
      const response = await apiClient.listInterviewers()
      setInterviewers(response.interviewers)
    } catch {
      setInterviewers([])
    } finally {
      setInterviewersLoading(false)
    }
  }

  const handleAssign = async () => {
    if (!interview || !selectedInterviewerId) return
    setIsAssigning(true)
    try {
      const response = await apiClient.assignInterview(interview.id, selectedInterviewerId)
      setInterview(response.interview)
      setShowAssignModal(false)
      success('Interviewer assigned', 'Technical reviewer was assigned to this interview')
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to assign the interviewer'
      setAssignError(message)
      danger('Assignment failed', message)
    } finally {
      setIsAssigning(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto" aria-busy="true">
        <div className="h-6 w-32 bg-surface-200 dark:bg-white/[0.04] rounded animate-pulse" />
        <div className="h-48 bg-surface-200 dark:bg-white/[0.04] rounded-xl animate-pulse" />
      </div>
    )
  }

  if (loadError || !interview) {
    return (
      <div className="max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 mb-4 text-xs">
          <Link to="/hr/interviews">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to interviews
          </Link>
        </Button>
        <Card className="p-8 text-center">
          <p className="text-surface-900 dark:text-zinc-100 font-medium">{loadError ?? 'Interview not found'}</p>
          <p className="text-surface-500 dark:text-zinc-400 text-xs mt-1">
            The interview could not be loaded. It may not exist or permissions may have changed.
          </p>
        </Card>
      </div>
    )
  }

  const status = interviewStatusConfig(interview.status)
  const canInvite = interview.status === 'draft'
  const canAssign = ['draft', 'scheduled', 'invited'].includes(interview.status)

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Breadcrumb & Action Bar */}
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 mb-3 text-xs">
          <Link to="/hr/interviews">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to interviews
          </Link>
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-surface-900 dark:text-zinc-100 truncate">
              {interview.title}
            </h1>
            <Badge
              variant={
                interview.status === 'in_progress'
                  ? 'danger'
                  : interview.status === 'completed'
                    ? 'success'
                    : 'neutral'
              }
              dot
              className="text-xs"
            >
              {status.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {interview.status === 'in_progress' && (
              <Button size="sm" variant="danger" asChild className="gap-1.5 text-xs">
                <Link to={`/hr/interviews/${interview.id}/live`}>
                  <Activity className="h-3.5 w-3.5" />
                  Live Monitoring
                </Link>
              </Button>
            )}
            {interview.status === 'completed' && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setShowReportModal(true)}>
                <FileText className="h-3.5 w-3.5 text-brand-500" />
                View Report
              </Button>
            )}
            {canAssign && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={openAssignModal} disabled={isEditing}>
                <UserPlus className="h-3.5 w-3.5 text-surface-500 dark:text-zinc-400" aria-hidden="true" />
                {interview.interviewer ? 'Reassign Reviewer' : 'Assign Reviewer'}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={startEditing} disabled={isEditing}>
              <Pencil className="h-3.5 w-3.5 text-surface-500 dark:text-zinc-400" aria-hidden="true" />
              Edit Details
            </Button>
            {canInvite && (
              <Button size="sm" className="gap-1.5 text-xs" onClick={() => setShowInviteModal(true)}>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Send Invitation
              </Button>
            )}
          </div>
        </div>
      </div>

      {isEditing && (
        <Card className="p-5 border-brand-500/30">
          <CardHeader className="pb-3 border-b border-surface-200/80 dark:border-white/[0.06]">
            <CardTitle className="text-sm font-semibold">Edit Session Details</CardTitle>
            <CardDescription className="text-xs">Update interview title and scheduled timing</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSave()
              }}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-1.5">
                <label htmlFor="edit-title" className="label">Interview title</label>
                <Input
                  id="edit-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => {
                    setEditTitle(e.target.value)
                    if (editErrors.title) setEditErrors((prev) => ({ ...prev, title: '' }))
                  }}
                  error={editErrors.title}
                  disabled={isSaving}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="edit-scheduled" className="label">Scheduled date &amp; time</label>
                <Input
                  id="edit-scheduled"
                  type="datetime-local"
                  value={editScheduledAt}
                  onChange={(e) => {
                    setEditScheduledAt(e.target.value)
                    if (editErrors.scheduledAt) setEditErrors((prev) => ({ ...prev, scheduledAt: '' }))
                  }}
                  error={editErrors.scheduledAt}
                  disabled={isSaving}
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-surface-200/80 dark:border-white/[0.06]">
                <Button variant="outline" size="sm" type="button" onClick={() => setIsEditing(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button size="sm" type="submit" loading={isSaving}>
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Meta Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Candidate Card */}
        <Card className="p-5">
          <div className="flex items-center gap-2 pb-3 border-b border-surface-200/80 dark:border-white/[0.06] text-xs font-semibold text-surface-900 dark:text-zinc-100">
            <User className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Candidate
          </div>
          <div className="pt-3.5 space-y-2 text-xs">
            {interview.candidate ? (
              <div className="flex items-center gap-3">
                <Avatar name={interview.candidate.name} size="sm" />
                <div className="min-w-0">
                  <p className="font-semibold text-surface-900 dark:text-zinc-100 truncate">
                    {interview.candidate.name ?? 'Candidate'}
                  </p>
                  <p className="text-surface-500 dark:text-zinc-400 font-mono text-[11px] flex items-center gap-1.5 truncate">
                    <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {interview.candidate.email ?? 'No email on record'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-surface-500 dark:text-zinc-400">No candidate associated with this interview</p>
            )}
          </div>
        </Card>

        {/* Interviewer Card */}
        <Card className="p-5">
          <div className="flex items-center gap-2 pb-3 border-b border-surface-200/80 dark:border-white/[0.06] text-xs font-semibold text-surface-900 dark:text-zinc-100">
            <UserPlus className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Technical Reviewer
          </div>
          <div className="pt-3.5 space-y-2 text-xs">
            {interview.interviewer ? (
              <div className="flex items-center gap-3">
                <Avatar name={interview.interviewer.name} size="sm" />
                <div className="min-w-0">
                  <p className="font-semibold text-surface-900 dark:text-zinc-100 truncate">
                    {interview.interviewer.name ?? 'Interviewer'}
                  </p>
                  <p className="text-surface-500 dark:text-zinc-400 font-mono text-[11px] truncate">
                    Assigned Reviewer
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-surface-500 dark:text-zinc-400">
                No reviewer assigned yet.{' '}
                {canAssign && 'Use "Assign Reviewer" to select a team member.'}
              </p>
            )}
          </div>
        </Card>

        {/* Timing Card */}
        <Card className="p-5">
          <div className="flex items-center gap-2 pb-3 border-b border-surface-200/80 dark:border-white/[0.06] text-xs font-semibold text-surface-900 dark:text-zinc-100">
            <Clock className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Schedule Details
          </div>
          <div className="pt-3.5 space-y-2 text-xs font-mono">
            <div>
              <span className="text-surface-500 dark:text-zinc-400">Window: </span>
              <span className="text-surface-900 dark:text-zinc-200 tabular-nums">
                {formatInterviewDate(interview.scheduled_start_at)}
              </span>
            </div>
            <div>
              <span className="text-surface-500 dark:text-zinc-400">Created: </span>
              <span className="text-surface-900 dark:text-zinc-200 tabular-nums">
                {formatInterviewDate(interview.created_at)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Invitation Status Card */}
      <Card className="p-5">
        <div className="flex items-center justify-between pb-3 border-b border-surface-200/80 dark:border-white/[0.06]">
          <div className="flex items-center gap-2 text-xs font-semibold text-surface-900 dark:text-zinc-100">
            <Send className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Candidate Invitation Status
          </div>
          {interview.invite_reference ? (
            <Badge variant="success" dot className="text-[10px]">
              Invitation Dispatched
            </Badge>
          ) : (
            <Badge variant="neutral" className="text-[10px]">
              Draft — Pending Dispatch
            </Badge>
          )}
        </div>
        <div className="pt-4 text-xs">
          {interview.invite_reference ? (
            <div className="space-y-2">
              <p className="text-surface-600 dark:text-zinc-400">
                An invitation token has been created for candidate authentication:
              </p>
              <div className="p-2.5 rounded-lg bg-surface-100 dark:bg-[#0c0d12] border border-surface-200 dark:border-white/[0.08] font-mono text-xs flex items-center justify-between">
                <span className="text-surface-700 dark:text-zinc-300 truncate">
                  Reference: {interview.invite_reference}
                </span>
                <span className="text-[11px] text-emerald-500 font-medium">Valid</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-surface-500 dark:text-zinc-400">
                No invitation has been sent yet. Click “Send Invitation” to generate credentials.
              </p>
              {canInvite && (
                <Button size="sm" onClick={() => setShowInviteModal(true)} className="gap-1.5 text-xs shrink-0">
                  <Send className="h-3 w-3" />
                  Send Invitation
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Post-Interview Audit Report Card */}
      <Card className="p-5">
        <div className="flex items-center justify-between pb-3 border-b border-surface-200/80 dark:border-white/[0.06]">
          <div className="flex items-center gap-2 text-xs font-semibold text-surface-900 dark:text-zinc-100">
            <Shield className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Integrity Audit &amp; Human Review
          </div>
          {report ? (
            <Badge variant="info" className="text-[10px]">
              Report Generated
            </Badge>
          ) : null}
        </div>
        <div className="pt-4 text-xs">
          {report ? (
            <div className="space-y-3">
              <p className="text-surface-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {report.summary ?? 'Session audit summary available.'}
              </p>
              {report.generated_at && (
                <p className="text-[11px] font-mono text-surface-400 dark:text-zinc-500">
                  Compiled: {formatInterviewDate(report.generated_at)}
                </p>
              )}
              <div className="pt-1">
                <Button size="sm" onClick={() => setShowReportModal(true)} className="gap-2 text-xs">
                  <Eye className="h-3.5 w-3.5" />
                  View Full Report &amp; Review Audit
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-surface-500 dark:text-zinc-400">
                {interview.status === 'completed'
                  ? 'The interview session concluded. You may generate the human review audit report now.'
                  : 'Post-interview integrity telemetry report becomes available once the session ends.'}
              </p>
              {interview.status === 'completed' && (
                <Button
                  size="sm"
                  disabled={reportLoading}
                  onClick={async () => {
                    setReportLoading(true)
                    try {
                      const res = await apiClient.generateInterviewReport(interview.id)
                      setReport(res.report)
                      setShowReportModal(true)
                    } catch {
                      try {
                        const res2 = await apiClient.getInterviewReport(interview.id)
                        setReport(res2.report)
                        setShowReportModal(true)
                      } catch {
                        danger('Failed to generate report')
                      }
                    } finally {
                      setReportLoading(false)
                    }
                  }}
                  className="gap-2 text-xs"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Generate &amp; Review Report
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Invite Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Send Candidate Invitation"
        size="md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-surface-600 dark:text-zinc-300 leading-relaxed">
            This will initiate the invitation workflow for{' '}
            <strong className="text-surface-900 dark:text-zinc-100">{interview.title}</strong>
            {interview.candidate?.name ? <> and notify <strong>{interview.candidate.name}</strong></> : null}. The session
            status will transition to Invited.
          </p>
          <div className="flex justify-end gap-2.5 pt-4 border-t border-surface-200/80 dark:border-white/[0.06]">
            <Button variant="outline" size="sm" type="button" onClick={() => setShowInviteModal(false)} disabled={isInviting}>
              Cancel
            </Button>
            <Button size="sm" type="button" loading={isInviting} onClick={handleInvite} className="gap-1.5">
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              Send Invitation
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign Modal */}
      <Modal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title={interview.interviewer ? 'Reassign Reviewer' : 'Assign Technical Reviewer'}
        size="md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-surface-600 dark:text-zinc-300 leading-relaxed">
            Select the reviewer who will conduct the session and monitor live WebRTC room telemetry.
          </p>
          <Select
            id="assign-interviewer"
            label="Reviewer"
            value={selectedInterviewerId}
            placeholder="Select an interviewer..."
            onValueChange={(value) => {
              setSelectedInterviewerId(value)
              setAssignError(null)
            }}
            options={[
              { value: '', label: 'Select an interviewer', sublabel: 'Choose who conducts this interview' },
              ...interviewers.map((i) => ({
                value: i.id,
                label: i.name ?? 'Interviewer',
                sublabel: i.email ?? 'No email',
              })),
            ]}
            disabled={isAssigning || interviewersLoading}
            error={assignError ?? undefined}
          />
          {interviewersLoading && (
            <p className="text-surface-500 dark:text-zinc-400">Loading active reviewer accounts…</p>
          )}
          <div className="flex justify-end gap-2.5 pt-4 border-t border-surface-200/80 dark:border-white/[0.06]">
            <Button variant="outline" size="sm" type="button" onClick={() => setShowAssignModal(false)} disabled={isAssigning}>
              Cancel
            </Button>
            <Button size="sm" type="button" loading={isAssigning} disabled={!selectedInterviewerId} onClick={handleAssign}>
              Assign Reviewer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Report Modal */}
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
