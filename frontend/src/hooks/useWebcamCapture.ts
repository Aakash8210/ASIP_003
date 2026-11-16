import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient, FrameMetadata, FrameSubmissionPayload, FrameSubmissionResponse } from '@/lib/api'

export type CaptureState =
  | 'idle'
  | 'waiting-for-camera'
  | 'camera-unavailable'
  | 'ready'
  | 'capturing'
  | 'paused'
  | 'transmitting'
  | 'error'

export interface UseWebcamCaptureOptions {
  interviewId?: string
  stream?: MediaStream | null
  videoElement?: HTMLVideoElement | null
  videoRef?: React.RefObject<HTMLVideoElement | null>
  enabled?: boolean
  isVideoDisabled?: boolean
  intervalMs?: number
  targetWidth?: number
  targetHeight?: number
  imageFormat?: 'image/jpeg' | 'image/webp' | 'image/png'
  imageQuality?: number
  onFrameCaptured?: (metadata: FrameMetadata) => void
  onFrameTransmitted?: (response: FrameSubmissionResponse) => void
  onError?: (error: string) => void
}

export interface UseWebcamCaptureResult {
  captureState: CaptureState
  isCapturing: boolean
  capturedCount: number
  transmittedCount: number
  droppedCount: number
  lastFrameMetadata: FrameMetadata | null
  lastTransmittedAt: string | null
  lastError: string | null
  pauseCapture: () => void
  resumeCapture: () => void
  captureSingleFrame: () => Promise<FrameSubmissionResponse | null>
}

const DEFAULT_INTERVAL_MS = 1000 // 1 fps conservative default for interview integrity sampling
const DEFAULT_TARGET_WIDTH = 640
const DEFAULT_TARGET_HEIGHT = 360
const DEFAULT_FORMAT = 'image/jpeg'
const DEFAULT_QUALITY = 0.8

