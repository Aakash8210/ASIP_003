import { AppError } from '../middleware/errorHandler.js';

export const SUPPORTED_EVENT_TYPES = [
  'FACE_ABSENCE',
  'MULTIPLE_FACES',
  'FACE_PRESENCE_CONSISTENCY',
  'FRAME_QUALITY_SUMMARY',
  'MONITORING_DATA_QUALITY',
];

export const EVENT_STATUSES = {
  ACTIVE: 'ACTIVE',
  RESOLVED: 'RESOLVED',
};

export const EVENT_CATEGORIES = {
  VISUAL_MONITORING: 'VISUAL_MONITORING',
  OPERATIONAL: 'OPERATIONAL',
};

export const EVENT_SEVERITIES = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
};

/**
 * Validates a Phase 14 BehaviourAnalysisResult structure.
 */
export function validateBehaviourAnalysisPayload(payload, expectedInterviewId = null) {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('Behaviour analysis payload is required and must be an object', 400);
  }

  const { analysis_id, interview_id, schema_version } = payload;

  if (!analysis_id || typeof analysis_id !== 'string') {
    throw new AppError('analysis_id is required and must be a string', 400);
  }

  if (!interview_id || typeof interview_id !== 'string') {
    throw new AppError('interview_id is required and must be a string', 400);
  }

  if (expectedInterviewId && interview_id !== expectedInterviewId) {
    throw new AppError(`Payload interview_id (${interview_id}) does not match requested interview (${expectedInterviewId})`, 400);
  }

  if (schema_version && typeof schema_version !== 'string') {
    throw new AppError('schema_version must be a string when provided', 400);
  }

  if (payload.signals !== undefined && !Array.isArray(payload.signals)) {
    throw new AppError('signals must be an array when provided', 400);
  }

  return true;
}

/**
 * Normalizes an eligible Phase 14 signal into a standardized monitoring event document specification.
 */
export function normalizeSignalToEvent(signal, analysisMetadata, candidateId = null) {
  const { analysis_id, interview_id, schema_version = '1.0' } = analysisMetadata;
  const signalType = signal.signal_type;

  if (!SUPPORTED_EVENT_TYPES.includes(signalType)) {
    return null;
  }

  // Determine eligibility and defaults
  let isEligible = false;
  let category = EVENT_CATEGORIES.VISUAL_MONITORING;
  let severity = EVENT_SEVERITIES.MEDIUM;
  let confidence = 0.85;
  let idempotencyKey = '';
  let isOngoing = false;

  const reliability = (signal.reliability || 'sufficient').toUpperCase();

  if (reliability === 'SUFFICIENT') confidence = 0.95;
  else if (reliability === 'DEGRADED') confidence = 0.80;
  else confidence = 0.60;

  if (signalType === 'FACE_ABSENCE') {
    isEligible = signal.status === 'observed';
    severity = EVENT_SEVERITIES.HIGH;
    isOngoing = Boolean(signal.metrics?.is_ongoing);
    const startSeq = signal.metrics?.absence_start_sequence ?? 'unknown';
    idempotencyKey = `${interview_id}:FACE_ABSENCE:${startSeq}`;
  } else if (signalType === 'MULTIPLE_FACES') {
    isEligible = signal.status === 'observed';
    severity = EVENT_SEVERITIES.HIGH;
    isOngoing = Boolean(signal.metrics?.is_ongoing);
    const startSeq = signal.metrics?.start_sequence ?? 'unknown';
    idempotencyKey = `${interview_id}:MULTIPLE_FACES:${startSeq}`;
  } else if (signalType === 'FACE_PRESENCE_CONSISTENCY') {
    // Eligible when consistency is low (< 70% presence ratio)
    isEligible = signal.status === 'observed' && signal.metrics?.classification === 'low';
    severity = EVENT_SEVERITIES.MEDIUM;
    const startTs = signal.start_timestamp || 'session';
    idempotencyKey = `${interview_id}:FACE_PRESENCE_CONSISTENCY:${startTs}`;
  } else if (signalType === 'FRAME_QUALITY_SUMMARY') {
    // Eligible when frame quality is degraded or critical unusable
    const classification = signal.metrics?.classification;
    isEligible = signal.status === 'observed' && (classification === 'degraded' || classification === 'critical_unusable');
    category = EVENT_CATEGORIES.OPERATIONAL;
    severity = classification === 'critical_unusable' ? EVENT_SEVERITIES.HIGH : EVENT_SEVERITIES.MEDIUM;
    const startTs = signal.start_timestamp || 'window';
    idempotencyKey = `${interview_id}:FRAME_QUALITY:${startTs}`;
  }

  if (!isEligible) {
    return null;
  }

  const now = new Date();
  const firstObservedAt = signal.start_timestamp ? new Date(signal.start_timestamp) : now;
  const lastObservedAt = signal.end_timestamp ? new Date(signal.end_timestamp) : firstObservedAt;

  return {
    idempotency_key: idempotencyKey,
    interview_id,
    candidate_id: candidateId,
    event_type: signalType,
    category,
    source: 'PHASE_14_BEHAVIOUR_ENGINE',
    source_analysis_id: analysis_id,
    status: isOngoing ? EVENT_STATUSES.ACTIVE : EVENT_STATUSES.RESOLVED,
    first_observed_at: firstObservedAt,
    last_observed_at: lastObservedAt,
    timestamp: firstObservedAt,
    duration_ms: typeof signal.duration_ms === 'number' ? signal.duration_ms : 0,
    occurrence_count: typeof signal.observation_count === 'number' ? signal.observation_count : 1,
    reliability,
    severity,
    confidence,
    metrics: signal.metrics || {},
    explanation: signal.explanation || '',
    schema_version: schema_version,
  };
}

