import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Shield,
  ShieldAlert,
  User,
  Users,
  Video,
  Wifi,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import {
  apiClient,
  ApiError,
  EvidenceItem,
  LiveMonitoringSnapshot,
  LiveMonitoringEventItem,
  MonitoringAlert,
} from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { createInterviewSocket, Socket } from '@/lib/socket'

/**
 * Live Interview Monitoring & Basic Integrity View (Phase 18, UX-INT-002, PRD-FR-009)
 *
 * Provides a unified real-time dashboard for active interview sessions:
 * - Webcam capture telemetry (sampling rate, total frames, status)
 * - Transparent, interpretable integrity indicators (Visual Continuity, Stream Stability, Secondary Presence)
 * - Chronological monitoring events timeline with severity/type filters
 * - Real-time alerts with one-click Acknowledge / Dismiss actions
 * - Contextual evidence inspection modal
 *
 * UX/Ethics Rule:
 * Event context, confidence, and observation metrics remain visibly primary over any summary indicator.
 * Strictly avoids black-box fraud scores; uses neutral, objective, non-accusatory terminology.
 */
export function InterviewerLivePage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const interviewIdParam = searchParams.get('interviewId')

  const [availableSessions, setAvailableSessions] = useState<Array<{ id: string; title: string; status: string }>>([])
  const [selectedInterviewId, setSelectedInterviewId] = useState<string>(interviewIdParam || '')
  const [snapshot, setSnapshot] = useState<LiveMonitoringSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Filters for events stream
  const [severityFilter, setSeverityFilter] = useState<string>('ALL')
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('ALL')

  // Evidence inspection modal state (Phase 17)
  const [inspectingEvent, setInspectingEvent] = useState<LiveMonitoringEventItem | null>(null)
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([])
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  // Alert action pending state
  const [actionPendingId, setActionPendingId] = useState<string | null>(null)

  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    if (!selectedInterviewId) return
    const s = createInterviewSocket()
    s.connect()
    setSocket(s)
    return () => {
      s.disconnect()
    }
  }, [selectedInterviewId])

  // 1. Load list of available interviews for current reviewer (Interviewer or HR)
  useEffect(() => {
    let isMounted = true
    const fetchSessions = async () => {
      try {
        if (user?.role === 'hr') {
          const res = await apiClient.listInterviews()
          if (!isMounted) return
          const sessions = res.interviews.map((i) => ({ id: i.id, title: i.title, status: i.status }))
          setAvailableSessions(sessions)
          if (!selectedInterviewId && sessions.length > 0) {
            const activeOne = sessions.find((s) => s.status === 'in_progress') || sessions[0]
            setSelectedInterviewId(activeOne.id)
          }
        } else {
          const res = await apiClient.listAssignedInterviews()
          if (!isMounted) return
          const sessions = res.interviews.map((i) => ({ id: i.id, title: i.title, status: i.status }))
          setAvailableSessions(sessions)
          if (!selectedInterviewId && sessions.length > 0) {
            const activeOne = sessions.find((s) => s.status === 'in_progress') || sessions[0]
            setSelectedInterviewId(activeOne.id)
          }
        }
      } catch (err) {
        console.error('Failed to load sessions for live monitoring:', err)
      }
    }

    fetchSessions()
    return () => {
      isMounted = false
    }
  }, [user?.role, selectedInterviewId])

  // Synchronize URL query parameter when selection changes
  useEffect(() => {
    if (selectedInterviewId && selectedInterviewId !== interviewIdParam) {
      setSearchParams({ interviewId: selectedInterviewId }, { replace: true })
    }
  }, [selectedInterviewId, interviewIdParam, setSearchParams])

  // 2. Load live monitoring snapshot for selected session
  const loadSnapshot = useCallback(async (isManualRefresh = false) => {
    if (!selectedInterviewId) {
      setIsLoading(false)
      return
    }

    if (isManualRefresh) setIsRefreshing(true)
    else setIsLoading(true)
    setLoadError(null)

    try {
      const res = await apiClient.getLiveMonitoringSnapshot(selectedInterviewId)
      setSnapshot(res.snapshot)
    } catch (err) {
      if (err instanceof ApiError) {
        setLoadError(err.message)
      } else {
        setLoadError('Failed to load live monitoring state.')
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedInterviewId])

  useEffect(() => {
    loadSnapshot()
  }, [loadSnapshot])

  // 3. Socket.io real-time updates: reviewer room event updates & alerts
  useEffect(() => {
    if (!socket || !selectedInterviewId) return

    // Sockets join room interview:<id>:reviewers
    const onNewAlert = (newAlert: MonitoringAlert) => {
      if (newAlert.interview_id !== selectedInterviewId) return
      setSnapshot((prev) => {
        if (!prev) return prev
        const existing = prev.alerts.some((a) => a.alert_id === newAlert.alert_id)
        const updatedAlerts = existing
          ? prev.alerts.map((a) => (a.alert_id === newAlert.alert_id ? { ...a, ...newAlert } : a))
          : [newAlert, ...prev.alerts]
        return {
          ...prev,
          alerts: updatedAlerts,
        }
      })
    }

    const onAlertUpdated = (updatedAlert: MonitoringAlert) => {
      if (updatedAlert.interview_id !== selectedInterviewId) return
      setSnapshot((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          alerts: prev.alerts.map((a) => (a.alert_id === updatedAlert.alert_id ? { ...a, ...updatedAlert } : a)),
        }
      })
    }

    const onEventsUpdate = (data: { interview_id: string; events?: LiveMonitoringEventItem[] }) => {
      if (data.interview_id !== selectedInterviewId) return
      // Re-fetch clean snapshot to ensure updated integrity indicators
      loadSnapshot(true)
    }

    socket.on('monitoring-alert:new', onNewAlert)
    socket.on('monitoring-alert:updated', onAlertUpdated)
    socket.on('monitoring-alert:acknowledged', onAlertUpdated)
    socket.on('monitoring-alert:dismissed', onAlertUpdated)
    socket.on('monitoring-alert:escalated', onAlertUpdated)
    socket.on('monitoring:events-update', onEventsUpdate)

    return () => {
      socket.off('monitoring-alert:new', onNewAlert)
      socket.off('monitoring-alert:updated', onAlertUpdated)
      socket.off('monitoring-alert:acknowledged', onAlertUpdated)
      socket.off('monitoring-alert:dismissed', onAlertUpdated)
      socket.off('monitoring-alert:escalated', onAlertUpdated)
      socket.off('monitoring:events-update', onEventsUpdate)
    }
  }, [socket, selectedInterviewId, loadSnapshot])

  // 4. Alert Actions (Acknowledge / Dismiss)
  const handleAcknowledgeAlert = async (alertId: string) => {
    setActionPendingId(alertId)
    try {
      const res = await apiClient.acknowledgeAlert(alertId)
      setSnapshot((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          alerts: prev.alerts.map((a) => (a.alert_id === alertId ? res.alert : a)),
        }
      })
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
      setSnapshot((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          alerts: prev.alerts.map((a) => (a.alert_id === alertId ? res.alert : a)),
        }
      })
    } catch (err) {
      console.error('Failed to dismiss alert:', err)
    } finally {
      setActionPendingId(null)
    }
  }

  // 5. Contextual Evidence Inspection (Phase 17)
  const handleInspectEvidence = async (event: LiveMonitoringEventItem) => {
    if (!selectedInterviewId) return
    setInspectingEvent(event)
    setIsEvidenceLoading(true)
    setEvidenceError(null)

    try {
      const targetId = event.event_id || event._id
      const res = await apiClient.getInterviewEvidence(selectedInterviewId, { eventId: targetId })
      setEvidenceList(res.evidence)
    } catch {
      setEvidenceError('Unable to load contextual evidence for this event.')
    } finally {
      setIsEvidenceLoading(false)
    }
  }

  // Filtered Events
  const filteredEvents = (snapshot?.events || []).filter((e) => {
    if (severityFilter !== 'ALL' && e.severity.toUpperCase() !== severityFilter) {
      return false
    }
    if (eventTypeFilter !== 'ALL' && e.event_type !== eventTypeFilter) {
      return false
    }
    return true
  })

  // Extract unique event types for filter dropdown
  const uniqueEventTypes = Array.from(new Set((snapshot?.events || []).map((e) => e.event_type)))

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Session Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-surface-200 dark:border-surface-800">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50 flex items-center gap-2.5">
            <Activity className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            Live Monitoring & Session Integrity
          </h1>
          <p className="text-sm text-surface-600 dark:text-surface-400 mt-1">
            Real-time candidate telemetry, interpretable integrity indicators, and observable event feed.
          </p>
        </div>

        {/* Session Switcher Dropdown */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedInterviewId}
              onChange={(e) => setSelectedInterviewId(e.target.value)}
              className="text-xs rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[220px]"
              aria-label="Select interview session"
            >
              {availableSessions.length === 0 ? (
                <option value="">No sessions found</option>
              ) : (
                availableSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} ({session.status})
                  </option>
                ))
              )}
            </select>
          </div>

          <Button
            variant="neutral"
            size="sm"
            className="gap-1.5"
            onClick={() => loadSnapshot(true)}
            disabled={isRefreshing || !selectedInterviewId}
            title="Refresh snapshot telemetry"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center space-y-3">
          <div className="h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-surface-500">Loading live monitoring telemetry...</p>
        </div>
      ) : loadError ? (
        <Card className="border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30">
          <CardContent className="p-6 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-rose-600 dark:text-rose-400 mx-auto" />
            <h2 className="text-base font-semibold text-rose-900 dark:text-rose-100">Unable to load monitoring state</h2>
            <p className="text-xs text-rose-700 dark:text-rose-300 max-w-md mx-auto">{loadError}</p>
            <Button variant="neutral" size="sm" onClick={() => loadSnapshot()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : !snapshot ? (
        <Card className="border-surface-200 dark:border-surface-800 text-center py-16">
          <CardContent className="max-w-md mx-auto space-y-3">
            <Video className="h-10 w-10 text-surface-400 mx-auto" />
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">No session selected</h2>
            <p className="text-xs text-surface-500">Select an active or upcoming interview session from the menu above to monitor.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Active Session Info Banner */}
          <div className="p-4 rounded-xl bg-surface-50 dark:bg-surface-850 border border-surface-200 dark:border-surface-700 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-base font-semibold text-surface-900 dark:text-surface-50">
                  {snapshot.session.title}
                </span>
                <Badge
                  variant="neutral"
                  className={
                    snapshot.session.status === 'in_progress'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-surface-100 text-surface-700 border-surface-300 dark:bg-surface-800 dark:text-surface-300'
                  }
                >
                  {snapshot.session.status.toUpperCase()}
                </Badge>
                {snapshot.telemetry.captureActive && (
                  <Badge variant="neutral" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 font-mono text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                    1 FPS Stream Active
                  </Badge>
                )}
              </div>
              <p className="text-xs text-surface-600 dark:text-surface-400 flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-surface-500" />
                  Candidate: <strong className="text-surface-800 dark:text-surface-200">{snapshot.session.candidate?.name || 'Unassigned'}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-surface-500" />
                  Interviewer: <strong className="text-surface-800 dark:text-surface-200">{snapshot.session.interviewer?.name || 'Unassigned'}</strong>
                </span>
              </p>
            </div>

            {/* Room Navigation CTA */}
            {snapshot.session.status === 'in_progress' && (
              <Button asChild size="sm" className="gap-2 shrink-0">
                <Link to={`/interviewer/interviews/${snapshot.interview_id}/room`}>
                  <Video className="h-4 w-4" />
                  Enter Interview Room
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>

          {/* Interpretable Integrity Indicators Grid (UX-INT-002, PRD-FR-009) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Visual Continuity */}
            <Card className="border-surface-200 dark:border-surface-750 bg-white dark:bg-surface-900 shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-surface-500">Visual Continuity</span>
                  <Badge
                    variant="neutral"
                    className={
                      snapshot.integrity_indicators.visual_consistency.status === 'NORMAL'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                        : snapshot.integrity_indicators.visual_consistency.status === 'IRREGULAR'
                          ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300'
                    }
                  >
                    {snapshot.integrity_indicators.visual_consistency.status}
                  </Badge>
                </div>
                <div className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                  {snapshot.integrity_indicators.visual_consistency.label}
                </div>
                <p className="text-[11px] text-surface-500 leading-relaxed">
                  {snapshot.integrity_indicators.visual_consistency.description}
                </p>
              </CardContent>
            </Card>

            {/* Stream Stability */}
            <Card className="border-surface-200 dark:border-surface-750 bg-white dark:bg-surface-900 shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-surface-500">Stream Stability</span>
                  <Badge
                    variant="neutral"
                    className={
                      snapshot.integrity_indicators.stream_reliability.status === 'STABLE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-800 dark:text-surface-400'
                    }
                  >
                    {snapshot.integrity_indicators.stream_reliability.status}
                  </Badge>
                </div>
                <div className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                  {snapshot.integrity_indicators.stream_reliability.label}
                </div>
                <p className="text-[11px] text-surface-500 leading-relaxed">
                  {snapshot.integrity_indicators.stream_reliability.description}
                </p>
              </CardContent>
            </Card>

            {/* Secondary Presence */}
            <Card className="border-surface-200 dark:border-surface-750 bg-white dark:bg-surface-900 shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-surface-500">Secondary Presence</span>
                  <Badge
                    variant="neutral"
                    className={
                      snapshot.integrity_indicators.multi_presence.status === 'CLEAR'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300'
                    }
                  >
                    {snapshot.integrity_indicators.multi_presence.status}
                  </Badge>
                </div>
                <div className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                  {snapshot.integrity_indicators.multi_presence.label}
                </div>
                <p className="text-[11px] text-surface-500 leading-relaxed">
                  {snapshot.integrity_indicators.multi_presence.description}
                </p>
              </CardContent>
            </Card>

            {/* Active Alerts */}
            <Card className="border-surface-200 dark:border-surface-750 bg-white dark:bg-surface-900 shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-surface-500">Review Alerts</span>
                  <Badge
                    variant="neutral"
                    className={
                      snapshot.integrity_indicators.active_alerts.new_count > 0
                        ? 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                    }
                  >
                    {snapshot.integrity_indicators.active_alerts.new_count} Active
                  </Badge>
                </div>
                <div className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                  {snapshot.integrity_indicators.active_alerts.new_count > 0
                    ? `${snapshot.integrity_indicators.active_alerts.new_count} Unresolved Alerts`
                    : 'No Active Alerts'}
                </div>
                <p className="text-[11px] text-surface-500 leading-relaxed">
                  {snapshot.integrity_indicators.active_alerts.acknowledged_count} acknowledged, {snapshot.integrity_indicators.active_alerts.dismissed_count} dismissed.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Transparent Explanatory Context Banner (PRD-FR-009) */}
          <div className="p-3.5 rounded-xl bg-surface-100/70 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700 text-xs flex items-start gap-3 text-surface-700 dark:text-surface-300">
            <Shield className="h-4 w-4 text-brand-600 dark:text-brand-400 mt-0.5 shrink-0" />
            <div className="space-y-0.5 leading-relaxed">
              <span className="font-semibold text-surface-900 dark:text-surface-100 mr-1.5">Observation Summary:</span>
              <span>{snapshot.integrity_indicators.explanation}</span>
            </div>
          </div>

          {/* Active Alerts Section */}
          {snapshot.alerts.length > 0 && (
            <Card className="border-surface-200 dark:border-surface-800">
              <CardHeader className="py-3 px-4 border-b border-surface-200 dark:border-surface-700 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Bell className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  Real-Time Integrity Alerts ({snapshot.alerts.length})
                </CardTitle>
                <span className="text-xs text-surface-500">
                  {snapshot.integrity_indicators.active_alerts.new_count} requiring review
                </span>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5 max-h-60 overflow-y-auto">
                {snapshot.alerts.map((alert) => (
                  <div
                    key={alert.alert_id}
                    className={`p-3 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                      alert.status === 'NEW'
                        ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                        : 'bg-surface-50 dark:bg-surface-850 border-surface-200 dark:border-surface-700 opacity-80'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="neutral"
                          className={
                            alert.priority === 'HIGH'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }
                        >
                          {alert.priority}
                        </Badge>
                        <span className="font-semibold text-surface-900 dark:text-surface-100">{alert.title}</span>
                        {alert.status === 'ACKNOWLEDGED' && (
                          <Badge variant="neutral" className="bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                            Acknowledged
                          </Badge>
                        )}
                        {alert.status === 'DISMISSED' && (
                          <Badge variant="neutral" className="bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400">
                            Dismissed
                          </Badge>
                        )}
                      </div>
                      <p className="text-surface-600 dark:text-surface-300">{alert.message}</p>
                      <p className="text-[10px] text-surface-400">{new Date(alert.created_at).toLocaleTimeString()}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
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
              </CardContent>
            </Card>
          )}

          {/* Chronological Monitoring Events Feed (UX-INT-002) */}
          <Card className="border-surface-200 dark:border-surface-800">
            <CardHeader className="py-3 px-4 border-b border-surface-200 dark:border-surface-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                  Observable Monitoring Events Stream ({filteredEvents.length})
                </CardTitle>
                <p className="text-xs text-surface-500 mt-0.5">
                  Chronological event observations extracted from 1 fps video telemetry.
                </p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 text-xs">
                  <Filter className="h-3 w-3 text-surface-400" />
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="text-xs rounded border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 px-2 py-1 text-surface-800 dark:text-surface-200"
                    aria-label="Filter by severity"
                  >
                    <option value="ALL">All Severities</option>
                    <option value="HIGH">High Severity</option>
                    <option value="MEDIUM">Medium Severity</option>
                    <option value="LOW">Low Severity</option>
                  </select>
                </div>

                {uniqueEventTypes.length > 0 && (
                  <select
                    value={eventTypeFilter}
                    onChange={(e) => setEventTypeFilter(e.target.value)}
                    className="text-xs rounded border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 px-2 py-1 text-surface-800 dark:text-surface-200"
                    aria-label="Filter by event type"
                  >
                    <option value="ALL">All Types</option>
                    {uniqueEventTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {filteredEvents.length === 0 ? (
                <div className="py-12 text-center text-xs text-surface-500">
                  No monitoring events match the selected filters for this session.
                </div>
              ) : (
                <div className="divide-y divide-surface-200 dark:divide-surface-800">
                  {filteredEvents.map((event) => (
                    <div
                      key={event.event_id || event._id}
                      className="p-3.5 hover:bg-surface-50 dark:hover:bg-surface-850/50 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="neutral"
                            className={
                              event.severity === 'high'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : event.severity === 'medium'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-300'
                            }
                          >
                            {event.event_type}
                          </Badge>

                          <span className="text-[11px] font-mono text-surface-500">
                            {new Date(event.first_observed_at || event.last_observed_at).toLocaleTimeString()}
                          </span>

                          {event.confidence !== undefined && (
                            <span className="text-[11px] text-surface-500">
                              Confidence: <strong className="text-surface-700 dark:text-surface-300">{Math.round(event.confidence * 100)}%</strong>
                            </span>
                          )}

                          {event.duration_ms > 0 && (
                            <span className="text-[11px] text-surface-500">
                              Duration: <strong className="text-surface-700 dark:text-surface-300">{event.duration_ms}ms</strong>
                            </span>
                          )}
                        </div>

                        {event.explanation && (
                          <p className="text-surface-600 dark:text-surface-300">{event.explanation}</p>
                        )}

                        {event.metrics && Object.keys(event.metrics).length > 0 && (
                          <div className="text-[10px] text-surface-500 font-mono flex items-center gap-3 flex-wrap">
                            {Object.entries(event.metrics)
                              .slice(0, 4)
                              .map(([k, v]) => (
                                <span key={k}>
                                  {k}: <strong className="text-surface-700 dark:text-surface-300">{String(v)}</strong>
                                </span>
                              ))}
                          </div>
                        )}
                      </div>

                      {/* Evidence inspection action */}
                      <div className="shrink-0 flex items-center gap-2">
                        <Button
                          variant="neutral"
                          size="sm"
                          className="h-7 text-xs px-2.5 gap-1 text-brand-600 dark:text-brand-400"
                          onClick={() => handleInspectEvidence(event)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Inspect Evidence
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Contextual Evidence Modal (Phase 17 Reused) */}
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
            <Button variant="neutral" size="sm" onClick={() => setInspectingEvent(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
export default InterviewerLivePage
