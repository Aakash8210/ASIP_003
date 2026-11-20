import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import { AppError } from '../middleware/errorHandler.js';
import { sessionFrameTracker } from './frameValidator.js';
import { findEventsByInterview } from '../events/eventRepository.js';
import { findAlertsByInterview } from '../alerts/alertRepository.js';
import { getEvidenceSummary } from '../evidence/evidenceRepository.js';
import { getSocketServer } from '../socket/server.js';

/**
 * Calculates transparent, interpretable integrity indicators from observable monitoring events,
 * alerts, and frame telemetry.
 *
 * UX/Ethics Rule (PRD-FR-009, UX-INT-002):
 * Indicators must be derived strictly from observable signal counts, durations, and confidence.
 * Unexplained black-box fraud scores are strictly avoided. All descriptions use neutral,
 * objective, non-accusatory language.
 *
 * @param {Array<object>} events - Chronological monitoring event documents.
 * @param {Array<object>} alerts - Active/session alert documents.
 * @param {object} telemetry - Webcam frame capture telemetry.
 * @param {object} interview - The interview session document.
 * @returns {object} Interpretable integrity indicators breakdown.
 */
export function calculateIntegrityIndicators(events = [], alerts = [], telemetry = {}, interview = {}) {
  const eventsByType = {};
  const eventsBySeverity = { high: 0, medium: 0, low: 0, info: 0 };
  let totalConfidence = 0;
  let confidenceCount = 0;

  for (const event of events) {
    const type = event.event_type || 'UNKNOWN';
    eventsByType[type] = (eventsByType[type] || 0) + 1;

    const sev = (event.severity || 'low').toLowerCase();
    if (eventsBySeverity[sev] !== undefined) {
      eventsBySeverity[sev]++;
    }

    if (typeof event.confidence === 'number' && Number.isFinite(event.confidence)) {
      totalConfidence += event.confidence;
      confidenceCount++;
    }
  }

  const averageConfidence = confidenceCount > 0
    ? Math.round((totalConfidence / confidenceCount) * 100) / 100
    : 0.95;

  // 1. Visual Presence Consistency Indicator
  const faceAbsenceEvents = events.filter((e) => e.event_type === 'FACE_ABSENCE');
  const activeAbsence = faceAbsenceEvents.some((e) => e.status === 'ACTIVE');
  let visualConsistency;

  if (activeAbsence) {
    visualConsistency = {
      status: 'DISCONTINUOUS',
      label: 'Face Absence Detected',
      severity: 'high',
      confidence: averageConfidence,
      description: 'Face presence was not detected across recent video frames.',
      occurrences: faceAbsenceEvents.length,
    };
  } else if (faceAbsenceEvents.length > 0) {
    visualConsistency = {
      status: 'IRREGULAR',
      label: 'Transient Absence Recorded',
      severity: 'medium',
      confidence: averageConfidence,
      description: 'Intermittent face absence was recorded and subsequently resolved.',
      occurrences: faceAbsenceEvents.length,
    };
  } else {
    visualConsistency = {
      status: 'NORMAL',
      label: 'Continuous Presence Observed',
      severity: 'low',
      confidence: averageConfidence,
      description: 'Continuous single-face presence observed across monitored intervals.',
      occurrences: 0,
    };
  }

  // 2. Stream Transmission Reliability Indicator
  let streamReliability;
  if (telemetry.captureActive) {
    streamReliability = {
      status: 'STABLE',
      label: 'Stream Active & Stable',
      severity: 'low',
      description: `Continuous webcam frame capture active (${telemetry.totalFramesReceived || 0} frames transmitted at 1 fps).`,
    };
  } else if (telemetry.totalFramesReceived > 0) {
    streamReliability = {
      status: 'STANDBY',
      label: 'Stream In Standby',
      severity: 'medium',
      description: `Frame transmission currently in standby (${telemetry.totalFramesReceived} total frames received).`,
    };
  } else {
    streamReliability = {
      status: 'NOT_STARTED',
      label: 'Telemetry Standby',
      severity: 'info',
      description: 'Candidate frame capture stream has not transmitted frames yet.',
    };
  }

  // 3. Multi-Presence Observation Indicator
  const multiFaceEvents = events.filter((e) => e.event_type === 'MULTIPLE_FACES');
  let multiPresence;
  if (multiFaceEvents.length > 0) {
    multiPresence = {
      status: 'OBSERVED',
      label: 'Secondary Face Detected',
      severity: 'high',
      occurrences: multiFaceEvents.length,
      description: `Multiple faces were detected across ${multiFaceEvents.length} observation interval(s).`,
    };
  } else {
    multiPresence = {
      status: 'CLEAR',
      label: 'Single Candidate Verified',
      severity: 'low',
      occurrences: 0,
      description: 'No secondary faces detected across monitored intervals.',
    };
  }

  // 4. Alert Status Summary
  const newAlerts = alerts.filter((a) => a.status === 'NEW');
  const acknowledgedAlerts = alerts.filter((a) => a.status === 'ACKNOWLEDGED');
  const dismissedAlerts = alerts.filter((a) => a.status === 'DISMISSED');
  const highPriorityAlerts = newAlerts.filter((a) => a.priority === 'HIGH');

  // 5. Plain-language factual summary (PRD-FR-009)
  const explanationParts = [];
  if (telemetry.captureActive) {
    explanationParts.push(`Monitoring active with ${telemetry.totalFramesReceived || 0} frames sampled`);
  } else {
    explanationParts.push(`Monitoring stream currently in standby`);
  }

  if (events.length === 0) {
    explanationParts.push('no unexpected visual signals observed');
  } else {
    explanationParts.push(
      `${events.length} observable event(s) recorded (${eventsBySeverity.high} high priority, ${eventsBySeverity.medium} medium priority)`
    );
  }

  if (newAlerts.length > 0) {
    explanationParts.push(`${newAlerts.length} unresolved alert(s) requiring review`);
  } else {
    explanationParts.push('all alerts acknowledged or dismissed');
  }

  const explanation = `${explanationParts.join('; ')}. Average observation confidence: ${Math.round(averageConfidence * 100)}%.`;

  return {
    visual_consistency: visualConsistency,
    stream_reliability: streamReliability,
    multi_presence: multiPresence,
    active_alerts: {
      new_count: newAlerts.length,
      acknowledged_count: acknowledgedAlerts.length,
      dismissed_count: dismissedAlerts.length,
      high_priority_count: highPriorityAlerts.length,
    },
    event_counts: {
      total: events.length,
      by_type: eventsByType,
      by_severity: eventsBySeverity,
    },
    average_confidence: averageConfidence,
    explanation,
  };
}

