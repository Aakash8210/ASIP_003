import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import { AppError } from '../middleware/errorHandler.js';
import { ALERT_TYPES } from './alertConstants.js';
import { alertPolicyService } from './alertPolicyService.js';
import { generateAlertIdempotencyKey, evaluateDeduplication } from './alertDeduplicator.js';
import {
  createOrUpdateAlert,
  findAlertById,
  acknowledgeAlert as repoAcknowledgeAlert,
  dismissAlert as repoDismissAlert,
} from './alertRepository.js';
import {
  dispatchNewAlert,
  dispatchUpdatedAlert,
  dispatchAcknowledgedAlert,
  dispatchDismissedAlert,
} from './alertDispatcher.js';

/**
 * Resolves the authorized recipient user IDs for an interview (HR recruiter owner and assigned interviewer).
 *
 * @param {object} db - MongoDB database handle.
 * @param {object} interview - The interview session document.
 * @returns {Promise<Array<string>>} Array of user IDs.
 */
async function resolveInterviewRecipients(db, interview) {
  const recipientUserIds = [];

  // 1. Resolve HR recruiter user ID from recruiter profile
  if (interview.recruiter_id) {
    const recruiter = await db.collection(COLLECTIONS.RECRUITERS).findOne({ _id: interview.recruiter_id });
    if (recruiter && recruiter.user_id) {
      recipientUserIds.push(recruiter.user_id);
    }
  }

  // 2. Resolve assigned interviewer user ID
  if (interview.interviewer_id) {
    recipientUserIds.push(interview.interviewer_id);
  }

  return [...new Set(recipientUserIds)];
}

/**
 * Evaluates a single Phase 15 monitoring event against alert policies, persists any qualifying alert idempotently,
 * and delivers real-time notifications to authorized recipients.
 *
 * @param {object} event - Phase 15 monitoring event.
 * @param {object|null} interviewDoc - Optional cached interview session.
 * @returns {Promise<object|null>} The generated alert or null if not qualifying.
 */
export async function evaluateEventForAlert(event, interviewDoc = null) {
  if (!event || typeof event !== 'object' || !event.interview_id) {
    return null;
  }

  // 1. Evaluate against configured alert policies
  const evaluation = alertPolicyService.evaluateEvent(event);
  if (!evaluation.qualifies || !evaluation.policy) {
    return null;
  }

  const db = requireDatabase();
  const interviewId = event.interview_id;

  // 2. Resolve interview and recipient identities
  const interview =
    interviewDoc || (await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).findOne({ _id: interviewId }));
  if (!interview) {
    return null;
  }

  const recipientUserIds = await resolveInterviewRecipients(db, interview);
  const idempotencyKey = generateAlertIdempotencyKey(interviewId, evaluation.policy.id, event);

  // 3. Check existing alert for deduplication
  const existingAlert = await db.collection(COLLECTIONS.ALERTS).findOne({ idempotency_key: idempotencyKey });
  const dedup = evaluateDeduplication(existingAlert, event);

  // 4. Construct normalized alert specification
  const alertSpec = {
    idempotency_key: idempotencyKey,
    interview_id: interviewId,
    candidate_id: event.candidate_id || interview.candidate_id || null,
    event_id: event.event_id || event._id || null,
    event_type: event.event_type,
    alert_type: ALERT_TYPES.MONITORING_EVENT,
    policy_id: evaluation.policy.id,
    priority: evaluation.priority,
    severity: evaluation.priority.toLowerCase(),
    title: evaluation.title,
    message: evaluation.message,
    recipient_ids: recipientUserIds,
    metrics: {
      duration_ms: event.duration_ms || 0,
      occurrence_count: event.occurrence_count || 1,
      source_confidence: event.confidence,
      reliability: event.reliability,
      ...(event.metrics || {}),
    },
  };

  // 5. Persist or update the alert atomically in MongoDB
  const { alert, isNew } = await createOrUpdateAlert(alertSpec);

  // 6. Deliver real-time Socket.io notification if eligible
  if (dedup.shouldDispatch) {
    if (isNew) {
      dispatchNewAlert(alert, interviewId, recipientUserIds);
    } else {
      dispatchUpdatedAlert(alert, interviewId, recipientUserIds);
    }
  }

  return {
    alert,
    created: isNew,
    updated: !isNew,
    dispatched: dedup.shouldDispatch,
  };
}

/**
 * Consumes a batch of Phase 15 monitoring events and evaluates alerts for each.
 *
 * @param {Array<object>} events - Array of Phase 15 monitoring event documents.
 * @param {object|null} interviewDoc - Optional cached interview session.
 * @returns {Promise<object>} Processing summary.
 */
export async function processEventsBatchForAlerts(events = [], interviewDoc = null) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      evaluated_events: 0,
      alerts_created: 0,
      alerts_updated: 0,
      alerts_dispatched: 0,
      alerts: [],
    };
  }

  let createdCount = 0;
  let updatedCount = 0;
  let dispatchedCount = 0;
  const processedAlerts = [];

  for (const event of events) {
    const result = await evaluateEventForAlert(event, interviewDoc);
    if (result && result.alert) {
      if (result.created) createdCount++;
      if (result.updated) updatedCount++;
      if (result.dispatched) dispatchedCount++;
      processedAlerts.push(result.alert);
    }
  }

  return {
    evaluated_events: events.length,
    alerts_created: createdCount,
    alerts_updated: updatedCount,
    alerts_dispatched: dispatchedCount,
    alerts: processedAlerts,
  };
}

/**
 * Acknowledges an alert and emits real-time updates over Socket.io.
 */
export async function acknowledgeAlertAndNotify(alertId, actorUserId) {
  const updated = await repoAcknowledgeAlert(alertId, actorUserId);
  if (updated) {
    dispatchAcknowledgedAlert(updated, updated.interview_id, updated.recipient_ids || []);
  }
  return updated;
}

/**
 * Dismisses an alert and emits real-time updates over Socket.io.
 */
export async function dismissAlertAndNotify(alertId, actorUserId) {
  const updated = await repoDismissAlert(alertId, actorUserId);
  if (updated) {
    dispatchDismissedAlert(updated, updated.interview_id, updated.recipient_ids || []);
  }
  return updated;
}

