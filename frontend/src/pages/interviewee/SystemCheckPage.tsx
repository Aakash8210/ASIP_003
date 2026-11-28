import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
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
// All hardware checks execute locally in non-blocking async blocks with deterministic
// cleanup on unmount to avoid track leaks or render loops.

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
const WAVEFORM_BARS = 20

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
    message: 'WebRTC & MediaDevices APIs verified.',
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

  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [audioBars, setAudioBars] = useState<number[]>(() => Array(WAVEFORM_BARS).fill(12))
  const [isCompleted, setIsCompleted] = useState(false)

  // Refs for leak-free hardware lifecycle
  const mountedRef = useRef(true)
  const isRunningRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafIdRef = useRef<number | null>(null)

  const cleanupAudioVisualizer = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    stopStream(micStreamRef.current)
    micStreamRef.current = null
  }, [])

  const cleanupCameraPreview = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    stopStream(cameraStreamRef.current)
    cameraStreamRef.current = null
  }, [])

  const cleanupAllHardware = useCallback(() => {
    cleanupAudioVisualizer()
    cleanupCameraPreview()
  }, [cleanupAudioVisualizer, cleanupCameraPreview])

  const startCameraPreview = useCallback(async (): Promise<CheckItemState> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return {
        state: 'unavailable',
        message: 'Camera access is not available in this browser.',
        details: 'Check your browser security settings or use an updated browser.',
      }
    }

    cleanupCameraPreview()
    let lateStream: MediaStream | null = null

    try {
      const userMediaPromise = navigator.mediaDevices
        .getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        })
        .then((s) => {
          lateStream = s
          return s
        })

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('CAMERA_TIMEOUT')), DEVICE_TIMEOUT_MS)
        userMediaPromise.finally(() => clearTimeout(timer))
      })

      const stream = await Promise.race([userMediaPromise, timeoutPromise])
      if (!mountedRef.current) {
        stopStream(stream)
        return { state: 'idle', message: null }
      }

      cameraStreamRef.current = stream
      lateStream = null

      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      return {
        state: 'passed',
        message: 'Camera stream active (16:9 HD preview).',
      }
    } catch (error: unknown) {
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
          details: 'Allow Camera permissions in your browser address bar and retry.',
        }
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return {
          state: 'unavailable',
          message: 'No camera hardware detected.',
          details: 'Connect a working webcam and click retry.',
        }
      }
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        return {
          state: 'failed',
          message: 'Camera is busy or cannot be opened.',
          details: 'Close other video applications using the camera and retry.',
        }
      }
      return {
        state: 'failed',
        message: err?.message || 'Camera check encountered an unexpected error.',
      }
    }
  }, [cleanupCameraPreview])

  const startMicVisualizer = useCallback(async (): Promise<CheckItemState> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return {
        state: 'unavailable',
        message: 'Microphone access is not available in this browser.',
      }
    }

    cleanupAudioVisualizer()
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
        const timer = setTimeout(() => reject(new Error('MIC_TIMEOUT')), DEVICE_TIMEOUT_MS)
        userMediaPromise.finally(() => clearTimeout(timer))
      })

      const stream = await Promise.race([userMediaPromise, timeoutPromise])
      if (!mountedRef.current) {
        stopStream(stream)
        return { state: 'idle', message: null }
      }

      micStreamRef.current = stream
      lateStream = null

      // Initialize Web Audio AnalyserNode safely (non-blocking)
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        audioCtxRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 64
        source.connect(analyser)

        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        let lastFrameTime = 0

        const tick = (now: number) => {
          if (!mountedRef.current || !audioCtxRef.current) return
          if (now - lastFrameTime >= 50) {
            lastFrameTime = now
            analyser.getByteFrequencyData(dataArray)
            const nextBars: number[] = []
            for (let i = 0; i < WAVEFORM_BARS; i++) {
              const val = dataArray[i % dataArray.length] || 0
              nextBars.push(Math.max(12, Math.min(100, Math.round((val / 255) * 100))))
            }
            setAudioBars(nextBars)
          }
          rafIdRef.current = requestAnimationFrame(tick)
        }
        rafIdRef.current = requestAnimationFrame(tick)
      }

      return {
        state: 'passed',
        message: 'Microphone capturing live audio.',
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
        }
      }
      const name = error instanceof DOMException ? error.name : err?.name || ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        return {
          state: 'permission_denied',
          message: 'Microphone access was denied.',
          details: 'Allow Microphone permissions in your browser address bar and retry.',
        }
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return {
          state: 'unavailable',
          message: 'No microphone hardware detected.',
        }
      }
      return {
        state: 'failed',
        message: err?.message || 'Microphone check failed.',
      }
    }
  }, [cleanupAudioVisualizer])

  const runConnectionPing = useCallback(async (): Promise<CheckItemState> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLatencyMs(null)
      return {
        state: 'unavailable',
        message: 'No internet connection detected.',
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS)
    const started = performance.now()

    try {
      const response = await fetch('/health', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const rtt = Math.max(1, Math.round(performance.now() - started))

      if (mountedRef.current && response.ok) {
        setLatencyMs(rtt)
        return {
          state: 'passed',
          message: `Connected (${rtt}ms RTT — Stable).`,
        }
      }
      return {
        state: 'failed',
        message: `Server returned status ${response.status}.`,
      }
    } catch (error: unknown) {
      clearTimeout(timeoutId)
      setLatencyMs(null)
      const err = error as { name?: string }
      if (err?.name === 'AbortError') {
        return {
          state: 'timed_out',
          message: 'Connection check timed out.',
        }
      }
      return {
        state: 'failed',
        message: 'Unable to reach interview server.',
      }
    }
  }, [])

  // Attach video stream if ref mounts after stream arrived
  useEffect(() => {
    if (videoRef.current && cameraStreamRef.current && videoRef.current.srcObject !== cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current
    }
  }, [checks.camera.state])

  const executeCheck = useCallback(
    async (id: CheckId) => {
      if (!mountedRef.current) return
      setChecks((prev) => ({ ...prev, [id]: checkingItem() }))

      let result: CheckItemState
      if (id === 'browser') {
        result = await runBrowserCheck()
      } else if (id === 'camera') {
        result = await startCameraPreview()
      } else if (id === 'microphone') {
        result = await startMicVisualizer()
      } else {
        result = await runConnectionPing()
      }

      if (mountedRef.current) {
        setChecks((prev) => ({ ...prev, [id]: result }))
      }
    },
    [startCameraPreview, startMicVisualizer, runConnectionPing]
  )

  const runAllChecks = useCallback(async () => {
    if (isRunningRef.current) return
    isRunningRef.current = true
    setIsCompleted(false)

    try {
      for (const id of MANDATORY_CHECKS) {
        if (!mountedRef.current) break
        await executeCheck(id)
      }
    } finally {
      isRunningRef.current = false
    }
  }, [executeCheck])

  useEffect(() => {
    mountedRef.current = true
    runAllChecks()
    return () => {
      mountedRef.current = false
      cleanupAllHardware()
    }
  }, [runAllChecks, cleanupAllHardware])

  const passedCount = MANDATORY_CHECKS.filter((id) => checks[id].state === 'passed').length
  const mandatoryPassed = passedCount === MANDATORY_CHECKS.length
  const isRunning = MANDATORY_CHECKS.some((id) => checks[id].state === 'checking')
  const progressPct = Math.round((passedCount / MANDATORY_CHECKS.length) * 100)

  const stateBadge = (state: CheckState) => {
    switch (state) {
      case 'checking':
        return (
          <Badge variant="info" className="gap-1.5 font-mono text-[11px]">
            <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
            Checking
          </Badge>
        )
      case 'passed':
        return (
          <Badge variant="success" className="gap-1.5 font-mono text-[11px]">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Operational
          </Badge>
        )
      case 'permission_denied':
        return (
          <Badge variant="warning" className="gap-1.5 font-mono text-[11px]">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Permission Needed
          </Badge>
        )
      case 'unavailable':
      case 'failed':
        return (
          <Badge variant="danger" className="gap-1.5 font-mono text-[11px]">
            <XCircle className="h-3 w-3" aria-hidden="true" />
            Unavailable
          </Badge>
        )
      case 'timed_out':
        return (
          <Badge variant="warning" className="gap-1.5 font-mono text-[11px]">
            <Clock className="h-3 w-3" aria-hidden="true" />
            Timed Out
          </Badge>
        )
      default:
        return (
          <Badge variant="neutral" className="gap-1.5 font-mono text-[11px]">
            Pending
          </Badge>
        )
    }
  }

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
          <h1 className="text-2xl font-semibold tracking-tight text-surface-900 dark:text-white">
            System Check
          </h1>
        </div>

        <Card className="border-emerald-500/30 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-emerald-500" />
          <CardContent className="py-12 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="h-8 w-8 text-emerald-500" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-semibold text-surface-900 dark:text-white">
              Hardware &amp; Network Verified
            </h2>
            <p className="text-surface-600 dark:text-zinc-400 mt-2 max-w-md mx-auto text-sm leading-relaxed">
              Your camera, microphone, WebRTC engine, and server connection are ready. Hardware streams have been released for room entry.
            </p>

            <div className="flex justify-center flex-wrap gap-3 mt-8">
              <Button
                variant="outline"
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
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
    <div className="space-y-6 max-w-5xl mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 mb-2">
            <Link to="/interviewee/interviews">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to my interviews
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-surface-900 dark:text-white">
            Pre-Interview Hardware Console
          </h1>
          <p className="text-sm text-surface-500 dark:text-zinc-400 mt-1">
            Verify your live webcam feed, microphone waveform, and WebRTC latency before joining.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {latencyMs !== null && (
            <Badge variant="success" className="font-mono text-xs gap-1.5 py-1 px-3">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {latencyMs}ms · Stable
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={runAllChecks}
            disabled={isRunning}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRunning && 'animate-spin')} />
            Re-run all
          </Button>
        </div>
      </div>

      {/* Live Hardware Console Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Camera Viewfinder */}
        <Card className="lg:col-span-7 overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-200 dark:border-white/[0.07] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                <Camera className="h-3.5 w-3.5 text-brand-500" aria-hidden="true" />
              </div>
              <span className="text-sm font-medium text-surface-900 dark:text-zinc-100">
                Camera Viewfinder
              </span>
            </div>
            {checks.camera.state === 'passed' ? (
              <Badge variant="success" className="font-mono text-[11px] gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Camera Operational
              </Badge>
            ) : (
              stateBadge(checks.camera.state)
            )}
          </div>

          <div className="p-4">
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-surface-950 border border-surface-200 dark:border-white/[0.08]">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={cn(
                  'w-full h-full object-cover scale-x-[-1] transition-opacity duration-300',
                  checks.camera.state === 'passed' ? 'opacity-100' : 'opacity-0'
                )}
              />

              {/* Subtle Corner Gridlines */}
              <div className="pointer-events-none absolute inset-4 border border-white/10 rounded-lg">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-brand-500/50 rounded-tl" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-brand-500/50 rounded-tr" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-brand-500/50 rounded-bl" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-brand-500/50 rounded-br" />
              </div>

              {checks.camera.state !== 'passed' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <Camera className="h-8 w-8 text-zinc-500 mb-2" />
                  <p className="text-sm font-medium text-zinc-200">
                    {checks.camera.state === 'checking'
                      ? 'Initializing camera stream...'
                      : checks.camera.message || 'Camera preview unavailable'}
                  </p>
                  {checks.camera.details && (
                    <p className="text-xs text-zinc-400 mt-1 max-w-sm">{checks.camera.details}</p>
                  )}
                  {checks.camera.state !== 'checking' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => executeCheck('camera')}
                      className="mt-4"
                    >
                      Retry Camera
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Right Diagnostics Stack: Mic Visualizer + Network + Browser */}
        <div className="lg:col-span-5 space-y-4">
          {/* Audio Visualizer Card */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Mic className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-surface-900 dark:text-zinc-100">
                      Microphone Input
                    </p>
                    <p className="text-[11px] text-surface-500 dark:text-zinc-400">
                      Speak normally to verify live waveform
                    </p>
                  </div>
                </div>
                {stateBadge(checks.microphone.state)}
              </div>

              {/* Dynamic Waveform Bars */}
              <div
                className="h-16 rounded-lg border border-surface-200 dark:border-white/[0.07] bg-surface-50 dark:bg-[#08090E] px-3 flex items-center justify-between gap-1"
                aria-label="Live microphone waveform"
              >
                {audioBars.map((height, i) => (
                  <div
                    key={i}
                    style={{ height: `${checks.microphone.state === 'passed' ? height : 12}%` }}
                    className={cn(
                      'flex-1 rounded-full transition-all duration-75',
                      checks.microphone.state === 'passed'
                        ? height > 55
                          ? 'bg-brand-500'
                          : 'bg-emerald-500/80'
                        : 'bg-surface-300 dark:bg-white/10'
                    )}
                  />
                ))}
              </div>

              {checks.microphone.state !== 'passed' && checks.microphone.state !== 'checking' && checks.microphone.state !== 'idle' && (
                <div className="flex items-center justify-between gap-2 text-xs text-rose-500">
                  <span className="truncate">{checks.microphone.message}</span>
                  <Button size="sm" variant="outline" onClick={() => executeCheck('microphone')}>
                    Retry
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connection & Ping Card */}
          <Card>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                  {typeof navigator !== 'undefined' && navigator.onLine ? (
                    <Wifi className="h-4 w-4 text-brand-500" aria-hidden="true" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-rose-500" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-surface-900 dark:text-zinc-100">
                    Connection &amp; Ping
                  </p>
                  <p className="text-xs font-mono text-surface-500 dark:text-zinc-400 truncate">
                    {checks.connection.message || 'Measuring platform RTT...'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {stateBadge(checks.connection.state)}
              </div>
            </CardContent>
          </Card>

          {/* Browser & WebRTC Permissions Card */}
          <Card>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Monitor className="h-4 w-4 text-amber-500" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-surface-900 dark:text-zinc-100">
                    Browser &amp; WebRTC
                  </p>
                  <p className="text-xs text-surface-500 dark:text-zinc-400 truncate">
                    {checks.browser.message || 'Verifying RTCPeerConnection support...'}
                  </p>
                </div>
              </div>
              <div className="shrink-0">{stateBadge(checks.browser.state)}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Status Action Drawer */}
      <Card className="relative overflow-hidden">
        <div
          className="absolute top-0 left-0 h-0.5 bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-surface-900 dark:text-white tabular-nums">
                {passedCount} of {MANDATORY_CHECKS.length} checks completed
              </span>
              <Badge variant={mandatoryPassed ? 'success' : 'neutral'} className="font-mono text-[10px]">
                {progressPct}%
              </Badge>
            </div>
            <p className="text-xs text-surface-500 dark:text-zinc-400">
              {mandatoryPassed
                ? 'All hardware and network prerequisites verified. Ready to enter the interview room.'
                : 'Complete all 4 mandatory checks above to unlock interview room entry.'}
            </p>
          </div>

          <motion.div
            animate={mandatoryPassed ? { scale: [1, 1.02, 1] } : {}}
            transition={{ duration: 0.35 }}
            className="shrink-0"
          >
            {interviewId ? (
              <Button
                disabled={!mandatoryPassed || isRunning}
                onClick={() => {
                  cleanupAllHardware()
                  setIsCompleted(true)
                }}
                className="gap-2 px-5"
              >
                Enter Interview
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                disabled={!mandatoryPassed || isRunning}
                onClick={() => {
                  cleanupAllHardware()
                  setIsCompleted(true)
                }}
                className="gap-2 px-5"
              >
                Confirm System Readiness
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </motion.div>
        </CardContent>
      </Card>
    </div>
  )
}
