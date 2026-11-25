import { randomUUID } from 'node:crypto';
import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import { AppError } from '../middleware/errorHandler.js';
import { REVIEW_STATUSES } from './reportConstants.js';
import { upsertFinalReport, findReportByInterviewId } from './reportRepository.js';
import { findEventsByInterview } from '../events/eventRepository.js';
import { findAlertsByInterview } from '../alerts/alertRepository.js';
import { getEvidenceSummary, findEvidenceByInterview } from '../evidence/evidenceRepository.js';
import { calculateIntegrityIndicators } from '../monitoring/liveMonitoringService.js';
import { sessionFrameTracker } from '../monitoring/frameValidator.js';

/**
 * Builds and persists a comprehensive final post-interview report.
 *
 * UX & Ethics Rule (PRD-FR-010, SRS-FR-009, UX-INT-002):
 * Reports present factual, transparent observation summaries, timestamps, confidence scores,
 * and evidence references. Opaque black-box fraud scores and accusatory verdicts are strictly avoided.
 *
 * @param {string} interviewId - The interview ID.
 * @param {string|null} generatedByUserId - Optional user ID triggering generation.
 * @returns {Promise<object>} The generated and persisted final report.
 */
export async function generateFinalReport(interviewId, generatedByUserId = null) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required', 400);
  }

  const db = requireDatabase();

  // 1. Fetch interview session
  const interview = await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).findOne({ _id: interviewId });
  if (!interview) {
    throw new AppError(`Interview session '${interviewId}' not found`, 404);
  }

  // 2. Fetch participant profiles
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

  let recruiterUser = null;
  if (interview.recruiter_id) {
    const recruiterProfile = await db.collection(COLLECTIONS.RECRUITERS).findOne({ _id: interview.recruiter_id });
    if (recruiterProfile) {
      recruiterUser = await db.collection(COLLECTIONS.USERS).findOne(
        { _id: recruiterProfile.user_id },
        { projection: { password_hash: 0 } }
      );
    }
  }

  // 3. Telemetry & Frame Capture
  const telemetry = sessionFrameTracker.getFrameStatus(interviewId);

  // 4. Monitoring Events
  const eventsResult = await findEventsByInterview(interviewId, {
    limit: 100,
    sortOrder: 1, // Chronological ascending for report timeline
  });
  const eventList = eventsResult.events || eventsResult.items || [];

  // 5. Alerts
  const alertsResult = await findAlertsByInterview(interviewId, {
    limit: 100,
    sortOrder: 1,
  });
  const alertList = alertsResult.alerts || alertsResult.items || [];

  // 6. Evidence references & summary
  const evidenceSummary = await getEvidenceSummary(interviewId);
  const evidenceResult = await findEvidenceByInterview(interviewId, {
    limit: 100,
    sortOrder: 1,
  });
  const evidenceItems = evidenceResult.items || [];

  // 7. Calculate Duration
  let durationSeconds = 0;
  if (interview.started_at && interview.ended_at) {
    durationSeconds = Math.max(
      0,
      Math.round((new Date(interview.ended_at).getTime() - new Date(interview.started_at).getTime()) / 1000)
    );
  } else if (interview.started_at) {
    durationSeconds = Math.max(
      0,
      Math.round((Date.now() - new Date(interview.started_at).getTime()) / 1000)
    );
  }

  // 8. Calculate Interpretable Integrity Indicators
  const integrityIndicators = calculateIntegrityIndicators(
    eventList,
    alertList,
    telemetry,
    interview
  );

  // 8b. Phase 23: Extract V2 Multimodal Insights if V2 events exist
  const v2Events = eventList.filter(
    (e) => e.version === 'v2' || e.modality === 'multimodal' || e.category === 'MULTIMODAL' || e.category === 'AUDIO_MONITORING'
  );

  let v2MultimodalInsights = null;
  if (v2Events.length > 0) {
    const audioEvents = v2Events.filter((e) => e.category === 'AUDIO_MONITORING' || e.event_type?.startsWith('AUDIO_'));
    const crossModalEvents = v2Events.filter((e) => e.event_type?.startsWith('MULTIMODAL_CORROBORATED_'));

    v2MultimodalInsights = {
      enabled: true,
      total_v2_events: v2Events.length,
      audio_observations_count: audioEvents.length,
      cross_modal_corroborations_count: crossModalEvents.length,
      corroborated_signals: crossModalEvents.map((e) => e.event_type),
      summary: crossModalEvents.length > 0
        ? `${crossModalEvents.length} cross-modal observation(s) corroborated between video and audio.`
        : `${v2Events.length} multimodal observation(s) captured during session.`,
      insights: v2Events.map((e) => ({
        event_type: e.event_type,
        explanation: e.explanation,
        severity: e.severity,
        confidence: e.confidence,
        timestamp: e.timestamp || e.first_observed_at,
      })),
    };
  }

  // 9. Format structured, objective report summary
  const notableEventIds = eventList.map((e) => e.event_id || e._id);
  const evidenceIds = evidenceItems.map((ev) => ev.evidence_id || ev._id);

  const candidateName = candidateUser?.name || 'Candidate';
  const interviewerName = interviewerUser?.name || 'Interviewer';

  const summary = `Post-interview integrity summary for ${interview.title}.\n\n` +
    `Session Status: ${interview.status.toUpperCase()} (${durationSeconds} seconds duration).\n` +
    `Participants: ${candidateName} (Candidate), ${interviewerName} (Interviewer).\n` +
    `Telemetry: ${telemetry.totalFramesReceived || 0} video frames processed at 1 fps.\n\n` +
    `Observations: ${integrityIndicators.explanation}\n` +
    `- Visual Consistency: ${integrityIndicators.visual_consistency.label} (${integrityIndicators.visual_consistency.status})\n` +
    `- Stream Reliability: ${integrityIndicators.stream_reliability.label} (${integrityIndicators.stream_reliability.status})\n` +
    `- Secondary Presence: ${integrityIndicators.multi_presence.label} (${integrityIndicators.multi_presence.status})\n` +
    `- Alert Summary: ${alertList.length} total alert(s), ${integrityIndicators.active_alerts.new_count} unacknowledged at conclusion.`;

  // 10. Check for existing report to preserve human review state
  const existingReport = await findReportByInterviewId(interviewId);

  const reportDoc = {
    _id: existingReport?._id || randomUUID(),
    report_id: existingReport?.report_id || `rpt_${interviewId.slice(0, 8)}_${randomUUID().slice(0, 8)}`,
    interview_id: interviewId,
    candidate_id: interview.candidate_id || null,
    recruiter_id: interview.recruiter_id || null,
    interviewer_id: interview.interviewer_id || null,
    session_metadata: {
      title: interview.title,
      status: interview.status,
      scheduled_start_at: interview.scheduled_start_at || null,
      started_at: interview.started_at || null,
      ended_at: interview.ended_at || null,
      duration_seconds: durationSeconds,
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
      recruiter: recruiterUser ? {
        id: recruiterUser._id || recruiterUser.id,
        name: recruiterUser.name || 'Recruiter',
        email: recruiterUser.email || null,
      } : null,
      telemetry,
    },
    summary,
    integrity_indicators: integrityIndicators,
    v2_multimodal_insights: v2MultimodalInsights,
    notable_event_ids: notableEventIds,
    events: eventList,
    alerts: alertList,
    evidence_ids: evidenceIds,
    evidence_summary: evidenceSummary,
    review_status: existingReport?.review_status || REVIEW_STATUSES.PENDING_REVIEW,
    review_notes: existingReport?.review_notes || null,
    reviewed_by: existingReport?.reviewed_by || null,
    reviewed_at: existingReport?.reviewed_at || null,
    generated_by: generatedByUserId,
    generated_at: existingReport?.generated_at || new Date(),
  };

  return upsertFinalReport(reportDoc);
}
