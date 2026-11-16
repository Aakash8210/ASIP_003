/**
 * Phase 16: Alert Deduplicator & Idempotency Strategy
 */

/**
 * Generates a deterministic idempotency key for an alert based on interview, policy, and event run identifier.
 *
 * @param {string} interviewId - The interview ID.
 * @param {string} policyId - The alert policy identifier.
 * @param {object} event - The Phase 15 source event.
 * @returns {string} The unique idempotency key.
 */
export function generateAlertIdempotencyKey(interviewId, policyId, event) {
  const eventRunKey = event.idempotency_key || event.event_id || event._id || 'unknown';
  return `${interviewId}:${policyId}:${eventRunKey}`;
}

/**
 * Determines whether a new event update should trigger a notification or be suppressed as duplicate.
 *
 * @param {object|null} existingAlert - Existing alert in database if any.
 * @param {object} event - New incoming event.
 * @returns {{ shouldDispatch: boolean, action: 'CREATE' | 'UPDATE' | 'SUPPRESS' }}
 */
export function evaluateDeduplication(existingAlert, event) {
  if (!existingAlert) {
    return { shouldDispatch: true, action: 'CREATE' };
  }

  // If the alert was already acknowledged or dismissed by a human reviewer, suppress re-alerting
  if (existingAlert.status === 'ACKNOWLEDGED' || existingAlert.status === 'DISMISSED') {
    return { shouldDispatch: false, action: 'SUPPRESS' };
  }

  // If alert is in NEW status, check if significant time or duration has elapsed
  const existingDuration = existingAlert.metrics?.duration_ms || 0;
  const newDuration = event.duration_ms || 0;

  // Suppress duplicate socket emissions for minor duration increments within 5 seconds
  if (newDuration > 0 && Math.abs(newDuration - existingDuration) < 5000) {
    return { shouldDispatch: false, action: 'UPDATE' };
  }

  return { shouldDispatch: true, action: 'UPDATE' };
}

