import {
  findUnacknowledgedAlertsForEscalation,
  incrementAlertEscalation,
} from './alertRepository.js';
import { dispatchEscalatedAlert } from './alertDispatcher.js';

/**
 * Phase 16: Alert Escalation Service
 * Handles periodic or on-demand escalation of unacknowledged high-priority alerts.
 */

export const DEFAULT_ESCALATION_CONFIG = {
  delayMs: 30000, // 30 seconds before escalation
  maxLevel: 2, // Maximum 2 escalation levels
};

/**
 * Evaluates unacknowledged alerts for an interview and escalates those exceeding the delay threshold.
 *
 * @param {string} interviewId - The interview ID.
 * @param {object} options - Custom delay and max level overrides.
 * @returns {Promise<{ evaluatedCount: number, escalatedCount: number, escalatedAlerts: Array<object> }>}
 */
export async function evaluateAndEscalateAlerts(interviewId, options = {}) {
  const delayMs = typeof options.delayMs === 'number' ? options.delayMs : DEFAULT_ESCALATION_CONFIG.delayMs;
  const maxLevel = typeof options.maxLevel === 'number' ? options.maxLevel : DEFAULT_ESCALATION_CONFIG.maxLevel;

  const olderThanDate = new Date(Date.now() - delayMs);
  const eligibleAlerts = await findUnacknowledgedAlertsForEscalation(interviewId, olderThanDate, maxLevel);

  const escalatedAlerts = [];

  for (const alert of eligibleAlerts) {
    const updated = await incrementAlertEscalation(alert._id);
    if (updated) {
      escalatedAlerts.push(updated);
      dispatchEscalatedAlert(updated, interviewId, updated.recipient_ids || []);
    }
  }

  return {
    interview_id: interviewId,
    evaluated_count: eligibleAlerts.length,
    escalated_count: escalatedAlerts.length,
    escalated_alerts: escalatedAlerts,
  };
}

