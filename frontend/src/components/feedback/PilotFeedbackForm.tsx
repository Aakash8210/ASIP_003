import { useState, useEffect } from 'react'
import {
  CheckCircle,
  Send,
  MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { apiClient, PilotFeedback, PilotFeedbackPayload } from '@/lib/api'

interface PilotFeedbackFormProps {
  interviewId: string
  role: 'candidate' | 'interviewer' | 'hr'
  title?: string
  description?: string
  onSubmitted?: (feedback: PilotFeedback) => void
  collapsible?: boolean
  initialExpanded?: boolean
}

const COMMON_FRICTION_POINTS = [
  { id: 'camera_setup', label: 'Camera / Permission Setup' },
  { id: 'quality_alerts', label: 'Lighting / Video Quality Alerts' },
  { id: 'network_latency', label: 'Network or Video Latency' },
  { id: 'indicator_clarity', label: 'Integrity Indicator Clarity' },
  { id: 'drawer_ux', label: 'Monitoring Drawer / Navigation' },
  { id: 'false_positives', label: 'Sensory False Positives' },
  { id: 'audio_issues', label: 'Audio / Peripheral Friction' },
]

export function PilotFeedbackForm({
  interviewId,
  role,
  title = 'Internal Pilot Feedback & Usability Evaluation',
  description = 'Help us evaluate system usability and transparency during this pilot phase. All feedback is analyzed exclusively to improve system clarity and reduce friction.',
  onSubmitted,
  collapsible = false,
  initialExpanded = true,
}: PilotFeedbackFormProps) {
  const [isExpanded, setIsExpanded] = useState(!collapsible || initialExpanded)
  const [hasConsent, setHasConsent] = useState(false)
  const [overallExperience, setOverallExperience] = useState<number>(4)
  const [systemClarity, setSystemClarity] = useState<number>(4)
  const [technicalFriction, setTechnicalFriction] = useState<number>(2)
  const [trustFairness, setTrustFairness] = useState<number>(4)
  const [selectedFriction, setSelectedFriction] = useState<string[]>([])
  const [feedbackNotes, setFeedbackNotes] = useState('')

  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  // Load existing feedback if present
  useEffect(() => {
    if (!interviewId) return
    let isMounted = true
    setIsLoading(true)

    apiClient
      .getInterviewFeedback(interviewId)
      .then((res) => {
        if (!isMounted || !res.feedback) return
        const existing = Array.isArray(res.feedback)
          ? res.feedback.find((f) => f.role === role) || res.feedback[0]
          : res.feedback

        if (existing) {
          setHasConsent(existing.pilot_consent_acknowledged)
          if (existing.ratings?.overall_experience) setOverallExperience(existing.ratings.overall_experience)
          if (existing.ratings?.system_clarity) setSystemClarity(existing.ratings.system_clarity)
          if (existing.ratings?.technical_friction) setTechnicalFriction(existing.ratings.technical_friction)
          if (existing.ratings?.trust_and_fairness) setTrustFairness(existing.ratings.trust_and_fairness)
          if (Array.isArray(existing.friction_points)) setSelectedFriction(existing.friction_points)
          if (existing.feedback_notes) setFeedbackNotes(existing.feedback_notes)
          setIsSuccess(true)
          setStatusMessage('Feedback already recorded. You may modify your response at any time.')
        }
      })
      .catch(() => {
        // Non-critical if no existing feedback or access check differs
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [interviewId, role])

  const toggleFrictionPoint = (pointId: string) => {
    setSelectedFriction((prev) =>
      prev.includes(pointId) ? prev.filter((id) => id !== pointId) : [...prev, pointId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasConsent) {
      setErrorMessage('Please acknowledge the pilot consent statement to submit feedback.')
      return
    }

    setIsSaving(true)
    setErrorMessage(null)
    setStatusMessage(null)

    const payload: PilotFeedbackPayload = {
      pilot_consent_acknowledged: true,
      ratings: {
        overall_experience: overallExperience,
        system_clarity: systemClarity,
        technical_friction: technicalFriction,
        trust_and_fairness: trustFairness,
      },
      friction_points: selectedFriction,
      feedback_notes: feedbackNotes.trim(),
      client_metadata: {
        submitted_at: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'browser',
      },
    }

    try {
      const res = await apiClient.submitInterviewFeedback(interviewId, payload)
      setIsSuccess(true)
      setStatusMessage('Thank you! Your feedback has been recorded for the internal pilot evaluation.')
      if (onSubmitted) {
        onSubmitted(res.feedback)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit pilot feedback.'
      setErrorMessage(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const renderRatingGroup = (
    label: string,
    descriptionText: string,
    value: number,
    onChange: (val: number) => void,
    lowLabel: string,
    highLabel: string
  ) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <label className="font-medium text-surface-800 dark:text-surface-200">{label}</label>
        <span className="font-semibold text-brand-600 dark:text-brand-400">
          {value} / 5
        </span>
      </div>
      <p className="text-[11px] text-surface-500 dark:text-surface-400">{descriptionText}</p>
      <div className="flex items-center gap-1 pt-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className={`flex-1 py-1.5 rounded text-xs font-semibold border transition-all ${
              value === star
                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                : 'bg-surface-50 dark:bg-surface-800/80 text-surface-700 dark:text-surface-300 border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-750'
            }`}
          >
            {star}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-surface-400 dark:text-surface-500 px-0.5">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  )

  return (
    <Card className="border border-brand-100 dark:border-brand-900/50 bg-white dark:bg-surface-900 shadow-sm overflow-hidden">
      <div className="h-1 bg-brand-500 w-full" />
      <CardHeader className="py-4 px-5 border-b border-surface-100 dark:border-surface-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                {title}
              </CardTitle>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                {description}
              </p>
            </div>
          </div>
          {collapsible && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-surface-600"
            >
              {isExpanded ? 'Collapse' : 'Provide Feedback'}
            </Button>
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-5">
          {isLoading ? (
            <div className="py-6 text-center text-xs text-surface-500">Checking pilot status...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Consent Acknowledgment Box */}
              <div className="p-3.5 rounded-lg bg-surface-50 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700 text-xs">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasConsent}
                    onChange={(e) => setHasConsent(e.target.checked)}
                    className="mt-0.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                  />
                  <div className="space-y-0.5">
                    <span className="font-semibold text-surface-800 dark:text-surface-200">
                      Pilot Evaluation & Usability Consent
                    </span>
                    <p className="text-surface-600 dark:text-surface-400 text-[11px] leading-relaxed">
                      I consent to sharing this feedback and usability observations for internal system evaluation.
                      I understand this feedback is non-punitive, strictly used to evaluate and refine the monitoring
                      system, and contains no automated hiring decisions.
                    </p>
                  </div>
                </label>
              </div>

              {/* Rating Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderRatingGroup(
                  'Overall Experience',
                  'How would you rate the overall session experience?',
                  overallExperience,
                  setOverallExperience,
                  '1 - Difficult',
                  '5 - Excellent'
                )}

                {renderRatingGroup(
                  'System Clarity & Transparency',
                  'Did you clearly understand the system state and monitoring process?',
                  systemClarity,
                  setSystemClarity,
                  '1 - Confusing',
                  '5 - Very Clear'
                )}

                {renderRatingGroup(
                  'Technical Friction',
                  'Did you encounter technical glitches, slowdowns, or false alerts?',
                  technicalFriction,
                  setTechnicalFriction,
                  '1 - Smooth / None',
                  '5 - High Friction'
                )}

                {renderRatingGroup(
                  'Trust & Fairness Perception',
                  'Did you feel the monitoring cues were objective and non-intrusive?',
                  trustFairness,
                  setTrustFairness,
                  '1 - Distrustful',
                  '5 - Highly Fair'
                )}
              </div>

              {/* Friction Points Tags */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-surface-800 dark:text-surface-200">
                  Friction Points Observed (Optional)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_FRICTION_POINTS.map((fp) => {
                    const isSelected = selectedFriction.includes(fp.id)
                    return (
                      <button
                        key={fp.id}
                        type="button"
                        onClick={() => toggleFrictionPoint(fp.id)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                          isSelected
                            ? 'bg-brand-100 text-brand-800 border-brand-300 dark:bg-brand-950 dark:text-brand-300 dark:border-brand-700 font-medium'
                            : 'bg-surface-50 dark:bg-surface-800 text-surface-600 dark:text-surface-400 border-surface-200 dark:border-surface-700 hover:bg-surface-100'
                        }`}
                      >
                        {fp.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Open Notes Textarea */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-surface-800 dark:text-surface-200">
                  Additional Usability Notes & Suggestions
                </label>
                <textarea
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Share any specific moments of friction, confusing indicators, or usability improvements..."
                  className="w-full text-xs rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 p-2.5 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-1 focus:ring-brand-500 placeholder:text-surface-400"
                />
                <div className="flex justify-end text-[10px] text-surface-400">
                  <span>{feedbackNotes.length} / 2000 characters</span>
                </div>
              </div>

              {/* Status and Error Banners */}
              {statusMessage && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>{statusMessage}</span>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs">
                  {errorMessage}
                </div>
              )}

              {/* Submit Button */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-surface-400 dark:text-surface-500">
                  Role: <span className="capitalize font-medium">{role}</span>
                </span>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!hasConsent || isSaving}
                  loading={isSaving}
                  className="gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isSuccess ? 'Update Feedback' : 'Submit Pilot Feedback'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      )}
    </Card>
  )
}
