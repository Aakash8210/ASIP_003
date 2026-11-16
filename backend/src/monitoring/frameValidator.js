import { AppError } from '../middleware/errorHandler.js';

export const MAX_FRAME_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
export const MIN_FRAME_SIZE_BYTES = 100; // Minimum plausible image size
export const ALLOWED_FORMATS = ['image/jpeg', 'image/webp', 'image/png'];
export const MIN_DIMENSION = 64;
export const MAX_DIMENSION = 3840;

/**
 * Validates incoming webcam frame payload and metadata.
 * Ensures the frame payload has valid dimensions, timestamp, format,
 * sequence number, and valid non-empty base64 image data.
 */
export function validateFramePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('Frame payload is required and must be an object', 400);
  }

  const { sequenceNumber, timestamp, width, height, format, frameData, captureStatus } = payload;

  if (typeof sequenceNumber !== 'number' || !Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new AppError('sequenceNumber must be a positive integer', 400);
  }

  if (!timestamp || typeof timestamp !== 'string' || isNaN(Date.parse(timestamp))) {
    throw new AppError('timestamp must be a valid ISO date/time string', 400);
  }

  if (typeof width !== 'number' || !Number.isInteger(width) || width < MIN_DIMENSION || width > MAX_DIMENSION) {
    throw new AppError(`width must be an integer between ${MIN_DIMENSION} and ${MAX_DIMENSION}`, 400);
  }

  if (typeof height !== 'number' || !Number.isInteger(height) || height < MIN_DIMENSION || height > MAX_DIMENSION) {
    throw new AppError(`height must be an integer between ${MIN_DIMENSION} and ${MAX_DIMENSION}`, 400);
  }

  if (!format || typeof format !== 'string' || !ALLOWED_FORMATS.includes(format.toLowerCase())) {
    throw new AppError(`format must be one of: ${ALLOWED_FORMATS.join(', ')}`, 400);
  }

  if (!frameData || typeof frameData !== 'string') {
    throw new AppError('frameData is required and must be a base64 encoded string', 400);
  }

  // Extract base64 payload if prefixed with data URI scheme
  let rawBase64 = frameData;
  const dataUriMatch = frameData.match(/^data:image\/[a-zA-Z+]+;base64,(.+)$/);
  if (dataUriMatch) {
    rawBase64 = dataUriMatch[1];
  }

  // Calculate approximate byte size from base64 string
  const padding = (rawBase64.match(/=*$/) || [''])[0].length;
  const approxSizeBytes = Math.floor((rawBase64.length * 3) / 4) - padding;

  if (approxSizeBytes < MIN_FRAME_SIZE_BYTES) {
    throw new AppError(`Frame size (${approxSizeBytes} bytes) is below minimum required (${MIN_FRAME_SIZE_BYTES} bytes)`, 400);
  }

  if (approxSizeBytes > MAX_FRAME_SIZE_BYTES) {
    throw new AppError(`Frame size (${approxSizeBytes} bytes) exceeds maximum limit (${MAX_FRAME_SIZE_BYTES} bytes)`, 400);
  }

  return {
    sequenceNumber,
    timestamp: new Date(timestamp).toISOString(),
    width,
    height,
    format: format.toLowerCase(),
    sizeBytes: approxSizeBytes,
    frameData: frameData,
    captureStatus: captureStatus === 'degraded' ? 'degraded' : 'captured',
  };
}

/**
 * In-memory operational tracker for active session webcam frames.
 * Tracks throughput, sequence order, and timestamp of the latest frame
 * without retaining unbounded raw image blobs in persistent storage (DEC-008, DEC-012).
 */
class SessionFrameTracker {
  constructor() {
    this.sessions = new Map();
  }

  recordReceivedFrame(interviewId, validatedFrame, participantId) {
    const now = new Date().toISOString();
    const current = this.sessions.get(interviewId) || {
      interviewId,
      participantId,
      totalFramesReceived: 0,
      lastSequenceNumber: 0,
      firstCapturedAt: validatedFrame.timestamp,
      lastCapturedAt: validatedFrame.timestamp,
      lastReceivedAt: now,
      lastWidth: validatedFrame.width,
      lastHeight: validatedFrame.height,
      lastFormat: validatedFrame.format,
      lastSizeBytes: validatedFrame.sizeBytes,
    };

    current.totalFramesReceived += 1;
    current.lastSequenceNumber = validatedFrame.sequenceNumber;
    current.lastCapturedAt = validatedFrame.timestamp;
    current.lastReceivedAt = now;
    current.lastWidth = validatedFrame.width;
    current.lastHeight = validatedFrame.height;
    current.lastFormat = validatedFrame.format;
    current.lastSizeBytes = validatedFrame.sizeBytes;
    current.lastCaptureStatus = validatedFrame.captureStatus;

    this.sessions.set(interviewId, current);

    const frameId = `frame_${interviewId}_${validatedFrame.sequenceNumber}_${Date.now()}`;
    return {
      status: 'ok',
      frameId,
      sequenceNumber: validatedFrame.sequenceNumber,
      receivedAt: now,
      captureStatus: validatedFrame.captureStatus,
    };
  }

  getFrameStatus(interviewId) {
    const session = this.sessions.get(interviewId);
    if (!session) {
      return {
        status: 'ok',
        interviewId,
        captureActive: false,
        totalFramesReceived: 0,
        lastCapturedAt: null,
        lastSequenceNumber: 0,
      };
    }

    // Deem active if received frame within last 10 seconds
    const diffMs = Date.now() - new Date(session.lastReceivedAt).getTime();
    const captureActive = diffMs < 10000;

    return {
      status: 'ok',
      interviewId,
      captureActive,
      totalFramesReceived: session.totalFramesReceived,
      lastCapturedAt: session.lastCapturedAt,
      lastReceivedAt: session.lastReceivedAt,
      lastSequenceNumber: session.lastSequenceNumber,
      lastWidth: session.lastWidth,
      lastHeight: session.lastHeight,
      lastFormat: session.lastFormat,
      lastSizeBytes: session.lastSizeBytes,
      lastCaptureStatus: session.lastCaptureStatus,
    };
  }

  clearSessionTracking(interviewId) {
    this.sessions.delete(interviewId);
  }

  resetAll() {
    this.sessions.clear();
  }
}

export const sessionFrameTracker = new SessionFrameTracker();

