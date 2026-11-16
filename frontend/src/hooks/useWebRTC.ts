import { useCallback, useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import {
  createInterviewSocket,
  MonitoringFrameStatusPayload,
  ParticipantInfo,
  WebRTCAnswerPayload,
  WebRTCIceCandidatePayload,
  WebRTCOfferPayload,
} from '@/lib/socket'

export type SignalingState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
export type PeerConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'closed'

interface UseWebRTCOptions {
  interviewId?: string
  enabled?: boolean
  token?: string
}

interface UseWebRTCResult {
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  signalingState: SignalingState
  signalingError: string | null
  peerConnectionState: PeerConnectionState
  mediaError: string | null
  isMicMuted: boolean
  isVideoDisabled: boolean
  remoteParticipant: ParticipantInfo | null
  monitoringFrameStatus: MonitoringFrameStatusPayload | null
  socket: Socket | null
  toggleAudio: (enabled?: boolean) => void
  toggleVideo: (enabled?: boolean) => void
  retryMedia: () => Promise<void>
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export function useWebRTC({ interviewId, enabled = true, token }: UseWebRTCOptions): UseWebRTCResult {
  const [signalingState, setSignalingState] = useState<SignalingState>('idle')
  const [signalingError, setSignalingError] = useState<string | null>(null)
  const [peerConnectionState, setPeerConnectionState] = useState<PeerConnectionState>('disconnected')
  const [mediaError, setMediaError] = useState<string | null>(null)

  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [isVideoDisabled, setIsVideoDisabled] = useState(false)
  const [remoteParticipant, setRemoteParticipant] = useState<ParticipantInfo | null>(null)
  const [monitoringFrameStatus, setMonitoringFrameStatus] = useState<MonitoringFrameStatusPayload | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const remoteParticipantRef = useRef<ParticipantInfo | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  // Keep refs up-to-date with latest state
  useEffect(() => {
    remoteParticipantRef.current = remoteParticipant
  }, [remoteParticipant])

  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  // Process queued ICE candidates after remote description is set
  const drainIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
    while (queuedCandidatesRef.current.length > 0) {
      const candidateInit = queuedCandidatesRef.current.shift()
      if (candidateInit) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidateInit))
        } catch {
          // Ignore candidate processing errors
        }
      }
    }
  }, [])

  // Create and initialize RTCPeerConnection
  const getOrCreatePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current
    }

    if (typeof RTCPeerConnection === 'undefined') {
      return null
    }

    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Add existing local tracks to the peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!)
      })
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0])
      }
    }

    // Handle local ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && interviewId) {
        const payload = {
          interviewId,
          candidate: event.candidate.toJSON(),
          targetSocketId: remoteParticipantRef.current?.socketId,
        }
        socketRef.current.emit('webrtc-ice-candidate', payload)
      }
    }

    // Track connection state
    pc.onconnectionstatechange = () => {
      setPeerConnectionState(pc.connectionState as PeerConnectionState)
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        setPeerConnectionState(pc.iceConnectionState as PeerConnectionState)
      }
    }

    peerConnectionRef.current = pc
    return pc
  }, [interviewId])

  // Request user camera and microphone
  const requestMedia = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMediaError('Media devices API is not supported in this environment.')
      return
    }

    setMediaError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      setLocalStream(stream)
      localStreamRef.current = stream

      // If peer connection already exists, add tracks
      const pc = peerConnectionRef.current
      if (pc) {
        const senders = pc.getSenders()
        stream.getTracks().forEach((track) => {
          const sender = senders.find((s) => s.track?.kind === track.kind)
          if (sender) {
            sender.replaceTrack(track).catch(() => {})
          } else {
            pc.addTrack(track, stream)
          }
        })
      }
    } catch (err) {
      const error = err as Error
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setMediaError('Camera and microphone access was denied. Please allow permissions in your browser.')
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setMediaError('No camera or microphone device found on your system.')
      } else {
        setMediaError(`Media device error: ${error.message || 'Unable to access camera/microphone.'}`)
      }
    }
  }, [])

  // Create WebRTC Offer
  const createAndSendOffer = useCallback(async (targetSocketId?: string) => {
    const pc = getOrCreatePeerConnection()
    if (!pc || !socketRef.current || !interviewId) return

    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      socketRef.current.emit('webrtc-offer', {
        interviewId,
        sdp: offer,
        targetSocketId,
      })
    } catch (err) {
      console.error('Failed to create WebRTC offer:', err)
    }
  }, [getOrCreatePeerConnection, interviewId])

  // Handle incoming WebRTC Offer
  const handleOffer = useCallback(async (payload: WebRTCOfferPayload) => {
    const pc = getOrCreatePeerConnection()
    if (!pc || !socketRef.current || !interviewId) return

    try {
      setRemoteParticipant({
        socketId: payload.senderSocketId,
        userId: payload.senderUserId,
        role: payload.senderRole,
        name: payload.senderName,
      })

      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      await drainIceCandidates(pc)

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      socketRef.current.emit('webrtc-answer', {
        interviewId,
        sdp: answer,
        targetSocketId: payload.senderSocketId,
      })
    } catch (err) {
      console.error('Failed to handle incoming WebRTC offer:', err)
    }
  }, [drainIceCandidates, getOrCreatePeerConnection, interviewId])

  // Handle incoming WebRTC Answer
  const handleAnswer = useCallback(async (payload: WebRTCAnswerPayload) => {
    const pc = peerConnectionRef.current
    if (!pc) return

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      await drainIceCandidates(pc)
    } catch (err) {
      console.error('Failed to handle incoming WebRTC answer:', err)
    }
  }, [drainIceCandidates])

  // Handle incoming ICE Candidate
  const handleIceCandidate = useCallback(async (payload: WebRTCIceCandidatePayload) => {
    const pc = peerConnectionRef.current
    if (!pc || !payload.candidate) return

    if (pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
      } catch (err) {
        console.error('Failed to add incoming ICE candidate:', err)
      }
    } else {
      // Buffer until remote description is set
      queuedCandidatesRef.current.push(payload.candidate)
    }
  }, [])

  // Toggle audio track state
  const toggleAudio = useCallback((explicitState?: boolean) => {
    if (!localStreamRef.current) return
    const audioTracks = localStreamRef.current.getAudioTracks()
    audioTracks.forEach((track) => {
      const nextEnabled = explicitState !== undefined ? explicitState : !track.enabled
      track.enabled = nextEnabled
    })
    setIsMicMuted((prev) => (explicitState !== undefined ? !explicitState : !prev))
  }, [])

  // Toggle video track state
  const toggleVideo = useCallback((explicitState?: boolean) => {
    if (!localStreamRef.current) return
    const videoTracks = localStreamRef.current.getVideoTracks()
    videoTracks.forEach((track) => {
      const nextEnabled = explicitState !== undefined ? explicitState : !track.enabled
      track.enabled = nextEnabled
    })
    setIsVideoDisabled((prev) => (explicitState !== undefined ? !explicitState : !prev))
  }, [])

  // Initialize Socket.io signaling connection
  useEffect(() => {
    if (!enabled || !interviewId) {
      return
    }

    setSignalingState('connecting')
    setSignalingError(null)

    const socket = createInterviewSocket(token)
    socketRef.current = socket

    socket.on('connect', () => {
      setSignalingState('connected')
      setSignalingError(null)

      // Join the interview room with server-side authorization check
      socket.emit('join-room', { interviewId }, (response: { status?: string; participants?: ParticipantInfo[]; error?: string }) => {
        if (response?.error) {
          setSignalingError(response.error)
          setSignalingState('error')
          return
        }

        if (response?.participants && response.participants.length > 0) {
          const peer = response.participants[0]
          setRemoteParticipant(peer)
          // Initiate offer toward existing participant
          createAndSendOffer(peer.socketId)
        }
      })
    })

    socket.on('participant-joined', (participant: ParticipantInfo) => {
      setRemoteParticipant(participant)
      // Existing member initiates offer to newly joined participant
      createAndSendOffer(participant.socketId)
    })

    socket.on('participant-left', (participant: ParticipantInfo) => {
      if (remoteParticipantRef.current?.socketId === participant.socketId) {
        setRemoteParticipant(null)
        setRemoteStream(null)
        setPeerConnectionState('disconnected')
      }
    })

    socket.on('webrtc-offer', (payload: WebRTCOfferPayload) => {
      handleOffer(payload)
    })

    socket.on('webrtc-answer', (payload: WebRTCAnswerPayload) => {
      handleAnswer(payload)
    })

    socket.on('webrtc-ice-candidate', (payload: WebRTCIceCandidatePayload) => {
      handleIceCandidate(payload)
    })

    socket.on('monitoring-frame-status', (payload: MonitoringFrameStatusPayload) => {
      setMonitoringFrameStatus(payload)
    })

    socket.on('connect_error', (err) => {
      setSignalingState('error')
      setSignalingError(err.message || 'Failed to connect to signaling server')
    })

    socket.on('disconnect', (reason) => {
      setSignalingState('disconnected')
      if (reason === 'io server disconnect') {
        socket.connect()
      }
    })

    socket.on('error', (data: { message?: string }) => {
      setSignalingError(data?.message || 'Socket error encountered')
    })

    // Connect socket
    socket.connect()

    // Acquire local media streams
    requestMedia()

    return () => {
      // Cleanup signaling socket
      if (socket.connected) {
        socket.emit('leave-room', { interviewId })
        socket.disconnect()
      }
      socketRef.current = null

      // Cleanup WebRTC peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }

      // Cleanup local media stream tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
        localStreamRef.current = null
      }

      setLocalStream(null)
      setRemoteStream(null)
      setSignalingState('idle')
      setPeerConnectionState('closed')
    }
  }, [
    createAndSendOffer,
    enabled,
    handleAnswer,
    handleIceCandidate,
    handleOffer,
    interviewId,
    requestMedia,
    token,
  ])

  return {
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
    socket: socketRef.current,
    toggleAudio,
    toggleVideo,
    retryMedia: requestMedia,
  }
}

