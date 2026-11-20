import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  CheckCircle,
  Clock,
  Mic,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

// Pre-interview system check (Phase 9, UX-CAN-002, PRD-FR-003, SRS-FR-006/007).
// All checks run locally in the browser using native capability APIs.
// CAMERA, MICROPHONE, CONNECTION, and BROWSER checks are ALL MANDATORY.

export type CheckState =
  | 'idle'
  | 'checking'
  | 'passed'
  | 'permission_denied'
  | 'unavailable'
  | 'timed_out'
  | 'failed'

export interface CheckItemState {
  state: CheckState
  message: string | null
  details?: string | null
}

const MANDATORY_CHECKS = ['browser', 'camera', 'microphone', 'connection'] as const
type CheckId = (typeof MANDATORY_CHECKS)[number]

const idleItem = (): CheckItemState => ({ state: 'idle', message: null })
const checkingItem = (): CheckItemState => ({ state: 'checking', message: null })

const DEVICE_TIMEOUT_MS = 8000
const NETWORK_TIMEOUT_MS = 5000

function stopStream(stream: MediaStream | null) {
  if (!stream) return
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop()
      } catch {
        // Ignore track stop error
      }
    })
  } catch {
    // Ignore stream error
  }
}

async function runBrowserCheck(): Promise<CheckItemState> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return {
      state: 'unavailable',
      message: 'Media capture APIs are not supported in this browser.',
      details: 'Please use a modern version of Chrome, Firefox, Edge, or Safari.',
    }
  }
  if (typeof RTCPeerConnection === 'undefined') {
    return {
      state: 'unavailable',
      message: 'WebRTC real-time communication is not supported.',
      details: 'A WebRTC-compliant browser is required to conduct the interview.',
    }
  }
  return {
    state: 'passed',
    message: 'Browser supports all required WebRTC and media capture capabilities.',
  }
}

async function runCameraCheck(): Promise<CheckItemState> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      state: 'unavailable',
      message: 'Camera access is not available in this browser.',
      details: 'Check your browser security settings or use an updated browser.',
    }
  }

  let lateStream: MediaStream | null = null

  try {
    const userMediaPromise = navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      })
      .then((s) => {
        lateStream = s
        return s
      })

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('CAMERA_TIMEOUT'))
      }, DEVICE_TIMEOUT_MS)
      // Clear timeout if promise settles
      userMediaPromise.finally(() => clearTimeout(timer))
    })

    const stream = await Promise.race([userMediaPromise, timeoutPromise])
    stopStream(stream)
    lateStream = null

    return {
      state: 'passed',
      message: 'Camera is connected and operational.',
    }
  } catch (error: unknown) {
    // Clean up if stream arrived after timeout
    if (lateStream) {
      stopStream(lateStream)
      lateStream = null
    }

    const err = error as { message?: string; name?: string }
    if (err?.message === 'CAMERA_TIMEOUT') {
      return {
        state: 'timed_out',
        message: 'Camera check timed out after 8 seconds.',
        details: 'Ensure no other application (Zoom, Teams, etc.) is using your webcam, then retry.',
      }
    }

    const name = error instanceof DOMException ? error.name : err?.name || ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      return {
        state: 'permission_denied',
        message: 'Camera access was denied.',
        details: 'Click the camera/lock icon in your browser address bar, set Camera to "Allow", and retry.',
      }
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        state: 'unavailable',
        message: 'No camera hardware detected.',
        details: 'Please connect a working webcam or check your hardware connections.',
      }
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        state: 'failed',
        message: 'Camera is currently busy or cannot be opened.',
        details: 'Another program may be using the camera. Close other video apps and retry.',
      }
    }
    return {
      state: 'failed',
      message: err?.message || 'Camera check encountered an unexpected error.',
      details: 'Please reconnect your camera and click retry.',
    }
  }
}

async function runMicrophoneCheck(): Promise<CheckItemState> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      state: 'unavailable',
      message: 'Microphone access is not available in this browser.',
      details: 'Check your browser security settings or use an updated browser.',
    }
  }

  let lateStream: MediaStream | null = null

  try {
    const userMediaPromise = navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      .then((s) => {
        lateStream = s
        return s
      })

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('MIC_TIMEOUT'))
      }, DEVICE_TIMEOUT_MS)
      userMediaPromise.finally(() => clearTimeout(timer))
    })

    const stream = await Promise.race([userMediaPromise, timeoutPromise])
    stopStream(stream)
    lateStream = null

    return {
      state: 'passed',
      message: 'Microphone is connected and capturing audio.',
    }
  } catch (error: unknown) {
    if (lateStream) {
      stopStream(lateStream)
      lateStream = null
    }

    const err = error as { message?: string; name?: string }
    if (err?.message === 'MIC_TIMEOUT') {
      return {
        state: 'timed_out',
        message: 'Microphone check timed out after 8 seconds.',
        details: 'Check that your microphone is plugged in and not exclusively captured by another app.',
      }
    }

    const name = error instanceof DOMException ? error.name : err?.name || ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      return {
        state: 'permission_denied',
        message: 'Microphone access was denied.',
        details: 'Microphone access is mandatory. Click the lock icon in the address bar to allow microphone access.',
      }
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        state: 'unavailable',
        message: 'No microphone hardware detected.',
        details: 'Please connect a working microphone or headset to proceed with the interview.',
      }
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        state: 'failed',
        message: 'Microphone is currently in use by another application.',
        details: 'Close any communication apps using your microphone and retry.',
      }
    }
    return {
      state: 'failed',
      message: err?.message || 'Microphone check failed.',
      details: 'Please verify your audio settings and retry.',
    }
  }
}