/**
 * Builds a unified live monitoring state/snapshot for an interview session.
 *
 * @param {string} interviewId - The interview session ID.
 * @returns {Promise<object>} Complete live monitoring snapshot.
 */
export async function getLiveMonitoringSnapshot(interviewId) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required and must be a string', 400);
  }

  const db = requireDatabase();

  // 1. Fetch interview session
  const interview = await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).findOne({ _id: interviewId });
  if (!interview) {
    throw new AppError(`Interview session '${interviewId}' not found`, 404);
  }

  // 2. Resolve participant profiles (Candidate & Interviewer)
  let candidateUser = null;
  if (interview.candidate_id) {
    const candidateProfile = await db.collection(COLLECTIONS.CANDIDATES).findOne({ _id: interview.candidate_id });
    if (candidateProfile) {
      candidateUser = await db.collection(COLLECTIONS.USERS).findOne(
        { _id: candidateProfile.user_id },
        { projection: { password_hash: 0 } }
      );
    }
  }

  let interviewerUser = null;
  if (interview.interviewer_id) {
    interviewerUser = await db.collection(COLLECTIONS.USERS).findOne(
      { _id: interview.interviewer_id },
      { projection: { password_hash: 0 } }
    );
  }

  // 3. Candidate frame capture telemetry
  const telemetry = sessionFrameTracker.getFrameStatus(interviewId);

  // 4. Chronological monitoring events (most recent 50)
  const eventsResult = await findEventsByInterview(interviewId, {
    limit: 50,
    sortOrder: -1,
  });
  const eventList = eventsResult.events || eventsResult.items || [];

  // 5. Real-time alerts (most recent 50)
  const alertsResult = await findAlertsByInterview(interviewId, {
    limit: 50,
    sortOrder: -1,
  });
  const alertList = alertsResult.alerts || alertsResult.items || [];

  // 6. Evidence summary
  const evidenceSummary = await getEvidenceSummary(interviewId);

  // 7. Calculate interpretable integrity indicators
  const integrityIndicators = calculateIntegrityIndicators(
    eventList,
    alertList,
    telemetry,
    interview
  );

  return {
    interview_id: interviewId,
    session: {
      id: interview._id,
      title: interview.title,
      status: interview.status,
      scheduled_start_at: interview.scheduled_start_at || null,
      started_at: interview.started_at || null,
      ended_at: interview.ended_at || null,
      candidate: candidateUser ? {
        id: candidateUser._id || candidateUser.id,
        name: candidateUser.name || 'Candidate',
        email: candidateUser.email || null,
      } : null,
      interviewer: interviewerUser ? {
        id: interviewerUser._id || interviewerUser.id,
        name: interviewerUser.name || 'Interviewer',
        email: interviewerUser.email || null,
      } : null,
    },
    telemetry,
    integrity_indicators: integrityIndicators,
    events: eventList,
    alerts: alertList,
    evidence_summary: evidenceSummary,
    captured_at: new Date().toISOString(),
  };
}

/**
 * Emits real-time monitoring events or indicator updates exclusively to reviewer rooms.
 * Strictly avoids emitting to candidate sockets (Candidate protection & isolation).
 *
 * @param {string} interviewId - The interview ID.
 * @param {object} payload - Monitoring event or snapshot payload.
 * @returns {boolean} Whether dispatch succeeded.
 */
export function dispatchMonitoringUpdateToReviewers(interviewId, payload = {}) {
  const io = getSocketServer();
  if (!io) return false;

  const reviewerRoom = `interview:${interviewId}:reviewers`;
  io.to(reviewerRoom).emit('monitoring:events-update', {
    interview_id: interviewId,
    timestamp: new Date().toISOString(),
    ...payload,
  });

  return true;
}