export function useWebcamCapture({
  interviewId,
  stream,
  videoElement,
  videoRef,
  enabled = true,
  isVideoDisabled = false,
  intervalMs = DEFAULT_INTERVAL_MS,
  targetWidth = DEFAULT_TARGET_WIDTH,
  targetHeight = DEFAULT_TARGET_HEIGHT,
  imageFormat = DEFAULT_FORMAT,
  imageQuality = DEFAULT_QUALITY,
  onFrameCaptured,
  onFrameTransmitted,
  onError,
}: UseWebcamCaptureOptions): UseWebcamCaptureResult {
  const [captureState, setCaptureState] = useState<CaptureState>('idle')
  const [capturedCount, setCapturedCount] = useState<number>(0)
  const [transmittedCount, setTransmittedCount] = useState<number>(0)
  const [droppedCount, setDroppedCount] = useState<number>(0)
  const [lastFrameMetadata, setLastFrameMetadata] = useState<FrameMetadata | null>(null)
  const [lastTransmittedAt, setLastTransmittedAt] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [isManuallyPaused, setIsManuallyPaused] = useState<boolean>(false)

  const sequenceNumberRef = useRef<number>(1)
  const isTransmittingRef = useRef<boolean>(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Pause and Resume controls
  const pauseCapture = useCallback(() => {
    setIsManuallyPaused(true)
  }, [])

  const resumeCapture = useCallback(() => {
    setIsManuallyPaused(false)
  }, [])

  // Core capture and transmission execution
  const captureAndTransmitFrame = useCallback(async (): Promise<FrameSubmissionResponse | null> => {
    if (!interviewId || !enabled || isVideoDisabled || isManuallyPaused) {
      return null
    }

    // Verify stream and active video track
    if (!stream) {
      setCaptureState('waiting-for-camera')
      return null
    }

    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack || !videoTrack.enabled || videoTrack.readyState !== 'live') {
      setCaptureState('paused')
      return null
    }

    // Verify source video element readiness
    const targetVideo = videoElement || (videoRef && videoRef.current)
    if (!targetVideo) {
      setCaptureState('waiting-for-camera')
      return null
    }

    if (
      targetVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      targetVideo.videoWidth === 0 ||
      targetVideo.videoHeight === 0
    ) {
      setCaptureState('waiting-for-camera')
      return null
    }

    // Apply backpressure: If previous frame upload is still in flight, skip this tick
    if (isTransmittingRef.current) {
      setDroppedCount((prev) => prev + 1)
      return null
    }

    try {
      setCaptureState('capturing')

      // Lazy-instantiate canvas to avoid repeated allocations
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas')
      }
      const canvas = canvasRef.current

      // Calculate output resolution preserving aspect ratio
      const srcWidth = targetVideo.videoWidth
      const srcHeight = targetVideo.videoHeight
      const aspect = srcWidth / srcHeight

      let destWidth = targetWidth
      let destHeight = targetHeight
      if (aspect >= 1) {
        destWidth = targetWidth
        destHeight = Math.max(64, Math.round(targetWidth / aspect))
      } else {
        destHeight = targetHeight
        destWidth = Math.max(64, Math.round(targetHeight * aspect))
      }

      canvas.width = destWidth
      canvas.height = destHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Canvas 2D context unavailable')
      }

      ctx.drawImage(targetVideo, 0, 0, destWidth, destHeight)

      // Asynchronous canvas-to-blob encoding
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, imageFormat, imageQuality)
      })

      if (!blob || blob.size === 0) {
        throw new Error('Canvas produced an empty frame blob')
      }

      // Convert blob to base64 Data URL for universal transmission
      const base64DataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result)
          } else {
            reject(new Error('FileReader conversion failed'))
          }
        }
        reader.onerror = () => reject(reader.error || new Error('FileReader read error'))
        reader.readAsDataURL(blob)
      })

      const seq = sequenceNumberRef.current++
      const timestamp = new Date().toISOString()

      const metadata: FrameMetadata = {
        sequenceNumber: seq,
        timestamp,
        width: destWidth,
        height: destHeight,
        format: imageFormat,
        sizeBytes: blob.size,
        captureStatus: 'captured',
      }

      setLastFrameMetadata(metadata)
      setCapturedCount((prev) => prev + 1)
      if (onFrameCaptured) {
        onFrameCaptured(metadata)
      }

      // Transmit to backend
      isTransmittingRef.current = true
      setCaptureState('transmitting')

      const payload: FrameSubmissionPayload = {
        ...metadata,
        frameData: base64DataUrl,
      }

      const response = await apiClient.submitInterviewFrame(interviewId, payload)

      const transmittedAt = new Date().toISOString()
      setTransmittedCount((prev) => prev + 1)
      setLastTransmittedAt(transmittedAt)
      setCaptureState('ready')
      setLastError(null)

      if (onFrameTransmitted) {
        onFrameTransmitted(response)
      }

      return response
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Webcam capture failure'
      setLastError(errorMsg)
      setCaptureState('error')
      if (onError) {
        onError(errorMsg)
      }
      return null
    } finally {
      isTransmittingRef.current = false
    }
  }, [
    enabled,
    imageFormat,
    imageQuality,
    interviewId,
    isManuallyPaused,
    isVideoDisabled,
    onError,
    onFrameCaptured,
    onFrameTransmitted,
    stream,
    targetHeight,
    targetWidth,
    videoElement,
    videoRef,
  ])

  // Lifecycle timer loop
  useEffect(() => {
    if (!enabled || !interviewId) {
      setCaptureState('idle')
      return
    }

    if (isVideoDisabled || isManuallyPaused) {
      setCaptureState('paused')
      return
    }

    if (!stream) {
      setCaptureState('waiting-for-camera')
      return
    }

    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack || !videoTrack.enabled || videoTrack.readyState !== 'live') {
      setCaptureState('paused')
      return
    }

    setCaptureState('ready')

    // Start periodic sampling
    timerRef.current = setInterval(() => {
      captureAndTransmitFrame().catch(() => {})
    }, intervalMs)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [
    captureAndTransmitFrame,
    enabled,
    intervalMs,
    interviewId,
    isManuallyPaused,
    isVideoDisabled,
    stream,
  ])

  // Explicit unmount cleanup: clear timers and canvas reference
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      canvasRef.current = null
    }
  }, [])

  return {
    captureState,
    isCapturing: captureState === 'capturing' || captureState === 'transmitting' || captureState === 'ready',
    capturedCount,
    transmittedCount,
    droppedCount,
    lastFrameMetadata,
    lastTransmittedAt,
    lastError,
    pauseCapture,
    resumeCapture,
    captureSingleFrame: captureAndTransmitFrame,
  }
}

