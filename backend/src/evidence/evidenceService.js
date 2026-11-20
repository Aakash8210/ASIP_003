import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import {
  EVIDENCE_TYPES,
  RETENTION_CLASSES,
  EVIDENCE_MIME_TYPES,
} from './evidenceConstants.js';
import { createOrUpdateEvidence } from './evidenceRepository.js';

/**
 * Constructs an evidence specification for a persisted monitoring event.
 * Stores structured observation context, timestamps, confidence, metrics,
 * and retention metadata without persisting large raw media blobs (PRD-FR-008).
 *
 * @param {object} event - Normalized and persisted monitoring event document.
 * @param {object} analysisPayload - Source Phase 14 BehaviourAnalysisResult.
 * @returns {object} Normalized evidence specification.
 */
export function buildEvidenceSpecForEvent(event, analysisPayload = {}) {
  const isQualitySignal =
    event.event_type === 'FRAME_QUALITY_SUMMARY' ||
    event.event_type === 'MONITORING_DATA_QUALITY';

  const evidenceType = isQualitySignal
    ? EVIDENCE_TYPES.QUALITY_TELEMETRY
    : EVIDENCE_TYPES.OBSERVATION_CONTEXT;

  const metadata = {
    event_id: event.event_id || event._id,
    event_type: event.event_type,
    category: event.category || 'VISUAL_MONITORING',
    source: event.source || 'ai-service:behaviour-signal-engine',
    source_analysis_id: event.source_analysis_id || analysisPayload.analysis_id || null,
    severity: event.severity,
    confidence: event.confidence,
    reliability: event.reliability,
    duration_ms: event.duration_ms || 0,
    occurrence_count: event.occurrence_count || 1,
    metrics: event.metrics || {},
    explanation: event.explanation || null,
    schema_version: analysisPayload.schema_version || event.schema_version || 'v1.0',
    captured_at: new Date().toISOString(),
  };

  const serializedMetadata = JSON.stringify(metadata);
  const sizeBytes = Buffer.byteLength(serializedMetadata, 'utf8');

  // Deterministic idempotency key tied to interview, event identity, and event idempotency
  const idempotencyKey = `evd_${event.interview_id}_${event.event_id || event._id}_${event.idempotency_key || 'ctx'}`;

  return {
    interview_id: event.interview_id,
    event_id: event.event_id || event._id,
    evidence_type: evidenceType,
    storage_reference: null, // Structured contextual metadata stored directly in MongoDB
    start_time: event.first_observed_at || event.timestamp,
    end_time: event.last_observed_at || event.timestamp,
    content_hash: null,
    size_bytes: sizeBytes,
    mime_type: EVIDENCE_MIME_TYPES.JSON,
    metadata,
    retention_class: RETENTION_CLASSES.STANDARD,
    idempotency_key: idempotencyKey,
  };
}

/**
 * Ingestion hook: Evaluates a batch of persisted monitoring events, generates
 * structured evidence context records, persists them, and links their evidence IDs
 * back to the corresponding monitoring_events documents.
 *
 * @param {Array<object>} events - Batch of persisted monitoring event documents.
 * @param {object} analysisPayload - Source BehaviourAnalysisResult.
 * @returns {Promise<object>} Processing summary.
 */
export async function captureEvidenceForEvents(events = [], analysisPayload = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      evaluated_count: 0,
      evidence_created: 0,
      evidence_linked: 0,
      evidence: [],
    };
  }

  const db = requireDatabase();
  const evidenceRecords = [];
  let createdCount = 0;

  for (const event of events) {
    // Generate and upsert evidence spec
    const spec = buildEvidenceSpecForEvent(event, analysisPayload);
    const evidenceDoc = await createOrUpdateEvidence(spec);

    if (evidenceDoc) {
      evidenceRecords.push(evidenceDoc);
      createdCount++;

      // Link evidence_id and evidence _id back to monitoring event document
      const eventTargetId = event._id || event.event_id;
      const evidenceIdToLink = evidenceDoc.evidence_id || evidenceDoc._id;

      await db.collection(COLLECTIONS.MONITORING_EVENTS).updateOne(
        { $or: [{ _id: eventTargetId }, { event_id: eventTargetId }] },
        {
          $addToSet: {
            evidence_ids: evidenceIdToLink,
          },
        }
      );
    }
  }

  return {
    evaluated_count: events.length,
    evidence_created: createdCount,
    evidence_linked: evidenceRecords.length,
    created_or_updated: createdCount,
    created_count: createdCount,
    evidence: evidenceRecords,
  };
}
