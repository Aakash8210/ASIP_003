import { randomUUID } from 'node:crypto';
import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  validateBehaviourAnalysisPayload,
  normalizeSignalToEvent,
  normalizeMonitoringQualityToEvent,
  EVENT_STATUSES,
} from './eventNormalizer.js';
import { processEventsBatchForAlerts } from '../alerts/alertEngine.js';
import { captureEvidenceForEvents } from '../evidence/evidenceService.js';
import { dispatchMonitoringUpdateToReviewers } from '../monitoring/liveMonitoringService.js';

/**
 * Ingests a Phase 14 BehaviourAnalysisResult payload, normalizes eligible signals into monitoring events,
 * and idempotently persists or updates them in the MongoDB monitoring_events collection.
 *
 * @param {object} analysisPayload - The BehaviourAnalysisResult object from Phase 14.
 * @param {string|null} expectedInterviewId - Optional interview ID to enforce consistency.
 * @returns {Promise<object>} Summary of processing actions and affected event records.
 */
export async function processBehaviourAnalysis(analysisPayload, expectedInterviewId = null) {
  validateBehaviourAnalysisPayload(analysisPayload, expectedInterviewId);

  const db = requireDatabase();
  const { interview_id, signals = [], monitoring_quality } = analysisPayload;

  // Verify that the interview session exists and obtain candidate context
  const interview = await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).findOne({ _id: interview_id });
  if (!interview) {
    throw new AppError(`Interview session '${interview_id}' does not exist`, 404);
  }

  const candidateId = interview.candidate_id || null;

  // 1. Normalize signals from analysisPayload.signals
  let signalsEvaluated = 0;
  const eventSpecs = [];

  for (const signal of signals) {
    signalsEvaluated++;
    const eventSpec = normalizeSignalToEvent(signal, analysisPayload, candidateId);
    if (eventSpec) {
      eventSpecs.push(eventSpec);
    }
  }

  // 2. Normalize monitoring quality if degraded or unreliable
  if (monitoring_quality) {
    signalsEvaluated++;
    const qualitySpec = normalizeMonitoringQualityToEvent(monitoring_quality, analysisPayload, candidateId);
    if (qualitySpec) {
      eventSpecs.push(qualitySpec);
    }
  }

  let createdCount = 0;
  let updatedCount = 0;
  let resolvedCount = 0;
  const persistedEvents = [];

  const now = new Date();

  // 3. Atomically upsert each normalized event spec using its deterministic idempotency_key
  for (const spec of eventSpecs) {
    const isResolving = spec.status === EVENT_STATUSES.RESOLVED;

    const filter = { idempotency_key: spec.idempotency_key };
    const update = {
      $set: {
        interview_id: spec.interview_id,
        candidate_id: spec.candidate_id,
        event_type: spec.event_type,
        category: spec.category,
        source: spec.source,
        source_analysis_id: spec.source_analysis_id,
        status: spec.status,
        last_observed_at: spec.last_observed_at,
        duration_ms: spec.duration_ms,
        occurrence_count: spec.occurrence_count,
        reliability: spec.reliability,
        severity: spec.severity,
        confidence: spec.confidence,
        metrics: spec.metrics,
        explanation: spec.explanation,
        schema_version: spec.schema_version,
        updated_at: now,
        ...(isResolving && { resolved_at: spec.last_observed_at || now }),
      },
      $setOnInsert: {
        _id: randomUUID(),
        event_id: `evt_${spec.interview_id}_${randomUUID().slice(0, 8)}`,
        first_observed_at: spec.first_observed_at,
        timestamp: spec.timestamp,
        review_status: 'unreviewed',
        created_at: now,
      },
    };

    const result = await db.collection(COLLECTIONS.MONITORING_EVENTS).findOneAndUpdate(
      filter,
      update,
      {
        upsert: true,
        returnDocument: 'after',
        includeResultMetadata: true,
      }
    );

    const doc = result.value;
    const wasExisting = result.lastErrorObject?.updatedExisting;

    if (wasExisting) {
      updatedCount++;
      if (isResolving) {
        resolvedCount++;
      }
    } else {
      createdCount++;
      if (isResolving) {
        resolvedCount++;
      }
    }

    if (doc) {
      persistedEvents.push(doc);
    }
  }

  // Phase 17: Capture and link structured evidence context for persisted monitoring events
  let evidenceSummary = null;
  try {
    evidenceSummary = await captureEvidenceForEvents(persistedEvents, analysisPayload);
  } catch (err) {
    // Fault isolation: event persistence succeeded, log evidence capture error
    console.error('[EventEngine] Evidence capture error:', err.message);
  }

  // Phase 16: Evaluate real-time alerts for persisted monitoring events
  let alertSummary = null;
  try {
    alertSummary = await processEventsBatchForAlerts(persistedEvents, interview);
  } catch (err) {
    // Fault isolation: event persistence succeeded, log alerting error
    console.error('[EventEngine] Alert processing error:', err.message);
  }

  // Phase 18: Dispatch live monitoring update to reviewer room
  try {
    dispatchMonitoringUpdateToReviewers(interview_id, {
      events_count: persistedEvents.length,
      events: persistedEvents,
      analysis_id: analysisPayload.analysis_id,
    });
  } catch (err) {
    // Fault isolation
    console.error('[EventEngine] Reviewer broadcast error:', err.message);
  }

  return {
    status: 'ok',
    interview_id,
    analysis_id: analysisPayload.analysis_id,
    signals_evaluated: signalsEvaluated,
    events_created: createdCount,
    events_updated: updatedCount,
    events_resolved: resolvedCount,
    events_ignored: signalsEvaluated - eventSpecs.length,
    events: persistedEvents,
    ...(evidenceSummary && { evidence_summary: evidenceSummary }),
    ...(alertSummary && { alert_summary: alertSummary }),
  };
}

/**
 * Manually or programmatically transitions an active monitoring event to RESOLVED.
 *
 * @param {string} eventId - The event _id or event_id.
 * @param {object} resolutionContext - Optional resolution note and timestamp.
 * @returns {Promise<object>} The updated event document.
 */
export async function resolveMonitoringEvent(eventId, resolutionContext = {}) {
  if (!eventId || typeof eventId !== 'string') {
    throw new AppError('eventId is required and must be a string', 400);
  }

  const db = requireDatabase();
  const now = new Date();
  const resolvedAt = resolutionContext.resolved_at ? new Date(resolutionContext.resolved_at) : now;

  const result = await db.collection(COLLECTIONS.MONITORING_EVENTS).findOneAndUpdate(
    {
      $or: [{ _id: eventId }, { event_id: eventId }],
      status: EVENT_STATUSES.ACTIVE,
    },
    {
      $set: {
        status: EVENT_STATUSES.RESOLVED,
        resolved_at: resolvedAt,
        updated_at: now,
        ...(resolutionContext.resolution_note && {
          'metrics.resolution_note': resolutionContext.resolution_note,
        }),
      },
    },
    {
      returnDocument: 'after',
    }
  );

  const updatedDoc = result.value !== undefined ? result.value : result;
  if (!updatedDoc) {
    const existing = await db.collection(COLLECTIONS.MONITORING_EVENTS).findOne({
      $or: [{ _id: eventId }, { event_id: eventId }],
    });
    if (!existing) {
      throw new AppError(`Monitoring event '${eventId}' not found`, 404);
    }
    // Event was found but not ACTIVE
    return existing;
  }

  return updatedDoc;
}

