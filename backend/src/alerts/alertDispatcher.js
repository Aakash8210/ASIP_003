import { getSocketServer } from '../socket/server.js';
import { SOCKET_ALERT_EVENTS } from './alertConstants.js';

/**
 * Sanitizes an alert document for safe real-time transmission.
 * Strictly excludes any private database metadata, raw frames, or internal keys.
 */
export function sanitizeAlertPayload(alert) {
  return {
    alert_id: alert.alert_id || alert._id,
    interview_id: alert.interview_id,
    candidate_id: alert.candidate_id || null,
    event_id: alert.event_id || null,
    event_type: alert.event_type,
    alert_type: alert.alert_type || 'MONITORING_EVENT',
    policy_id: alert.policy_id,
    priority: alert.priority,
    status: alert.status,
    title: alert.title,
    message: alert.message,
    metrics: alert.metrics || {},
    escalation_level: alert.escalation_level || 0,
    created_at: alert.created_at,
    updated_at: alert.updated_at,
    acknowledged_at: alert.acknowledged_at || null,
    acknowledged_by: alert.acknowledged_by || null,
    dismissed_at: alert.dismissed_at || null,
    dismissed_by: alert.dismissed_by || null,
  };
}

/**
 * Emits an alert event to authorized reviewer rooms and personal user notification rooms.
 * Strictly avoids emitting to candidate-facing socket rooms.
 *
 * @param {string} eventName - Socket event name (e.g. monitoring-alert:new).
 * @param {object} alert - The alert document.
 * @param {string} interviewId - The interview ID.
 * @param {Array<string>} recipientUserIds - User IDs authorized to receive the alert.
 * @returns {object} Dispatch summary.
 */
export function dispatchAlertToReviewers(eventName, alert, interviewId, recipientUserIds = []) {
  const io = getSocketServer();
  if (!io) {
    return { delivered: false, reason: 'SOCKET_SERVER_UNAVAILABLE' };
  }

  const payload = sanitizeAlertPayload(alert);

  // 1. Emit to isolated reviewer room for this interview (interview:<id>:reviewers)
  const reviewerRoom = `interview:${interviewId}:reviewers`;
  io.to(reviewerRoom).emit(eventName, payload);

  // 2. Also emit to each recipient's personal user room (user:<userId>) for persistent notifications across dashboard
  for (const userId of recipientUserIds) {
    if (userId) {
      io.to(`user:${userId}`).emit(eventName, payload);
    }
  }

  return { delivered: true, room: reviewerRoom, recipientsCount: recipientUserIds.length };
}

/**
 * Dispatches a newly created alert.
 */
export function dispatchNewAlert(alert, interviewId, recipientUserIds = []) {
  return dispatchAlertToReviewers(SOCKET_ALERT_EVENTS.NEW, alert, interviewId, recipientUserIds);
}

/**
 * Dispatches an updated alert.
 */
export function dispatchUpdatedAlert(alert, interviewId, recipientUserIds = []) {
  return dispatchAlertToReviewers(SOCKET_ALERT_EVENTS.UPDATED, alert, interviewId, recipientUserIds);
}

/**
 * Dispatches an acknowledged alert notification.
 */
export function dispatchAcknowledgedAlert(alert, interviewId, recipientUserIds = []) {
  return dispatchAlertToReviewers(SOCKET_ALERT_EVENTS.ACKNOWLEDGED, alert, interviewId, recipientUserIds);
}

/**
 * Dispatches a dismissed alert notification.
 */
export function dispatchDismissedAlert(alert, interviewId, recipientUserIds = []) {
  return dispatchAlertToReviewers(SOCKET_ALERT_EVENTS.DISMISSED, alert, interviewId, recipientUserIds);
}

/**
 * Dispatches an escalated alert notification.
 */
export function dispatchEscalatedAlert(alert, interviewId, recipientUserIds = []) {
  return dispatchAlertToReviewers(SOCKET_ALERT_EVENTS.ESCALATED, alert, interviewId, recipientUserIds);
}

