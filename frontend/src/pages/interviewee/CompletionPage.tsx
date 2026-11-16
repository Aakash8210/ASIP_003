import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  FileCheck,
  ShieldCheck,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { apiClient, CandidateInterview } from '@/lib/api'
import { formatInterviewDate } from '@/pages/hr/interviewStatus'

// Interview Completion — Candidate Experience (Phase 10, UX-CAN-004)
// Confirms unambiguous completion with professional, non-punitive messaging.
// Avoids exposing internal fraud/risk assessments or accusatory messages.

export function IntervieweeCompletionPage() {
  const { id } = useParams<{ id: string }>()
  const [interview, setInterview] = useState<CandidateInterview | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let isMounted = true
    apiClient
      .getMyInterview(id)
      .then((res) => {
        if (isMounted) setInterview(res.interview)
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [id])

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 mb-2">
          <Link to="/interviewee/interviews">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to My Interviews
          </Link>
        </Button>
      </div>

      <Card className="border-emerald-200 dark:border-emerald-900 bg-white dark:bg-surface-900 shadow-sm overflow-hidden">
        <div className="h-2 bg-emerald-500 w-full" />
        <CardContent className="py-10 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center mx-auto mb-4 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>

          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">
            Interview Session Completed
          </h1>
          <p className="text-surface-600 dark:text-surface-400 mt-2 max-w-md mx-auto text-sm">
            Thank you for participating. Your interview session has ended successfully.
          </p>

          {interview && (
            <div className="mt-6 p-4 rounded-xl bg-surface-50 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700 max-w-md mx-auto text-left space-y-2 text-sm">
              <p className="font-semibold text-surface-900 dark:text-surface-50">
                {interview.title}
              </p>
              {interview.interviewer && (
                <div className="flex items-center gap-2 text-surface-600 dark:text-surface-400 text-xs">
                  <User className="h-3.5 w-3.5" />
                  <span>Interviewer: {interview.interviewer.name}</span>
                </div>
              )}
              {interview.ended_at && (
                <div className="flex items-center gap-2 text-surface-600 dark:text-surface-400 text-xs">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Concluded: {formatInterviewDate(interview.ended_at)}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/30 max-w-md mx-auto text-left">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-2 flex items-center gap-1.5">
              <FileCheck className="h-4 w-4 text-brand-600" />
              What Happens Next?
            </h2>
            <ul className="text-xs text-surface-600 dark:text-surface-400 space-y-1.5 list-disc list-inside">
              <li>The interview team will review your session and evaluation results.</li>
              <li>Your recruiter will contact you regarding next steps in the hiring process.</li>
              <li>If you have any questions, you can reach out directly to your recruiter.</li>
            </ul>
          </div>

          <div className="mt-8 flex justify-center gap-3">
            <Button asChild>
              <Link to="/interviewee/interviews">Go to My Interviews</Link>
            </Button>
            <Button variant="neutral" asChild>
              <Link to="/interviewee/dashboard">Return to Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

