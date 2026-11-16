import { io, Socket } from 'socket.io-client'
import { apiConfig } from './api'

export interface ParticipantInfo {
  socketId: string
  userId: string
  role: string
  name?: string
  timestamp?: string
}

export interface WebRTCOfferPayload {
  interviewId: string
  sdp: RTCSessionDescriptionInit
  senderSocketId: string
  senderUserId: string
  senderRole: string
  senderName?: string
}

export interface WebRTCAnswerPayload {
  interviewId: string
  sdp: RTCSessionDescriptionInit
  senderSocketId: string
  senderUserId: string
  senderRole: string
  senderName?: string
}

export interface WebRTCIceCandidatePayload {
  interviewId: string
  candidate: RTCIceCandidateInit
  senderSocketId: string
  senderUserId: string
  senderRole: string
}

export interface MonitoringFrameStatusPayload {
  interviewId: string
  sequenceNumber: number
  timestamp: string
  captureStatus: string
}

export interface MonitoringAlertPayload {
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

export function getStoredAuthToken(): string | null {
  return localStorage.getItem('token') || sessionStorage.getItem('token')
}

/**
 * Creates and returns a configured Socket.io instance for interview signaling.
 * Auto-connect is disabled so components have explicit lifecycle control.
 */
export function createInterviewSocket(authToken?: string): Socket {
  const token = authToken || getStoredAuthToken()

  // Use the API base URL if defined (e.g., cross-origin development backend),
  // otherwise default to undefined which connects to window.location (proxied by Vite).
  const serverUrl = apiConfig.baseURL || undefined

  return io(serverUrl, {
    auth: {
      token,
    },
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  })
}

