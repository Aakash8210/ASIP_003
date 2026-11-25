import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Calendar,
  Camera,
  CheckCircle2,
  Eye,
  Lock,
  Mic,
  Shield,
  Sparkles,
  User,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import {
  apiClient,
  ApiError,
  CandidateProfileSummary,
  InterviewerUserSummary,
} from '@/lib/api'

function toLocalDateTimeInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function HRCreateInterviewPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { success, danger } = useToast()

  const [candidates, setCandidates] = useState<CandidateProfileSummary[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(true)
  const [candidatesError, setCandidatesError] = useState<string | null>(null)

  const [interviewers, setInterviewers] = useState<InterviewerUserSummary[]>([])
  const [interviewersLoading, setInterviewersLoading] = useState(true)

  const [title, setTitle] = useState('')
  const [candidateId, setCandidateId] = useState(
    (location.state as { candidateId?: string } | null)?.candidateId ?? ''
  )
  const [interviewerId, setInterviewerId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiClient
      .listCandidates()
      .then((response) => {
        if (!cancelled) setCandidates(response.candidates)
      })
      .catch((error) => {
        if (!cancelled) {
          setCandidatesError(error instanceof ApiError ? error.message : 'Failed to load candidates')
        }
      })
      .finally(() => {
        if (!cancelled) setCandidatesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    apiClient
      .listInterviewers()
      .then((response) => {
        if (!cancelled) setInterviewers(response.interviewers)
      })
      .catch(() => {
        if (!cancelled) setInterviewers([])
      })
      .finally(() => {
        if (!cancelled) setInterviewersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const validate = () => {
    const next: Record<string, string> = {}
    if (!title.trim()) {
      next.title = 'Interview title is required'
    }
    if (!candidateId) {
      next.candidateId = 'Please select a candidate'
    }
    if (scheduledAt) {
      const parsed = new Date(scheduledAt)
      if (Number.isNaN(parsed.getTime())) {
        next.scheduledAt = 'Please provide a valid date and time'
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    try {
      const response = await apiClient.createInterview({
        title: title.trim(),
        candidateId,
        scheduledStartAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        interviewerId: interviewerId || null,
      })
      success('Interview created', 'The interview session was created successfully')
      navigate(`/hr/interviews/${response.interview.id}`, { replace: true })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to create the interview'
      danger('Create interview failed', message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const setQuickSchedule = (hoursFromNow: number) => {
    const target = new Date(Date.now() + hoursFromNow * 3600000)
    target.setMinutes(0, 0, 0)
    setScheduledAt(toLocalDateTimeInput(target))
    if (errors.scheduledAt) setErrors((prev) => ({ ...prev, scheduledAt: '' }))
  }

  const selectedCandidate = candidates.find((c) => c.id === candidateId)
  const selectedInterviewer = interviewers.find((i) => i.id === interviewerId)

  const monitoringModules = [
    {
      icon: Camera,
      title: '1 fps Webcam & YuNet CV',
      desc: 'Face presence & multi-face detection',
      status: 'Enabled',
      tone: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    },
    {
      icon: Mic,
      title: 'Pre-Flight Audio & Hardware Check',
      desc: 'Mandatory browser WebRTC & mic check',
      status: 'Required',
      tone: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    },
    {
      icon: Eye,
      title: 'Observable Behavior Signals',
      desc: 'Duration-aware absence & presence logs',
      status: 'Active',
      tone: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    },
    {
      icon: Lock,
      title: 'Zero Raw-Frame Persistence',
      desc: 'Metadata & linked evidence context only',
      status: 'Enforced',
      tone: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 mb-2">
          <Link to="/hr/interviews">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to interviews
          </Link>
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-surface-900 dark:text-white">
              Create Interview
            </h1>
            <p className="text-sm text-surface-500 dark:text-zinc-400 mt-1">
              Configure session participants, schedule window, and integrity telemetry defaults.
            </p>
          </div>
          <Badge variant="info" className="w-fit font-mono text-[11px]">
            <Sparkles className="h-3 w-3" />
            SESSION PROVISIONING
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Core Configuration Form */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="lg:col-span-7"
        >
          <Card className="relative overflow-hidden">
            <CardHeader className="border-b border-surface-200 dark:border-white/[0.06] pb-4">
              <CardTitle className="text-base font-semibold">Session Configuration</CardTitle>
              <CardDescription className="text-xs">
                Associate a registered candidate and optionally assign a technical interviewer.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div className="space-y-1.5">
                  <label htmlFor="title" className="label">Interview title</label>
                  <Input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value)
                      if (errors.title) setErrors((prev) => ({ ...prev, title: '' }))
                    }}
                    placeholder="Senior Frontend Engineer — Technical Screen"
                    error={errors.title}
                    disabled={isSubmitting}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Select
                    id="candidate"
                    label="Candidate"
                    value={candidateId}
                    placeholder="Search or select a candidate..."
                    onValueChange={(value) => {
                      setCandidateId(value)
                      if (errors.candidateId) setErrors((prev) => ({ ...prev, candidateId: '' }))
                    }}
                    options={candidates.map((c) => ({
                      value: c.id,
                      label: c.name ?? 'Candidate',
                      sublabel: c.email ?? 'No email',
                      avatarName: c.name ?? 'C',
                      badge: 'Verified',
                    }))}
                    error={errors.candidateId}
                    disabled={isSubmitting || candidatesLoading || candidates.length === 0}
                    required
                  />
                  {candidatesLoading && (
                    <p className="text-xs text-surface-500 dark:text-zinc-400 flex items-center gap-2 pt-1">
                      <span className="animate-spin h-3.5 w-3.5 border-2 border-cyan-500 border-t-transparent rounded-full" aria-hidden="true" />
                      Loading registered candidates…
                    </p>
                  )}
                  {candidatesError && (
                    <p className="text-xs text-rose-500">{candidatesError}</p>
                  )}
                  {!candidatesLoading && !candidatesError && candidates.length === 0 && (
                    <p className="text-xs text-surface-500 dark:text-zinc-400 flex items-center gap-2 pt-1">
                      <User className="h-3.5 w-3.5" aria-hidden="true" />
                      No registered candidates available yet. A candidate must register an interviewee account first.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Select
                    id="interviewer"
                    label="Interviewer"
                    value={interviewerId}
                    placeholder="Assign later (optional)"
                    onValueChange={setInterviewerId}
                    options={[
                      { value: '', label: 'Assign later', sublabel: 'You can assign an interviewer after creation' },
                      ...interviewers.map((i) => ({
                        value: i.id,
                        label: i.name ?? 'Interviewer',
                        sublabel: i.email ?? 'No email',
                        avatarName: i.name ?? 'I',
                        badge: 'Interviewer',
                      })),
                    ]}
                    disabled={isSubmitting || interviewersLoading}
                    helperText="Optional — reviewers can also be assigned from the interview detail view."
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="scheduledAt" className="label mb-0 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-cyan-500" aria-hidden="true" />
                      Scheduled date &amp; time <span className="text-surface-400 dark:text-zinc-500 font-normal">(optional)</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setQuickSchedule(1)}
                        className="px-2 py-0.5 rounded-md text-[11px] font-mono border border-surface-200 dark:border-white/[0.08] bg-surface-50 dark:bg-white/[0.03] text-surface-600 dark:text-zinc-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                      >
                        +1h
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickSchedule(24)}
                        className="px-2 py-0.5 rounded-md text-[11px] font-mono border border-surface-200 dark:border-white/[0.08] bg-surface-50 dark:bg-white/[0.03] text-surface-600 dark:text-zinc-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                      >
                        Tomorrow
                      </button>
                    </div>
                  </div>
                  <Input
                    id="scheduledAt"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => {
                      setScheduledAt(e.target.value)
                      if (errors.scheduledAt) setErrors((prev) => ({ ...prev, scheduledAt: '' }))
                    }}
                    error={errors.scheduledAt}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-surface-200 dark:border-white/[0.06]">
                  <Button variant="outline" type="button" asChild disabled={isSubmitting}>
                    <Link to="/hr/interviews">Cancel</Link>
                  </Button>
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <Button type="submit" loading={isSubmitting} className="px-5">
                      Create Interview
                    </Button>
                  </motion.div>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        {/* Right Column: Interview Settings Preview */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="lg:col-span-5 space-y-4"
        >
          <Card className="relative overflow-hidden">
            <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" aria-hidden="true" />
            <CardHeader className="border-b border-surface-200 dark:border-white/[0.06] pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-cyan-500" aria-hidden="true" />
                  Interview Settings Preview
                </CardTitle>
                <Badge variant="success" className="font-mono text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  POLICY READY
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Real-time summary of active proctoring & privacy modules for this session.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Live Summary Box */}
              <div className="rounded-lg border border-surface-200 dark:border-white/[0.07] bg-surface-50 dark:bg-[#08090E] p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-surface-500 dark:text-zinc-500">Session Title</span>
                  <span className="font-medium text-surface-900 dark:text-zinc-100 truncate max-w-[180px]">
                    {title.trim() || 'Untitled Session'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-surface-500 dark:text-zinc-500">Candidate</span>
                  <span className="font-medium text-surface-900 dark:text-zinc-100 truncate max-w-[180px]">
                    {selectedCandidate ? selectedCandidate.name : 'Not selected'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-surface-500 dark:text-zinc-500">Interviewer</span>
                  <span className="font-medium text-surface-900 dark:text-zinc-100 truncate max-w-[180px]">
                    {selectedInterviewer ? selectedInterviewer.name : 'Assign later'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-surface-500 dark:text-zinc-500">Schedule</span>
                  <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400">
                    {scheduledAt ? new Date(scheduledAt).toLocaleString() : 'Flexible / Unscheduled'}
                  </span>
                </div>
              </div>

              {/* Proctoring Modules */}
              <div className="space-y-2.5">
                <p className="text-[11px] font-mono uppercase tracking-wider text-surface-500 dark:text-zinc-500">
                  Active Integrity Modules
                </p>
                {monitoringModules.map((mod) => (
                  <div
                    key={mod.title}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-surface-200/80 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 ${mod.tone}`}>
                        <mod.icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-surface-900 dark:text-zinc-100 truncate">
                          {mod.title}
                        </p>
                        <p className="text-[11px] text-surface-500 dark:text-zinc-400 truncate">
                          {mod.desc}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-100 dark:bg-white/[0.05] text-surface-600 dark:text-zinc-300 border border-surface-200 dark:border-white/[0.08] shrink-0">
                      {mod.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center gap-2 text-[11px] text-surface-500 dark:text-zinc-400">
                <Video className="h-3.5 w-3.5 text-cyan-500 shrink-0" aria-hidden="true" />
                <span>WebRTC room & invite token are provisioned automatically on creation.</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-surface-500 dark:text-zinc-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-hidden="true" />
                <span>Human reviewers retain final decision authority on all reports.</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