/**
 * Normalizes monitoring quality into an operational event if stream continuity is degraded or unreliable.
 */
export function normalizeMonitoringQualityToEvent(monitoringQuality, analysisMetadata, candidateId = null) {
  if (!monitoringQuality || typeof monitoringQuality !== 'object') {
    return null;
  }

  const { analysis_id, interview_id, schema_version = '1.0' } = analysisMetadata;
  const status = monitoringQuality.status;

  if (status !== 'degraded' && status !== 'unreliable') {
    return null;
  }

  const severity = status === 'unreliable' ? EVENT_SEVERITIES.HIGH : EVENT_SEVERITIES.MEDIUM;
  const seqStart = monitoringQuality.sequence_range_start ?? 'stream';
  const idempotencyKey = `${interview_id}:MONITORING_DATA_QUALITY:${seqStart}`;
  const now = new Date();

  return {
    idempotency_key: idempotencyKey,
    interview_id,
    candidate_id: candidateId,
    event_type: 'MONITORING_DATA_QUALITY',
    category: EVENT_CATEGORIES.OPERATIONAL,
    source: 'PHASE_14_BEHAVIOUR_ENGINE',
    source_analysis_id: analysis_id,
    status: EVENT_STATUSES.ACTIVE,
    first_observed_at: now,
    last_observed_at: now,
    timestamp: now,
    duration_ms: 0,
    occurrence_count: monitoringQuality.total_observations || 1,
    reliability: status.toUpperCase(),
    severity,
    confidence: 0.95,
    metrics: {
      missing_sequence_count: monitoringQuality.missing_sequence_count || 0,
      duplicate_observation_count: monitoringQuality.duplicate_observation_count || 0,
      out_of_order_count: monitoringQuality.out_of_order_count || 0,
      sampling_gap_count: monitoringQuality.sampling_gap_count || 0,
      invalid_observation_count: monitoringQuality.invalid_observation_count || 0,
    },
    explanation: monitoringQuality.explanation || 'Monitoring stream experienced data continuity degradation.',
    schema_version: schema_version,
  };
}

