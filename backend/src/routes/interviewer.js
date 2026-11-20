import { Router } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { authorizeInterviewAccess } from '../auth/resourceAccess.js';
import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import {
  PersistenceError,
  listInterviewsByInterviewer,
  findFinalReportByInterviewId,
  startInterviewSession,
  completeInterviewSession,
  getInterviewRoomContext,
} from '../db/persistence.js';
import { sessionFrameTracker } from '../monitoring/frameValidator.js';
import { findReportByInterviewId } from '../reports/reportRepository.js';
import { generateFinalReport } from '../reports/reportGenerator.js';

function mapPersistenceError(error) {
  if (error instanceof PersistenceError) {
    if (error.code === 'INVALID_FIELD') return new AppError(error.message, 400);
    if (error.code === 'INVALID_REFERENCE') return new AppError(error.message, 400);
    if (error.code === 'NOT_FOUND') return new AppError('Interview not found', 404);
    if (error.code === 'INVALID_STATE') return new AppError(error.message || 'Interview is not in a state that allows this action', 409);
    return new AppError('The operation could not be completed', 500);
  }
  return error;
}

const router = Router();

// Interviewer product (Phase 8, UX-INT-001, DEC-029): assigned-interview
// views over the existing interview_sessions documents. Interviewer access
// is enforced by authorizeInterviewAccess — interview_sessions.interviewer_id
// must equal the authenticated interviewer user's id. Live monitoring
// (UX-INT-002), WebRTC, events, alerts and evidence belong to later phases
// and are intentionally not exposed here.

async function interviewerCandidateDisplay(interview) {
  if (!interview.candidate_id) return null;
  const db = requireDatabase();
  const candidate = await db.collection(COLLECTIONS.CANDIDATES).findOne({ _id: interview.candidate_id });
  if (!candidate) return null;
  const user = await db
    .collection(COLLECTIONS.USERS)
    .findOne({ _id: candidate.user_id }, { projection: { name: 1 } });
  return { id: candidate._id, name: user ? user.name : null };
}

function shapeInterviewerInterview(interview, candidate) {
  return {
    id: interview._id,
    title: interview.title,
    status: interview.status,
    scheduled_start_at: interview.scheduled_start_at ?? null,
    started_at: interview.started_at ?? null,
    ended_at: interview.ended_at ?? null,
    candidate: candidate ?? interview.candidate ?? null,
    created_at: interview.created_at,
    updated_at: interview.updated_at,
  };
}

router.get('/interviews', authenticate, authorize('interviewer'), asyncHandler(async (req, res) => {
  const interviews = await listInterviewsByInterviewer(req.user.id);
  res.status(200).json({
    status: 'ok',
    interviews: interviews.map((i) => shapeInterviewerInterview(i, i.candidate)),
  });
}));

router.get('/interviews/:id', authenticate, authorize('interviewer'), asyncHandler(async (req, res) => {
  const interview = await authorizeInterviewAccess(req.user.id, req.user.role, req.params.id);
  const candidate = await interviewerCandidateDisplay(interview);
  res.status(200).json({
    status: 'ok',
    interview: shapeInterviewerInterview(interview, candidate),
  });
}));

// Permitted report access (PRD-FR-010, Database Spec §13). Report generation
// belongs to Phase 19; when no report exists the endpoint responds 404 with a
// truthful message instead of fabricating one.
router.get('/interviews/:id/report', authenticate, authorize('interviewer'), asyncHandler(async (req, res) => {
  const interview = await authorizeInterviewAccess(req.user.id, req.user.role, req.params.id);
  const report = await findReportByInterviewId(interview._id);
  if (!report) {
    throw new AppError('Report will be available after the interview is completed and reviewed', 404);
  }
  res.status(200).json({
    status: 'ok',
    report: {
      ...report,
      id: report._id || report.id,
    },
  });
}));

// Interview Room (Phase 10, UX-INT-001/PRD-FR-004):
// Controlled interview room access for the assigned interviewer.
router.get('/interviews/:id/room', authenticate, authorize('interviewer'), asyncHandler(async (req, res) => {
  const interview = await authorizeInterviewAccess(req.user.id, req.user.role, req.params.id);
  const roomContext = await getInterviewRoomContext(interview._id);
  res.status(200).json({
    status: 'ok',
    room: roomContext,
  });
}));

router.post('/interviews/:id/room/join', authenticate, authorize('interviewer'), asyncHandler(async (req, res) => {
  const interview = await authorizeInterviewAccess(req.user.id, req.user.role, req.params.id);
  let updated;
  try {
    updated = await startInterviewSession(interview._id);
  } catch (err) {
    throw mapPersistenceError(err);
  }
  const roomContext = await getInterviewRoomContext(updated._id);
  res.status(200).json({
    status: 'ok',
    room: roomContext,
  });
}));

router.post('/interviews/:id/room/end', authenticate, authorize('interviewer'), asyncHandler(async (req, res) => {
  const interview = await authorizeInterviewAccess(req.user.id, req.user.role, req.params.id);
  let updated;
  try {
    updated = await completeInterviewSession(interview._id);
  } catch (err) {
    throw mapPersistenceError(err);
  }
  const candidate = await interviewerCandidateDisplay(updated);
  res.status(200).json({
    status: 'ok',
    interview: shapeInterviewerInterview(updated, candidate),
  });
}));

// Query webcam frame capture status for the candidate (Phase 12, UX-INT-001)
router.get('/interviews/:id/frames/status', authenticate, authorize('interviewer'), asyncHandler(async (req, res) => {
  const interview = await authorizeInterviewAccess(req.user.id, req.user.role, req.params.id);
  const status = sessionFrameTracker.getFrameStatus(interview._id);
  res.status(200).json(status);
}));

export default router;
