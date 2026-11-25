// API configuration and client for the frontend
// Backend integration: same-origin relative paths by default — the vite dev
// server proxies /api to the backend, which works for localhost and the
// public e2b URL alike. Override with VITE_API_BASE_URL only for a
// same-origin-reachable backend.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const API_PATH = '/api'

export const apiConfig = {
  baseURL: API_BASE_URL,
  apiPath: API_PATH,
  healthEndpoint: '/health',
}

export interface ApiResponse<T> {
  status: 'ok' | 'error'
  data?: T
  message?: string
  timestamp?: string
  statusCode?: number
}

// Carries the HTTP status and the server-provided (safe) message so
// authentication flows can distinguish 400/401/403/409 handling.
export class ApiError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
  }
}

export class ApiClient {
  private baseURL: string
  private authToken: string | null = null

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  setAuthToken(token: string | null) {
    this.authToken = token
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })

      const body = await response.json().catch(() => null)

      if (!response.ok) {
        throw new ApiError(
          body?.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status
        )
      }

      return body as T
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      console.error(`API request failed: ${path}`, error)
      throw new ApiError('Unable to reach the server. Please try again.', 0)
    }
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' })
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async patch<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }

  // Health check endpoint
  async health(): Promise<ApiResponse<{ status: string }>> {
    return this.get(`${apiConfig.healthEndpoint}`)
  }

  // Authentication (Phase 6)
  async register(data: {
    name: string
    email: string
    password: string
    role: string
    company?: string
  }): Promise<AuthResponse> {
    return this.post('/api/auth/register', data)
  }

  async login(data: { email: string; password: string }): Promise<AuthResponse> {
    return this.post('/api/auth/login', data)
  }

  async logout(): Promise<ApiResponse<{ message: string }>> {
    return this.post('/api/auth/logout')
  }

  async me(): Promise<MeResponse> {
    return this.get('/api/auth/me')
  }

  // HR interview management (Phase 7)
  async listCandidates(): Promise<CandidateListResponse> {
    return this.get('/api/candidates')
  }

  async createInterview(data: {
    title: string
    candidateId: string
    scheduledStartAt?: string | null
    interviewerId?: string | null
  }): Promise<InterviewResponse> {
    return this.post('/api/interviews', data)
  }

  async listInterviews(): Promise<InterviewListResponse> {
    return this.get('/api/interviews')
  }

  async getInterview(id: string): Promise<InterviewResponse> {
    return this.get(`/api/interviews/${encodeURIComponent(id)}`)
  }

  async updateInterview(
    id: string,
    data: { title?: string; scheduledStartAt?: string | null }
  ): Promise<InterviewResponse> {
    return this.patch(`/api/interviews/${encodeURIComponent(id)}`, data)
  }

  async inviteInterview(id: string): Promise<InterviewResponse> {
    return this.post(`/api/interviews/${encodeURIComponent(id)}/invite`)
  }

  // Interviewer assignment + Interviewer product (Phase 8)
  async listInterviewers(): Promise<InterviewerListResponse> {
    return this.get('/api/interviewers')
  }

  async assignInterview(id: string, interviewerId: string): Promise<InterviewResponse> {
    return this.post(`/api/interviews/${encodeURIComponent(id)}/assign`, { interviewerId })
  }

  async listAssignedInterviews(): Promise<AssignedInterviewListResponse> {
    return this.get('/api/interviewer/interviews')
  }

  async getAssignedInterview(id: string): Promise<AssignedInterviewResponse> {
    return this.get(`/api/interviewer/interviews/${encodeURIComponent(id)}`)
  }

  async getAssignedInterviewReport(id: string): Promise<InterviewReportResponse> {
    return this.get(`/api/interviewer/interviews/${encodeURIComponent(id)}/report`)
  }

  // Candidate/Interviewee product (Phase 9)
  async listMyInterviews(): Promise<CandidateInterviewListResponse> {
    return this.get('/api/interviewee/interviews')
  }

  async getMyInterview(id: string): Promise<CandidateInterviewResponse> {
    return this.get(`/api/interviewee/interviews/${encodeURIComponent(id)}`)
  }

  // Interview Room (Phase 10)
  async getIntervieweeRoom(id: string): Promise<RoomResponse> {
    return this.get(`/api/interviewee/interviews/${encodeURIComponent(id)}/room`)
  }

  async joinIntervieweeRoom(id: string): Promise<RoomResponse> {
    return this.post(`/api/interviewee/interviews/${encodeURIComponent(id)}/room/join`)
  }

  async leaveIntervieweeRoom(id: string): Promise<{ status: 'ok'; message: string }> {
    return this.post(`/api/interviewee/interviews/${encodeURIComponent(id)}/room/leave`)
  }

  async getInterviewerRoom(id: string): Promise<RoomResponse> {
    return this.get(`/api/interviewer/interviews/${encodeURIComponent(id)}/room`)
  }

  async joinInterviewerRoom(id: string): Promise<RoomResponse> {
    return this.post(`/api/interviewer/interviews/${encodeURIComponent(id)}/room/join`)
  }

  async endInterviewerRoom(id: string): Promise<InterviewResponse> {
    return this.post(`/api/interviewer/interviews/${encodeURIComponent(id)}/room/end`)
  }

  // Webcam Capture (Phase 12)
  async submitInterviewFrame(id: string, frame: FrameSubmissionPayload): Promise<FrameSubmissionResponse> {
    return this.post(`/api/interviewee/interviews/${encodeURIComponent(id)}/frames`, frame)
  }

  async getInterviewFrameStatus(id: string, role: 'interviewee' | 'interviewer' = 'interviewee'): Promise<FrameCaptureStatusResponse> {
    const prefix = role === 'interviewer' ? 'interviewer' : 'interviewee'
    return this.get(`/api/${prefix}/interviews/${encodeURIComponent(id)}/frames/status`)
  }

  // Real-Time Alerts (Phase 16)
  async getInterviewAlerts(id: string, params?: Record<string, string | number>): Promise<AlertListResponse> {
    const query = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : ''
    return this.get(`/api/interviews/${encodeURIComponent(id)}/alerts${query}`)
  }

  async getInterviewAlertsSummary(id: string): Promise<AlertsSummaryResponse> {
    return this.get(`/api/interviews/${encodeURIComponent(id)}/alerts/summary`)
  }

  async getAlert(alertId: string): Promise<SingleAlertResponse> {
    return this.get(`/api/alerts/${encodeURIComponent(alertId)}`)
  }

  async acknowledgeAlert(alertId: string): Promise<SingleAlertResponse> {
    return this.patch(`/api/alerts/${encodeURIComponent(alertId)}/acknowledge`)
  }

  async dismissAlert(alertId: string): Promise<SingleAlertResponse> {
    return this.patch(`/api/alerts/${encodeURIComponent(alertId)}/dismiss`)
  }

  // Evidence System (Phase 17)
  async getInterviewEvidence(id: string, params?: Record<string, string | number>): Promise<EvidenceListResponse> {
    const query = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : ''
    return this.get(`/api/interviews/${encodeURIComponent(id)}/evidence${query}`)
  }

  async getInterviewEvidenceSummary(id: string): Promise<EvidenceSummaryResponse> {
    return this.get(`/api/interviews/${encodeURIComponent(id)}/evidence/summary`)
  }

  async getEvidence(evidenceId: string): Promise<SingleEvidenceResponse> {
    return this.get(`/api/evidence/${encodeURIComponent(evidenceId)}`)
  }

  // Live Monitoring & Integrity View (Phase 18)
  async getLiveMonitoringSnapshot(id: string): Promise<LiveMonitoringResponse> {
    return this.get(`/api/interviews/${encodeURIComponent(id)}/live-monitoring`)
  }

  async getLiveMonitoringIndicators(id: string): Promise<LiveMonitoringIndicatorsResponse> {
    return this.get(`/api/interviews/${encodeURIComponent(id)}/live-monitoring/indicators`)
  }

  // Interview Reports (Phase 19)
  async getInterviewReport(id: string): Promise<InterviewReportResponse> {
    return this.get(`/api/interviews/${encodeURIComponent(id)}/report`)
  }

  async generateInterviewReport(id: string): Promise<InterviewReportResponse> {
    return this.post(`/api/interviews/${encodeURIComponent(id)}/report/generate`)
  }

  async updateReportReview(
    id: string,
    review: { review_status: string; review_notes?: string }
  ): Promise<InterviewReportResponse> {
    return this.patch(`/api/interviews/${encodeURIComponent(id)}/report/review`, review)
  }

  async listReports(params?: Record<string, string | number>): Promise<ReportListResponse> {
    const query = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : ''
    return this.get(`/api/reports${query}`)
  }

  // Pilot Feedback (Phase 22)
  async submitInterviewFeedback(id: string, payload: PilotFeedbackPayload): Promise<PilotFeedbackResponse> {
    return this.post(`/api/interviews/${encodeURIComponent(id)}/feedback`, payload)
  }

  async getInterviewFeedback(id: string): Promise<PilotFeedbackListResponse> {
    return this.get(`/api/interviews/${encodeURIComponent(id)}/feedback`)
  }

  async getPilotFeedbackSummary(): Promise<PilotFeedbackSummaryResponse> {
    return this.get('/api/pilot-feedback/summary')
  }

  async listPilotFeedback(
    params?: Record<string, string | number>
  ): Promise<{ status: 'ok'; feedback: PilotFeedback[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> {
    const query = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : ''
    return this.get(`/api/pilot-feedback${query}`)
  }

  // V2 Multimodal Intelligence (Phase 23)
  async submitAudioAnalysis(id: string, payload: Record<string, unknown>): Promise<{ status: 'ok'; result: unknown }> {
    return this.post(`/api/interviews/${encodeURIComponent(id)}/multimodal/audio`, payload)
  }

  async submitTranscriptAnalysis(id: string, payload: Record<string, unknown>): Promise<{ status: 'ok'; result: unknown }> {
    return this.post(`/api/interviews/${encodeURIComponent(id)}/multimodal/transcript`, payload)
  }

  async triggerMultimodalFusion(id: string, payload: Record<string, unknown>): Promise<{ status: 'ok'; fusion: unknown; events_created: number; events_updated: number }> {
    return this.post(`/api/interviews/${encodeURIComponent(id)}/multimodal/fuse`, payload)
  }

  async getMultimodalAnalysis(id: string): Promise<{ status: 'ok'; interview_id: string; multimodal_events: unknown[]; count: number }> {
    return this.get(`/api/interviews/${encodeURIComponent(id)}/multimodal`)
  }

  // Phase 24: SaaS Organization & Enterprise Governance
  async getOrganization(): Promise<{ status: 'ok'; organization: OrganizationProfile }> {
    return this.get('/api/organization')
  }

  async updateOrganization(payload: Partial<OrganizationProfile>): Promise<{ status: 'ok'; organization: OrganizationProfile }> {
    return this.patch('/api/organization', payload)
  }

  async getOrganizationMembers(): Promise<{ status: 'ok'; members: OrganizationMember[]; total_members: number; max_members: number }> {
    return this.get('/api/organization/members')
  }

  async addOrganizationMember(payload: { email: string; name: string; role?: string }): Promise<{ status: 'ok'; organization: OrganizationProfile; member: OrganizationMember }> {
    return this.post('/api/organization/members', payload)
  }

  async updateOrganizationMemberRole(userId: string, role: string): Promise<{ status: 'ok'; organization: OrganizationProfile }> {
    return this.patch(`/api/organization/members/${encodeURIComponent(userId)}`, { role })
  }

  async removeOrganizationMember(userId: string): Promise<{ status: 'ok'; organization: OrganizationProfile }> {
    return this.delete(`/api/organization/members/${encodeURIComponent(userId)}`)
  }

  async getGovernanceSettings(): Promise<{ status: 'ok'; governance: GovernanceSettings; webhook_config: WebhookConfig; entitlements: PlanEntitlements }> {
    return this.get('/api/organization/governance')
  }

  async updateGovernanceSettings(payload: { governance?: Partial<GovernanceSettings>; webhook_config?: Partial<WebhookConfig> }): Promise<{ status: 'ok'; governance: GovernanceSettings; webhook_config: WebhookConfig }> {
    return this.patch('/api/organization/governance', payload)
  }

  async purgeExpiredData(): Promise<{ status: 'ok'; purged_evidence_count: number; purged_events_count: number; evidence_retention_days: number; events_retention_days: number; purged_at: string }> {
    return this.post('/api/organization/governance/purge-expired')
  }

  async getAuditLogs(params?: Record<string, string | number>): Promise<{ status: 'ok'; logs: AuditLogEntry[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> {
    const query = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : ''
    return this.get(`/api/organization/audit-log${query}`)
  }

  async testWebhook(): Promise<{ status: 'ok'; event: string; payload: unknown; signature_header: string; target_url: string | null; enabled: boolean }> {
    return this.post('/api/organization/webhooks/test')
  }
}

export interface AuthUserShape {
  id: string
  name: string
  email: string
  role: string
  status?: string
  created_at?: string
  updated_at?: string
}

export interface AuthResponse {
  status: 'ok'
  token: string
  user: AuthUserShape
}

export interface MeResponse {
  status: 'ok'
  user: AuthUserShape
}

export interface InterviewCandidateSummary {
  id: string
  name: string | null
  email: string | null
}

export interface InterviewInterviewerSummary {
  id: string
  name: string | null
}

export interface InterviewSession {
  id: string
  title: string
  status: string
  scheduled_start_at: string | null
  invite_reference: string | null
  candidate: InterviewCandidateSummary | null
  interviewer: InterviewInterviewerSummary | null
  created_at: string
  updated_at: string
}

export interface InterviewResponse {
  status: 'ok'
  interview: InterviewSession
}

export interface InterviewListResponse {
  status: 'ok'
  interviews: InterviewSession[]
}

export interface CandidateProfileSummary {
  id: string
  user_id: string
  name: string | null
  email: string | null
  status: string | null
  created_at: string
}

export interface CandidateListResponse {
  status: 'ok'
  candidates: CandidateProfileSummary[]
}

export interface InterviewerUserSummary {
  id: string
  name: string | null
  email: string | null
  status: string | null
  created_at: string
}

export interface InterviewerListResponse {
  status: 'ok'
  interviewers: InterviewerUserSummary[]
}

export interface AssignedInterview {
  id: string
  title: string
  status: string
  scheduled_start_at: string | null
  started_at: string | null
  ended_at: string | null
  candidate: InterviewInterviewerSummary | null
  created_at: string
  updated_at: string
}

export interface AssignedInterviewResponse {
  status: 'ok'
  interview: AssignedInterview
}

export interface AssignedInterviewListResponse {
  status: 'ok'
  interviews: AssignedInterview[]
}

export interface V2MultimodalInsights {
  enabled: boolean
  total_v2_events: number
  audio_observations_count: number
  cross_modal_corroborations_count: number
  corroborated_signals: string[]
  summary: string
  insights: Array<{
    event_type: string
    explanation: string
    severity: string
    confidence: number
    timestamp: string
  }>
}

export interface InterviewReport {
  id: string
  _id?: string
  report_id?: string
  interview_id: string
  candidate_id?: string | null
  interviewer_id?: string | null
  recruiter_id?: string | null
  session_metadata?: {
    title: string
    status: string
    scheduled_start_at: string | null
    started_at: string | null
    ended_at: string | null
    duration_seconds: number
    candidate?: { id: string; name: string; email: string | null } | null
    interviewer?: { id: string; name: string; email: string | null } | null
    recruiter?: { id: string; name: string; email: string | null } | null
    telemetry?: FrameCaptureStatusResponse
  }
  summary: string | null
  integrity_indicators: InterpretableIntegrityIndicators | null
  v2_multimodal_insights?: V2MultimodalInsights | null
  notable_event_ids?: string[]
  events?: LiveMonitoringEventItem[]
  alerts?: MonitoringAlert[]
  evidence_ids?: string[]
  evidence_summary?: {
    interview_id: string
    total_evidence: number
    total_size_bytes: number
    by_type: Record<string, number>
  }
  review_status: 'PENDING_REVIEW' | 'REVIEWED' | 'FLAGGED_FOR_FOLLOWUP' | string
  review_notes?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  generated_by?: string | null
  generated_at: string | null
  created_at: string | null
  updated_at?: string | null
}

export interface ReportListResponse {
  status: 'ok'
  reports: InterviewReport[]
  pagination: {
    total: number
    limit: number
    offset: number
    page: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface InterviewReportResponse {
  status: 'ok'
  report: InterviewReport
}

export interface CandidateInterview {
  id: string
  title: string
  status: string
  scheduled_start_at: string | null
  started_at: string | null
  ended_at: string | null
  interviewer: InterviewInterviewerSummary | null
  created_at: string
  updated_at: string
}

export interface CandidateInterviewResponse {
  status: 'ok'
  interview: CandidateInterview
}

export interface CandidateInterviewListResponse {
  status: 'ok'
  interviews: CandidateInterview[]
}

// Interview Room (Phase 10)
export interface RoomParticipantSummary {
  id: string
  name: string
}

export interface InterviewRoomContext {
  interview: {
    id: string
    title: string
    status: string
    scheduled_start_at: string | null
    started_at: string | null
    ended_at: string | null
  }
  candidate: RoomParticipantSummary | null
  interviewer: RoomParticipantSummary | null
}

export interface RoomResponse {
  status: 'ok'
  room: InterviewRoomContext
}

// Webcam Capture (Phase 12)
export interface FrameMetadata {
  sequenceNumber: number
  timestamp: string
  width: number
  height: number
  format: 'image/jpeg' | 'image/webp' | 'image/png'
  sizeBytes: number
  captureStatus?: 'captured' | 'degraded'
}

export interface FrameSubmissionPayload extends FrameMetadata {
  frameData: string
}

export interface FrameSubmissionResponse {
  status: 'ok'
  frameId: string
  sequenceNumber: number
  receivedAt: string
  captureStatus: string
}

export interface FrameCaptureStatusResponse {
  status: 'ok'
  interviewId: string
  captureActive: boolean
  totalFramesReceived: number
  lastCapturedAt: string | null
  lastReceivedAt?: string | null
  lastSequenceNumber: number
  lastWidth?: number
  lastHeight?: number
  lastFormat?: string
  lastSizeBytes?: number
  lastCaptureStatus?: string
}

// Real-Time Alerts (Phase 16)
export interface MonitoringAlert {
  alert_id: string
  interview_id: string
  candidate_id?: string | null
  event_id?: string | null
  event_type: string
  alert_type: string
  policy_id?: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
  status: 'NEW' | 'ACKNOWLEDGED' | 'DISMISSED'
  title: string
  message: string
  metrics?: Record<string, unknown>
  escalation_level?: number
  created_at: string
  updated_at?: string
  acknowledged_at?: string | null
  acknowledged_by?: string | null
  dismissed_at?: string | null
  dismissed_by?: string | null
}

export interface AlertListResponse {
  status: 'ok'
  interview_id: string
  alerts: MonitoringAlert[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface AlertsSummaryResponse {
  status: 'ok'
  summary: {
    interview_id: string
    total_alerts: number
    new_alerts: number
    acknowledged_alerts: number
    dismissed_alerts: number
    by_status: Record<string, number>
    by_priority: Record<string, number>
    by_event_type: Record<string, number>
    first_alert_at: string | null
    latest_alert_at: string | null
  }
}

export interface SingleAlertResponse {
  status: 'ok'
  alert: MonitoringAlert
}

// Evidence System (Phase 17)
export interface EvidenceMetadata {
  event_type?: string
  confidence?: number
  severity?: string
  primary_metric?: number
  metrics?: Record<string, unknown>
  bounding_box?: unknown
  observation_count?: number
  duration_ms?: number
  recorded_at?: string
  [key: string]: unknown
}

export interface EvidenceItem {
  evidence_id: string
  interview_id: string
  event_id?: string | null
  candidate_id?: string | null
  evidence_type: 'OBSERVATION_CONTEXT' | 'QUALITY_TELEMETRY' | 'KEYFRAME_SNAPSHOT' | 'METRICS_SUMMARY'
  media_type: string
  storage_reference?: string | null
  size_bytes: number
  retention_class: 'STANDARD' | 'EXTENDED' | 'PERMANENT'
  metadata: EvidenceMetadata
  captured_at: string
  expires_at: string
  created_at: string
}

export interface EvidenceListResponse {
  status: 'ok'
  interview_id: string
  evidence: EvidenceItem[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface EvidenceSummaryResponse {
  status: 'ok'
  summary: {
    interview_id: string
    total_evidence: number
    by_type: Record<string, number>
    total_size_bytes: number
    first_captured_at: string | null
    latest_captured_at: string | null
  }
}

export interface SingleEvidenceResponse {
  status: 'ok'
  evidence: EvidenceItem
}

// Live Monitoring & Integrity View (Phase 18)
export interface IntegrityIndicatorItem {
  status: string
  label: string
  severity: 'high' | 'medium' | 'low' | 'info'
  confidence?: number
  occurrences?: number
  description: string
}

export interface InterpretableIntegrityIndicators {
  visual_consistency: IntegrityIndicatorItem
  stream_reliability: IntegrityIndicatorItem
  multi_presence: IntegrityIndicatorItem
  active_alerts: {
    new_count: number
    acknowledged_count: number
    dismissed_count: number
    high_priority_count: number
  }
  event_counts: {
    total: number
    by_type: Record<string, number>
    by_severity: Record<string, number>
  }
  average_confidence: number
  explanation: string
}

export interface LiveMonitoringEventItem {
  _id: string
  event_id: string
  interview_id: string
  event_type: string
  category: string
  severity: string
  confidence: number
  occurrence_count: number
  duration_ms: number
  status: string
  first_observed_at: string
  last_observed_at: string
  metrics?: Record<string, unknown>
  explanation?: string | null
  evidence_ids?: string[]
}

export interface LiveMonitoringSnapshot {
  interview_id: string
  session: {
    id: string
    title: string
    status: string
    scheduled_start_at: string | null
    started_at: string | null
    ended_at: string | null
    candidate: { id: string; name: string; email: string | null } | null
    interviewer: { id: string; name: string; email: string | null } | null
  }
  telemetry: FrameCaptureStatusResponse
  integrity_indicators: InterpretableIntegrityIndicators
  events: LiveMonitoringEventItem[]
  alerts: MonitoringAlert[]
  evidence_summary: {
    interview_id: string
    total_evidence: number
    total_size_bytes: number
    by_type: Record<string, number>
  }
  captured_at: string
}

export interface LiveMonitoringResponse {
  status: 'ok'
  snapshot: LiveMonitoringSnapshot
}

export interface LiveMonitoringIndicatorsResponse {
  status: 'ok'
  interview_id: string
  integrity_indicators: InterpretableIntegrityIndicators
  telemetry: FrameCaptureStatusResponse
  captured_at: string
}

export interface PilotFeedbackRatings {
  overall_experience: number
  system_clarity: number
  technical_friction: number
  trust_and_fairness?: number
}

export interface PilotFeedbackPayload {
  pilot_consent_acknowledged: boolean
  ratings: PilotFeedbackRatings
  friction_points?: string[]
  feedback_notes?: string
  client_metadata?: Record<string, unknown>
}

export interface PilotFeedback {
  _id: string
  feedback_id: string
  interview_id: string
  user_id: string
  role: 'candidate' | 'interviewer' | 'hr'
  pilot_consent_acknowledged: boolean
  ratings: PilotFeedbackRatings
  friction_points: string[]
  feedback_notes: string
  client_metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PilotFeedbackResponse {
  status: 'ok'
  feedback: PilotFeedback
  isNew?: boolean
}

export interface PilotFeedbackListResponse {
  status: 'ok'
  feedback: PilotFeedback | PilotFeedback[] | null
}

export interface PilotFeedbackSummary {
  total_submissions: number
  by_role: { candidate: number; interviewer: number; hr: number }
  average_ratings: {
    overall_experience: number | null
    system_clarity: number | null
    technical_friction: number | null
    trust_and_fairness: number | null
  }
  friction_points_frequency: Record<string, number>
  recent_feedback_count: number
}

export interface PilotFeedbackSummaryResponse {
  status: 'ok'
  summary: PilotFeedbackSummary
}

// Phase 24: SaaS Organization & Enterprise Governance Interfaces
export interface PlanEntitlements {
  max_members: number
  max_active_interviews: number
  v2_multimodal_enabled: boolean
  webhooks_enabled: boolean
  custom_retention_allowed: boolean
  max_retention_days: number
  support_tier: string
}

export interface GovernanceSettings {
  evidence_retention_days: number
  events_retention_days: number
  auto_purge_enabled: boolean
  anonymize_candidate_after_days: number
}

export interface WebhookConfig {
  url: string | null
  secret: string | null
  events: string[]
  enabled: boolean
}

export interface OrganizationMember {
  user_id: string
  name: string
  email: string
  role: 'HR_ADMIN' | 'RECRUITER' | 'INTERVIEWER' | string
  added_at: string
}

export interface OrganizationProfile {
  _id: string
  organization_id: string
  name: string
  slug: string
  plan_tier: 'STARTER' | 'GROWTH' | 'ENTERPRISE' | string
  entitlements: PlanEntitlements
  governance: GovernanceSettings
  webhook_config: WebhookConfig
  members: OrganizationMember[]
  created_by: string
  created_at: string
  updated_at: string
}

export interface AuditLogEntry {
  _id: string
  log_id: string
  organization_id: string
  actor_id: string
  actor_name: string
  actor_role: string
  action: string
  target_type: string
  target_id: string | null
  details: Record<string, unknown>
  created_at: string
}

export const apiClient = new ApiClient()

// Export for use in components
export default apiClient
