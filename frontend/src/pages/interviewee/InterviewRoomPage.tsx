import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CameraOff,
  Clock,
  Info,
  LogOut,
  Mic,
  MicOff,
  PhoneOff,
  Shield,
  ShieldCheck,
  User,
  Video as VideoIcon,
  VideoOff,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { apiClient, ApiError, InterviewRoomContext } from '@/lib/api'
import { formatInterviewDate } from '@/pages/hr/interviewStatus'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useWebcamCapture } from '@/hooks/useWebcamCapture'

// Interview Room — Candidate Experience (Phase 10, 11 & 12, UX-CAN-003, PRD-FR-004/005, SRS-FR-008/009/011)
// Provides a real-time communication session connecting candidate and interviewer via WebRTC with controlled webcam frame capture.
// Per Phase 12 boundaries: Computer Vision, behavioral signals, and risk scoring are strictly deferred to Phase 13+.

export function IntervieweeInterviewRoomPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [room, setRoom] = useState<InterviewRoomContext | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const [showDisclosureModal, setShowDisclosureModal] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Video element refs for WebRTC streams
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)

  // Real-time WebRTC and Socket.io signaling hook
  const {
    localStream,
    remoteStream,
    signalingState,
    signalingError,
    peerConnectionState,
    mediaError,
    isMicMuted,
    isVideoDisabled,
    remoteParticipant,
    toggleAudio,
    toggleVideo,
    retryMedia,
  } = useWebRTC({
    interviewId: id,
    enabled: room?.interview.status === 'in_progress',
  })

  // Webcam frame capture engine (Phase 12, PRD-FR-005, SRS-FR-008/011)
  const {
    captureState,
    isCapturing,
    transmittedCount,
    lastFrameMetadata,
    lastError: captureError,
  } = useWebcamCapture({
    interviewId: id,
    stream: localStream,
    videoElement: localVideoRef.current,
    videoRef: localVideoRef,
    enabled: room?.interview.status === 'in_progress',
    isVideoDisabled,
    intervalMs: 1000,
  })

  // Bind local video stream to candidate self-view
  useEffect(() => {
    if (localVideoRef.current && localStream && !isVideoDisabled) {
      localVideoRef.current.srcObject = localStream
      localVideoRef.current.play().catch(() => {})
    }
  }, [localStream, isVideoDisabled])

  // Bind remote video stream to interviewer view
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
      remoteVideoRef.current.play().catch(() => {})
    }
  }, [remoteStream])

  const loadRoom = useCallback(async () => {
    if (!id) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await apiClient.getIntervieweeRoom(id)
      setRoom(response.room)

      // If the session has already completed, navigate to completion screen
      if (response.room.interview.status === 'completed') {
        navigate(`/interviewee/interviews/${id}/completed`, { replace: true })
        return
      }

      // If not yet started, automatically join to transition into active room
      if (response.room.interview.status !== 'in_progress') {
        setIsJoining(true)
        try {
          const joinRes = await apiClient.joinIntervieweeRoom(id)
          setRoom(joinRes.room)
        } catch (joinError) {
          console.error('Failed to auto-join candidate room:', joinError)
          if (joinError instanceof ApiError) {
            setLoadError(`Unable to join interview session: ${joinError.message}`)
          }
        } finally {
          setIsJoining(false)
        }
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setLoadError(
          error.statusCode === 403
            ? 'You are not authorized to enter this interview room.'
            : error.statusCode === 404
              ? 'Interview room not found.'
              : error.message
        )
      } else {
        setLoadError('Failed to connect to the interview room.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [id, navigate])

  useEffect(() => {
    loadRoom()
  }, [loadRoom])

  // Session elapsed timer
  useEffect(() => {
    if (room?.interview.status !== 'in_progress') return
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [room?.interview.status])

  const formatElapsed = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const handleLeave = async () => {
    if (!id) return
    setIsLeaving(true)
    try {
      await apiClient.leaveIntervieweeRoom(id)
    } catch {
      // Graceful navigation even if network fails
    } finally {
      setIsLeaving(false)
      navigate('/interviewee/interviews')
    }
  }

  if (isLoading || isJoining) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4" aria-busy="true">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-brand-500 border-t-transparent" />
        <p className="text-surface-600 dark:text-surface-400 font-medium">
          Connecting to interview room...
        </p>
      </div>
    )
  }

  if (loadError || !room) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Button variant="ghost" size="sm" asChild className="gap-2 -ml-2 mb-4">
          <Link to="/interviewee/interviews">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to My Interviews
          </Link>
        </Button>
        <Card className="border-surface-200 dark:border-surface-800">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">
              Room Unavailable
            </h2>
            <p className="text-surface-500 dark:text-surface-400 text-sm mt-2 max-w-md mx-auto">
              {loadError ?? 'The interview session is unavailable or you do not have permission to access it.'}
            </p>
            <div className="mt-6">
              <Button asChild>
                <Link to="/interviewee/interviews">Return to My Interviews</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface-50 dark:bg-surface-800/80 p-4 rounded-xl border border-surface-200 dark:border-surface-700">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-brand-50 dark:bg-brand-900/30">
            <VideoIcon className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-surface-900 dark:text-surface-50 truncate">
              {room.interview.title}
            </h1>
            <p className="text-xs text-surface-500 dark:text-surface-400">
              Scheduled start: {formatInterviewDate(room.interview.scheduled_start_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-100 dark:bg-surface-700 text-xs font-mono text-surface-700 dark:text-surface-300">
            <Clock className="h-3.5 w-3.5 text-surface-500" aria-hidden="true" />
            <span>{formatElapsed(elapsedSeconds)}</span>
          </div>

          {/* Signaling State Badge */}
          {signalingState === 'connected' ? (
            <Badge variant="neutral" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
              <Wifi className="h-3 w-3 mr-1" aria-hidden="true" />
              Signaling: Connected
            </Badge>
          ) : signalingState === 'connecting' ? (
            <Badge variant="neutral" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300">
              <Wifi className="h-3 w-3 mr-1 animate-pulse" aria-hidden="true" />
              Signaling: Connecting
            </Badge>
          ) : (
            <Badge variant="neutral" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300">
              <WifiOff className="h-3 w-3 mr-1" aria-hidden="true" />
              Signaling: Disconnected
            </Badge>
          )}

          {/* WebRTC Peer Connection Badge */}
          {peerConnectionState === 'connected' ? (
            <Badge variant="neutral" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 mr-1.5" />
              P2P: Connected
            </Badge>
          ) : peerConnectionState === 'connecting' ? (
            <Badge variant="neutral" className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300">
              <span className="h-2 w-2 rounded-full bg-sky-500 mr-1.5 animate-pulse" />
              P2P: Connecting
            </Badge>
          ) : (
            <Badge variant="neutral" className="bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-800 dark:text-surface-400">
              <span className="h-2 w-2 rounded-full bg-surface-400 mr-1.5" />
              Waiting for Peer
            </Badge>
          )}

          {/* Webcam Frame Capture Badge (Phase 12) */}
          {captureState === 'capturing' || captureState === 'transmitting' || captureState === 'ready' ? (
            <Badge variant="neutral" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
              <Camera className="h-3 w-3 mr-1" aria-hidden="true" />
              Capture: Active ({transmittedCount})
            </Badge>
          ) : captureState === 'paused' ? (
            <Badge variant="neutral" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300">
              <CameraOff className="h-3 w-3 mr-1" aria-hidden="true" />
              Capture: Paused
            </Badge>
          ) : captureState === 'waiting-for-camera' ? (
            <Badge variant="neutral" className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300">
              <Camera className="h-3 w-3 mr-1 animate-pulse" aria-hidden="true" />
              Capture: Initializing
            </Badge>
          ) : captureState === 'error' ? (
            <Badge variant="neutral" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300">
              <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
              Capture: Error
            </Badge>
          ) : (
            <Badge variant="neutral" className="bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-800 dark:text-surface-400">
              <Camera className="h-3 w-3 mr-1" aria-hidden="true" />
              Capture: Standby
            </Badge>
          )}

          <Button
            variant="neutral"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setShowDisclosureModal(true)}
          >
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            Monitoring Notice
          </Button>

          <Button
            variant="danger"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowExitModal(true)}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Leave Room
          </Button>
        </div>
      </div>

      {/* Signaling Warning Banner */}
      {signalingError && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Signaling notice: {signalingError}</span>
          </div>
        </div>
      )}

      {/* Main Video Layout Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Remote Interviewer View */}
        <Card className="border-surface-200 dark:border-surface-800 bg-surface-900 text-white min-h-[340px] flex flex-col justify-between overflow-hidden relative">
          <div className="p-3 flex items-center justify-between z-10">
            <span className="text-xs font-medium px-2 py-1 rounded bg-black/50 backdrop-blur-sm">
              {remoteParticipant?.name || room.interviewer?.name || 'Assigned Interviewer'}
            </span>
            <Badge variant="neutral" className="bg-brand-500/80 text-white text-[11px] border-none">
              Interviewer
            </Badge>
          </div>

          {remoteStream ? (
            <div className="absolute inset-0 z-0 bg-black flex items-center justify-center">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center my-auto p-6 text-center z-10">
              <div className="w-20 h-20 rounded-full bg-surface-800 flex items-center justify-center mb-3 border-2 border-surface-700">
                <User className="h-10 w-10 text-surface-400" aria-hidden="true" />
              </div>
              <p className="font-medium text-surface-200">
                {remoteParticipant?.name || room.interviewer?.name || 'Interviewer'}
              </p>
              <p className="text-xs text-surface-400 mt-1 max-w-xs">
                {peerConnectionState === 'connecting'
                  ? 'Establishing peer-to-peer connection...'
                  : remoteParticipant
                    ? 'Interviewer is in the room. Negotiating video stream...'
                    : 'Waiting for interviewer to join the session...'}
              </p>
            </div>
          )}

          <div className="p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between text-xs text-surface-300 z-10">
            <span className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  remoteStream
                    ? 'bg-emerald-400'
                    : remoteParticipant
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-surface-500'
                }`}
              />
              {remoteStream
                ? 'Live Video Stream'
                : remoteParticipant
                  ? 'Participant In Room'
                  : 'Waiting for Peer'}
            </span>
            <span className="text-surface-400 text-xs">Remote Feed</span>
          </div>
        </Card>

        {/* Candidate Self View */}
        <Card className="border-surface-200 dark:border-surface-800 bg-surface-950 text-white min-h-[340px] flex flex-col justify-between overflow-hidden relative">
          <div className="p-3 flex items-center justify-between z-10">
            <span className="text-xs font-medium px-2 py-1 rounded bg-black/50 backdrop-blur-sm">
              {room.candidate?.name ?? 'You (Candidate)'}
            </span>
            <span className="text-[11px] text-surface-400">Self View</span>
          </div>

          {localStream && !isVideoDisabled ? (
            <div className="absolute inset-0 z-0 bg-black flex items-center justify-center">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center my-auto p-6 text-center z-10">
              <div className="w-20 h-20 rounded-full bg-surface-800 flex items-center justify-center mb-3 border-2 border-surface-700">
                {isVideoDisabled ? (
                  <VideoOff className="h-10 w-10 text-rose-400" aria-hidden="true" />
                ) : (
                  <User className="h-10 w-10 text-brand-400" aria-hidden="true" />
                )}
              </div>
              <p className="font-medium text-surface-200">
                {room.candidate?.name ?? 'Candidate'}
              </p>
              <p className="text-xs text-surface-400 mt-1 max-w-xs">
                {isVideoDisabled
                  ? 'Camera preview is currently toggled off.'
                  : mediaError
                    ? mediaError
                    : 'Initializing local camera preview...'}
              </p>
              {mediaError && (
                <Button
                  variant="neutral"
                  size="sm"
                  className="mt-3 text-xs gap-1.5"
                  onClick={retryMedia}
                >
                  Retry Camera Access
                </Button>
              )}
            </div>
          )}

          <div className="p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between text-xs text-surface-300 z-10">
            <div className="flex items-center gap-2">
              {isMicMuted ? (
                <span className="flex items-center gap-1 text-rose-400">
                  <MicOff className="h-3.5 w-3.5" /> Muted
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Mic className="h-3.5 w-3.5" /> Mic Ready
                </span>
              )}
              {isVideoDisabled && (
                <span className="flex items-center gap-1 text-rose-400">
                  <VideoOff className="h-3.5 w-3.5" /> Video Off
                </span>
              )}
              {isCapturing && !isVideoDisabled && (
                <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/70 border border-emerald-800 px-1.5 py-0.5 rounded text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Sampling 1 fps
                </span>
              )}
            </div>
            <span className="text-surface-400 text-xs">Interviewee</span>
          </div>
        </Card>
      </div>

      {/* Control Bar */}
      <div className="bg-surface-50 dark:bg-surface-800/80 p-3 rounded-xl border border-surface-200 dark:border-surface-700 flex items-center justify-center gap-4">
        <Button
          variant={isMicMuted ? 'danger' : 'neutral'}
          size="sm"
          className="gap-2"
          onClick={() => toggleAudio()}
          aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMicMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {isMicMuted ? 'Unmute' : 'Mute'}
        </Button>

        <Button
          variant={isVideoDisabled ? 'danger' : 'neutral'}
          size="sm"
          className="gap-2"
          onClick={() => toggleVideo()}
          aria-label={isVideoDisabled ? 'Turn video on' : 'Turn video off'}
        >
          {isVideoDisabled ? <VideoOff className="h-4 w-4" /> : <VideoIcon className="h-4 w-4" />}
          {isVideoDisabled ? 'Start Video' : 'Stop Video'}
        </Button>

        <Button
          variant="danger"
          size="sm"
          className="gap-2"
          onClick={() => setShowExitModal(true)}
        >
          <PhoneOff className="h-4 w-4" />
          Leave
        </Button>
      </div>

      {/* Exit Confirmation Modal */}
      <Modal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        title="Leave Interview Room?"
        description="You can safely return to your candidate dashboard. If the interview is ongoing, you may re-enter from your interviews page."
      >
        <div className="space-y-4 pt-2">
          <p className="text-sm text-surface-600 dark:text-surface-400">
            Are you sure you want to exit the interview room now?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="neutral" onClick={() => setShowExitModal(false)} disabled={isLeaving}>
              Stay in Room
            </Button>
            <Button variant="danger" onClick={handleLeave} loading={isLeaving}>
              Leave Room
            </Button>
          </div>
        </div>
      </Modal>

      {/* Monitoring Disclosure Modal (UX-CAN-003, CLAUDE.md §3) */}
      <Modal
        isOpen={showDisclosureModal}
        onClose={() => setShowDisclosureModal(false)}
        title="Interview Monitoring Notice"
        description="Transparent and non-punitive interview integrity policy"
      >
        <div className="space-y-3 pt-2 text-sm text-surface-600 dark:text-surface-400">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-100 dark:bg-surface-800">
            <ShieldCheck className="h-5 w-5 text-brand-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-surface-900 dark:text-surface-50">Observable Signals</p>
              <p className="mt-0.5">
                During your session, the system may observe basic interview integrity signals (such as video presence) to assist the human panel.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-100 dark:bg-surface-800">
            <Camera className="h-5 w-5 text-brand-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-surface-900 dark:text-surface-50">Webcam Frame Sampling</p>
              <p className="mt-0.5">
                While camera preview is active during the session, selected video frames are sampled at a rate of 1 frame per second to support automated integrity analysis. Raw continuous video recordings are not stored permanently.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-100 dark:bg-surface-800">
            <Info className="h-5 w-5 text-brand-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-surface-900 dark:text-surface-50">Human Review Always Governs</p>
              <p className="mt-0.5">
                The platform does not determine intent, deception, or guilt. Any indicators serve solely as contextual evidence for human evaluation.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => setShowDisclosureModal(false)}>Understood</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