async function runConnectionCheck(): Promise<CheckItemState> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      state: 'unavailable',
      message: 'No internet connection detected.',
      details: 'Check your Wi-Fi or Ethernet connection and retry.',
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS)

  try {
    const response = await fetch('/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      return {
        state: 'passed',
        message: 'Connected to interview platform server.',
      }
    }
    return {
      state: 'failed',
      message: `Interview server returned status code ${response.status}.`,
      details: 'The platform backend may be temporarily experiencing issues.',
    }
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const err = error as { name?: string }
    if (err?.name === 'AbortError') {
      return {
        state: 'timed_out',
        message: 'Connection check timed out reaching the server.',
        details: 'The server did not respond within 5 seconds. Check your internet connection.',
      }
    }
    return {
      state: 'failed',
      message: 'Unable to reach the interview platform server.',
      details: 'Verify your network connection and proxy settings, then retry.',
    }
  }
}

export function IntervieweeSystemCheckPage() {
  const [searchParams] = useSearchParams()
  const interviewId = searchParams.get('interviewId')

  const [checks, setChecks] = useState<Record<CheckId, CheckItemState>>({
    browser: idleItem(),
    camera: idleItem(),
    microphone: idleItem(),
    connection: idleItem(),
  })

  const [isCompleted, setIsCompleted] = useState(false)
  const isRunningRef = useRef(false)
  const hasMountedRef = useRef(false)

  // Single check runner with independent state updates
  const executeCheck = useCallback(async (id: CheckId) => {
    setChecks((prev) => ({ ...prev, [id]: checkingItem() }))

    let result: CheckItemState
    if (id === 'browser') {
      result = await runBrowserCheck()
    } else if (id === 'camera') {
      result = await runCameraCheck()
    } else if (id === 'microphone') {
      result = await runMicrophoneCheck()
    } else {
      result = await runConnectionCheck()
    }

    setChecks((prev) => ({ ...prev, [id]: result }))
    return result
  }, [])

  // Sequential runner for all mandatory checks
  const runAllChecks = useCallback(async () => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    setIsCompleted(false)

    try {
      for (const id of MANDATORY_CHECKS) {
        await executeCheck(id)
      }
    } finally {
      isRunningRef.current = false
    }
  }, [executeCheck])

  // Mount effect: run checks once without re-triggering loop
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      runAllChecks()
    }
  }, [runAllChecks])

  const mandatoryPassed = MANDATORY_CHECKS.every((id) => checks[id].state === 'passed')
  const isRunning = MANDATORY_CHECKS.some((id) => checks[id].state === 'checking')
  const canContinue = mandatoryPassed && !isCompleted && !isRunning

  const stateBadge = (state: CheckState) => {
    switch (state) {
      case 'checking':
        return (
          <Badge variant="neutral" className="bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <span>Checking...</span>
          </Badge>
        )
      case 'passed':
        return (
          <Badge variant="neutral" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>Ready</span>
          </Badge>
        )
      case 'permission_denied':
        return (
          <Badge variant="neutral" className="bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>Permission Required</span>
          </Badge>
        )
      case 'unavailable':
        return (
          <Badge variant="neutral" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 gap-1.5">
            <XCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            <span>Device Missing</span>
          </Badge>
        )
      case 'timed_out':
        return (
          <Badge variant="neutral" className="bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>Timed Out</span>
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="neutral" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 gap-1.5">
            <XCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            <span>Failed</span>
          </Badge>
        )
      default:
        return (
          <Badge variant="neutral" className="bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400 gap-1.5">
            <span className="h-2 w-2 rounded-full bg-surface-400" aria-hidden="true" />
            <span>Pending</span>
          </Badge>
        )
    }
  }

  const checkRows: Array<{ id: CheckId; icon: typeof Camera; title: string; subtitle: string }> = [
    {
      id: 'camera',
      icon: Camera,
      title: 'Camera Check',
      subtitle: 'Mandatory — Web video feed for interview interaction and AI monitoring',
    },
    {
      id: 'microphone',
      icon: Mic,
      title: 'Microphone Check',
      subtitle: 'Mandatory — Audio feed for clear dialogue with the interviewer',
    },
    {
      id: 'connection',
      icon: typeof navigator !== 'undefined' && navigator.onLine ? Wifi : WifiOff,
      title: 'Server Connection',
      subtitle: 'Mandatory — Low latency reachability to the InterviewGuard platform',
    },
    {
      id: 'browser',
      icon: Monitor,
      title: 'Browser Compatibility',
      subtitle: 'Mandatory — WebRTC media stream and signaling support',
    },
  ]

  if (isCompleted) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div>
          <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 mb-2">
            <Link to="/interviewee/interviews">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to my interviews
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">System Check</h1>
        </div>

        <Card className="border-emerald-300 dark:border-emerald-800 shadow-sm">
          <CardContent className="py-12 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/80 flex items-center justify-center mx-auto mb-4 border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="h-9 w-9 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-surface-900 dark:text-surface-50">
              System Check Passed!
            </h2>
            <p className="text-surface-600 dark:text-surface-400 mt-2 max-w-md mx-auto text-sm leading-relaxed">
              Your camera, microphone, browser, and network connection meet all requirements. You are fully ready to join your interview session.
            </p>

            <div className="flex justify-center flex-wrap gap-3 mt-8">
              <Button
                variant="neutral"
                onClick={() => {
                  setIsCompleted(false)
                  runAllChecks()
                }}
              >
                Run checks again
              </Button>

              {interviewId ? (
                <Button asChild className="gap-2">
                  <Link to={`/interviewee/interviews/${encodeURIComponent(interviewId)}/room`}>
                    Enter Interview Room
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/interviewee/interviews">Go to My Interviews</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 mb-2">
          <Link to="/interviewee/interviews">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to my interviews
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">
          Pre-Interview System Check
        </h1>
        <p className="text-surface-600 dark:text-surface-400 mt-1 text-sm">
          Both <strong>Camera</strong> and <strong>Microphone</strong> are mandatory to ensure fair interview conduct. All device checks execute entirely inside your browser.
        </p>
      </div>

      <Card className="border-surface-200 dark:border-surface-800 shadow-sm">
        <CardContent className="divide-y divide-surface-100 dark:divide-surface-800 p-0">
          {checkRows.map(({ id, icon: Icon, title, subtitle }) => {
            const check = checks[id]
            const canRetry =
              check.state === 'permission_denied' ||
              check.state === 'unavailable' ||
              check.state === 'timed_out' ||
              check.state === 'failed'

            return (
              <div key={id} className="p-4 sm:p-5 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="p-2.5 rounded-xl bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 shrink-0 mt-0.5">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-semibold text-sm text-surface-900 dark:text-surface-50">
                          {title}
                        </span>
                        {stateBadge(check.state)}
                      </div>
                      <p className="text-xs text-surface-500 dark:text-surface-400">
                        {subtitle}
                      </p>
                      {check.message && (
                        <p
                          className={cn(
                            'text-xs font-medium pt-1',
                            check.state === 'passed' && 'text-emerald-700 dark:text-emerald-300',
                            check.state === 'permission_denied' && 'text-amber-700 dark:text-amber-300',
                            (check.state === 'unavailable' || check.state === 'failed' || check.state === 'timed_out') &&
                              'text-rose-700 dark:text-rose-300'
                          )}
                        >
                          {check.message}
                        </p>
                      )}
                      {check.details && (
                        <p className="text-xs text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-800/80 p-2 rounded-lg border border-surface-200/60 dark:border-surface-700/60 mt-1.5">
                          {check.details}
                        </p>
                      )}
                    </div>
                  </div>

                  {canRetry && (
                    <Button
                      variant="neutral"
                      size="sm"
                      className="gap-1.5 shrink-0 text-xs"
                      onClick={() => executeCheck(id)}
                      disabled={isRunning}
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden="true" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="border-surface-200 dark:border-surface-800 shadow-sm">
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="text-sm">
            <p className="font-medium text-surface-900 dark:text-surface-100">
              {mandatoryPassed
                ? 'All mandatory checks passed successfully!'
                : 'All 4 system checks are required to join the interview.'}
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              {mandatoryPassed
                ? 'Click "Continue" to proceed to your scheduled interview session.'
                : 'Please resolve any issues or permissions and retry the checks.'}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
            <Button
              variant="neutral"
              className="gap-2 flex-1 sm:flex-none"
              onClick={runAllChecks}
              disabled={isRunning}
            >
              <RefreshCw className={cn('h-4 w-4', isRunning && 'animate-spin')} aria-hidden="true" />
              Run All Checks
            </Button>

            <Button
              className="flex-1 sm:flex-none"
              disabled={!canContinue}
              aria-disabled={!canContinue}
              title={
                canContinue
                  ? undefined
                  : 'All 4 checks (Camera, Microphone, Connection, and Browser) must pass before continuing.'
              }
              onClick={() => setIsCompleted(true)}
            >
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
