import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  FileText,
  LogOut,
  Mic,
  MicOff,
  ShieldAlert,
  Square,
  User,
  Video as VideoIcon,
  VideoOff,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import {
  apiClient,
  ApiError,
  EvidenceItem,
  FrameCaptureStatusResponse,
  InterviewRoomContext,
  MonitoringAlert,
} from '@/lib/api'
import { useWebRTC } from '@/hooks/useWebRTC'

// Interview Room — Interviewer Experience (Phase 10 & 11, UX-INT-001, PRD-FR-004)
// Controlled room session for assigned interviewer with real-time WebRTC and Socket.io signaling.
// Per Phase 11 boundaries: Live AI monitoring and violation scoring are deferred to subsequent phases.

export function InterviewerInterviewRoomPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [room, setRoom] = useState<InterviewRoomContext | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [showEndModal, setShowEndModal] = useState(false)
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
    monitoringFrameStatus,
    socket,
    toggleAudio,
    toggleVideo,
    retryMedia,
  } = useWebRTC({
    interviewId: id,
    enabled: room?.interview.status === 'in_progress',
  })

  // Poll candidate webcam frame capture status (Phase 12, UX-INT-001)
  const [candidateCaptureTelemetry, setCandidateCaptureTelemetry] = useState<FrameCaptureStatusResponse | null>(null)

  // Real-Time Alerts State (Phase 16)
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([])
  const [showAlertPanel, setShowAlertPanel] = useState(false)
  const [actionPendingId, setActionPendingId] = useState<string | null>(null)

  // Evidence Inspection State (Phase 17)
  const [inspectingAlert, setInspectingAlert] = useState<MonitoringAlert | null>(null)
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([])
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  const handleInspectEvidence = useCallback(async (alert: MonitoringAlert) => {
    if (!id) return
    setInspectingAlert(alert)
    setIsEvidenceLoading(true)
    setEvidenceError(null)
    try {
      const res = await apiClient.getInterviewEvidence(
        id,
        alert.event_id ? { eventId: alert.event_id } : { limit: 10 }
      )
      setEvidenceList(res.evidence)
    } catch {
      setEvidenceError('Unable to load observation context for this event.')
    } finally {
      setIsEvidenceLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (!id || room?.interview.status !== 'in_progress') return
    apiClient
      .getInterviewAlerts(id, { limit: 50 })
      .then((res) => {
        setAlerts(res.alerts)
      })
      .catch(() => {
        // Silently tolerate initial alert fetch error
      })
  }, [id, room?.interview.status])

  useEffect(() => {
    if (!socket) return

    const onNewAlert = (newAlert: MonitoringAlert) => {
      setAlerts((prev) => {
        const exists = prev.some((a) => a.alert_id === newAlert.alert_id)
        if (exists) {
          return prev.map((a) => (a.alert_id === newAlert.alert_id ? { ...a, ...newAlert } : a))
        }
        return [newAlert, ...prev]
      })
    }

    const onUpdatedAlert = (updatedAlert: MonitoringAlert) => {
      setAlerts((prev) => prev.map((a) => (a.alert_id === updatedAlert.alert_id ? { ...a, ...updatedAlert } : a)))
    }

    const onAcknowledgedAlert = (ackedAlert: MonitoringAlert) => {
      setAlerts((prev) => prev.map((a) => (a.alert_id === ackedAlert.alert_id ? { ...a, ...ackedAlert } : a)))
    }

    const onDismissedAlert = (dismissedAlert: MonitoringAlert) => {
      setAlerts((prev) => prev.map((a) => (a.alert_id === dismissedAlert.alert_id ? { ...a, ...dismissedAlert } : a)))
    }

    const onEscalatedAlert = (escalatedAlert: MonitoringAlert) => {
      setAlerts((prev) => prev.map((a) => (a.alert_id === escalatedAlert.alert_id ? { ...a, ...escalatedAlert } : a)))
    }

    socket.on('monitoring-alert:new', onNewAlert)
    socket.on('monitoring-alert:updated', onUpdatedAlert)
    socket.on('monitoring-alert:acknowledged', onAcknowledgedAlert)
    socket.on('monitoring-alert:dismissed', onDismissedAlert)
    socket.on('monitoring-alert:escalated', onEscalatedAlert)

    return () => {
      socket.off('monitoring-alert:new', onNewAlert)
      socket.off('monitoring-alert:updated', onUpdatedAlert)
      socket.off('monitoring-alert:acknowledged', onAcknowledgedAlert)
      socket.off('monitoring-alert:dismissed', onDismissedAlert)
      socket.off('monitoring-alert:escalated', onEscalatedAlert)
    }
  }, [socket])

  const handleAcknowledgeAlert = async (alertId: string) => {
    setActionPendingId(alertId)
    try {
      const res = await apiClient.acknowledgeAlert(alertId)
      setAlerts((prev) => prev.map((a) => (a.alert_id === alertId ? res.alert : a)))
    } catch (err) {
      console.error('Failed to acknowledge alert:', err)
    } finally {
      setActionPendingId(null)
    }
  }

  const handleDismissAlert = async (alertId: string) => {
    setActionPendingId(alertId)
    try {
      const res = await apiClient.dismissAlert(alertId)
      setAlerts((prev) => prev.map((a) => (a.alert_id === alertId ? res.alert : a)))
    } catch (err) {
      console.error('Failed to dismiss alert:', err)
    } finally {
      setActionPendingId(null)
    }
  }

  const newAlertsCount = alerts.filter((a) => a.status === 'NEW').length

  useEffect(() => {
    if (!id || room?.interview.status !== 'in_progress') return
    const pollStatus = async () => {
      try {
        const res = await apiClient.getInterviewFrameStatus(id, 'interviewer')
        setCandidateCaptureTelemetry(res)
      } catch {
        // Silently tolerate transient polling error
      }
    }
    pollStatus()
    const interval = setInterval(pollStatus, 4000)
    return () => clearInterval(interval)
  }, [id, room?.interview.status])

  // Bind local video stream to interviewer self-view
  useEffect(() => {
    if (localVideoRef.current && localStream && !isVideoDisabled) {
      localVideoRef.current.srcObject = localStream
      localVideoRef.current.play().catch(() => {})
    }
  }, [localStream, isVideoDisabled])

  // Bind remote video stream to candidate view
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
      const response = await apiClient.getInterviewerRoom(id)
      setRoom(response.room)

      if (response.room.interview.status === 'completed') {
        navigate(`/interviewer/interviews/${id}`, { replace: true })
        return
      }

      if (response.room.interview.status !== 'in_progress') {
        setIsJoining(true)
        try {
          const joinRes = await apiClient.joinInterviewerRoom(id)
          setRoom(joinRes.room)
        } catch (joinError) {
          console.error('Failed to auto-join interview room:', joinError)
          if (joinError instanceof ApiError) {
            setLoadError(`Unable to start interview session: ${joinError.message}`)
          }
        } finally {
          setIsJoining(false)
        }
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setLoadError(
          error.statusCode === 403
            ? 'You are not assigned as the interviewer for this session.'
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

  const handleEndInterview = async () => {
    if (!id) return
    setIsEnding(true)
    try {
      await apiClient.endInterviewerRoom(id)
      navigate(`/interviewer/interviews/${id}`)
    } catch (error) {
      if (error instanceof ApiError) {
        alert(error.message)
      }
    } finally {
      setIsEnding(false)
      setShowEndModal(false)
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
          <Link to="/interviewer/interviews">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to My Interviews
          </Link>
        </Button>
        <Card className="border-surface-200 dark:border-surface-800">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">
              Room Access Denied or Unavailable
            </h2>
            <p className="text-surface-500 dark:text-surface-400 text-sm mt-2 max-w-md mx-auto">
              {loadError ?? 'You cannot enter this room or it does not exist.'}
            </p>
            <div className="mt-6">
              <Button asChild>
                <Link to="/interviewer/interviews">Return to My Interviews</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header */}
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
              Candidate: <span className="font-medium text-surface-700 dark:text-surface-300">{room.candidate?.name ?? 'Candidate'}</span>
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

          {/* Candidate Webcam Capture Telemetry Badge (Phase 12) */}
          {(monitoringFrameStatus || candidateCaptureTelemetry?.captureActive) ? (
            <Badge variant="neutral" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
              <Camera className="h-3 w-3 mr-1" aria-hidden="true" />
              Candidate Capture: Active {monitoringFrameStatus ? `(#${monitoringFrameStatus.sequenceNumber})` : candidateCaptureTelemetry ? `(${candidateCaptureTelemetry.totalFramesReceived})` : ''}
            </Badge>
          ) : (
            <Badge variant="neutral" className="bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-800 dark:text-surface-400">
              <Camera className="h-3 w-3 mr-1" aria-hidden="true" />
              Candidate Capture: Standby
            </Badge>
          )}

          {/* Real-Time Alerts Badge & Toggle (Phase 16) */}
          <Button
            variant={newAlertsCount > 0 ? "danger" : "neutral"}
            size="sm"
            className="gap-1.5"
            onClick={() => setShowAlertPanel((prev) => !prev)}
            aria-expanded={showAlertPanel}
          >
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Alerts</span>
            {newAlertsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs font-bold bg-white text-rose-700 dark:bg-rose-950 dark:text-rose-200">
                {newAlertsCount}
              </span>
            )}
          </Button>

          <Button
            variant="neutral"
            size="sm"
            asChild
            className="gap-1.5"
          >
            <Link to={`/interviewer/interviews/${id}`}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Exit Room
            </Link>
          </Button>

          <Button
            variant="danger"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowEndModal(true)}
          >
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            End Interview
          </Button>
        </div>
      </div>

      {/* Real-Time Monitoring Alerts Drawer / Panel (Phase 16) */}
      {showAlertPanel && (
        <Card className="border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-850">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-surface-200 dark:border-surface-700 pb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                  Real-Time Integrity Alerts ({alerts.length})
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowAlertPanel(false)} className="text-xs h-7">
                Close
              </Button>
            </div>

            {alerts.length === 0 ? (
              <p className="text-xs text-surface-500 py-3 text-center">
                No alerts recorded for this interview session yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {alerts.map((alert) => (
                  <div
                    key={alert.alert_id}
                    className={`p-3 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 transition-colors ${
                      alert.status === 'NEW'
                        ? 'bg-white dark:bg-surface-800 border-rose-200 dark:border-rose-900/50 shadow-sm'
                        : 'bg-surface-100/60 dark:bg-surface-800/40 border-surface-200 dark:border-surface-700/60 opacity-80'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="neutral"
                          className={
                            alert.priority === 'HIGH'
                              ? 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300'
                          }
                        >
                          {alert.priority}
                        </Badge>
                        <span className="font-semibold text-surface-900 dark:text-surface-100">
                          {alert.title}
                        </span>
                        {alert.status === 'ACKNOWLEDGED' && (
                          <Badge variant="neutral" className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300">
                            Acknowledged
                          </Badge>
                        )}
                        {alert.status === 'DISMISSED' && (
                          <Badge variant="neutral" className="bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-700 dark:text-surface-300">
                            Dismissed
                          </Badge>
                        )}
                        {(alert.escalation_level ?? 0) > 0 && (
                          <Badge variant="neutral" className="bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300">
                            Escalated (L{alert.escalation_level})
                          </Badge>
                        )}
                      </div>
                      <p className="text-surface-600 dark:text-surface-300">
                        {alert.message}
                      </p>
                      <p className="text-[10px] text-surface-400">
                        {new Date(alert.created_at).toLocaleTimeString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2 text-brand-600 dark:text-brand-400 hover:text-brand-700"
                        title="Inspect observation context and metrics"
                        onClick={() => handleInspectEvidence(alert)}
                      >
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        Evidence
                      </Button>
                      {alert.status === 'NEW' && (
                        <Button
                          variant="neutral"
                          size="sm"
                          className="h-7 text-xs px-2.5"
                          disabled={actionPendingId === alert.alert_id}
                          onClick={() => handleAcknowledgeAlert(alert.alert_id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                          Acknowledge
                        </Button>
                      )}
                      {alert.status !== 'DISMISSED' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 text-surface-500 hover:text-surface-700"
                          disabled={actionPendingId === alert.alert_id}
                          onClick={() => handleDismissAlert(alert.alert_id)}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Dismiss
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
        {/* Candidate View Tile */}
        <Card className="border-surface-200 dark:border-surface-800 bg-surface-900 text-white min-h-[340px] flex flex-col justify-between overflow-hidden relative">
          <div className="p-3 flex items-center justify-between z-10">
            <span className="text-xs font-medium px-2 py-1 rounded bg-black/50 backdrop-blur-sm">
              {remoteParticipant?.name || room.candidate?.name || 'Candidate'}
            </span>
            <Badge variant="neutral" className="bg-brand-500/80 text-white text-[11px] border-none">
              Candidate
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
                {remoteParticipant?.name || room.candidate?.name || 'Candidate'}
              </p>
              <p className="text-xs text-surface-400 mt-1 max-w-xs">
                {peerConnectionState === 'connecting'
                  ? 'Establishing peer-to-peer connection...'
                  : remoteParticipant
                    ? 'Candidate is in the room. Negotiating video stream...'
                    : 'Waiting for candidate to enter the room...'}
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
                ? 'Live Candidate Stream'
                : remoteParticipant
                  ? 'Candidate In Room'
                  : 'Waiting for Candidate'}
            </span>
            <div className="flex items-center gap-2">
              {(monitoringFrameStatus || candidateCaptureTelemetry?.captureActive) && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/70 border border-emerald-800 px-1.5 py-0.5 rounded">
                  <Camera className="h-3 w-3" />
                  Capture Monitored
                </span>
              )}
              <span className="text-surface-400 text-xs">Remote Feed</span>
            </div>
          </div>
        </Card>

        {/* Interviewer Self View Tile */}
        <Card className="border-surface-200 dark:border-surface-800 bg-surface-950 text-white min-h-[340px] flex flex-col justify-between overflow-hidden relative">
          <div className="p-3 flex items-center justify-between z-10">
            <span className="text-xs font-medium px-2 py-1 rounded bg-black/50 backdrop-blur-sm">
              {room.interviewer?.name ?? 'You (Interviewer)'}
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
                {room.interviewer?.name ?? 'Interviewer'}
              </p>
              <p className="text-xs text-surface-400 mt-1 max-w-xs">
                {isVideoDisabled
                  ? 'Camera preview is currently toggled off.'
                  : mediaError
                    ? mediaError
                    : 'Interviewer room control active.'}
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
            </div>
            <span className="text-surface-400 text-xs">Panel Lead</span>
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
          onClick={() => setShowEndModal(true)}
        >
          <Square className="h-3.5 w-3.5 fill-current" />
          End Session
        </Button>
      </div>

      {/* End Interview Confirmation Modal */}
      <Modal
        isOpen={showEndModal}
        onClose={() => setShowEndModal(false)}
        title="Conclude Interview?"
        description="This will transition the interview session to completed state and record the end timestamp."
      >
        <div className="space-y-4 pt-2">
          <p className="text-sm text-surface-600 dark:text-surface-400">
            Are you sure you want to end this interview session? This marks the interview as completed.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="neutral" onClick={() => setShowEndModal(false)} disabled={isEnding}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleEndInterview} loading={isEnding}>
              Conclude Interview
            </Button>
          </div>
        </div>
      </Modal>

      {/* Observation Evidence & Context Modal (Phase 17) */}
      <Modal
        isOpen={inspectingAlert !== null}
        onClose={() => setInspectingAlert(null)}
        title="Observation Context & Evidence"
        description="Structured observation context and telemetry captured for this monitoring event."
      >
        <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto">
          {inspectingAlert && (
            <div className="p-3 rounded-lg bg-surface-100 dark:bg-surface-800 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="neutral" className="bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
                  {inspectingAlert.event_type}
                </Badge>
                <span className="font-semibold text-surface-900 dark:text-surface-100">
                  {inspectingAlert.title}
                </span>
              </div>
              <p className="text-surface-600 dark:text-surface-300">
                {inspectingAlert.message}
              </p>
              <p className="text-[11px] text-surface-400">
                Recorded: {new Date(inspectingAlert.created_at).toLocaleString()}
              </p>
            </div>
          )}

          {isEvidenceLoading ? (
            <div className="py-6 text-center text-xs text-surface-500">
              Loading observation context...
            </div>
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
                    <span className="text-[11px] text-surface-400">
                      Retention: {item.retention_class}
                    </span>
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
            <Button variant="neutral" size="sm" onClick={() => setInspectingAlert(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
