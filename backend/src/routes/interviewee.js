import { Router } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { authorizeInterviewAccess } from '../auth/resourceAccess.js';
import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import {
  PersistenceError,
  findCandidateByUserId,
  listInterviewsByCandidate,
  startInterviewSession,
  getInterviewRoomContext,
} from '../db/persistence.js';
import { validateFramePayload, sessionFrameTracker } from '../monitoring/frameValidator.js';

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

// Candidate/Interviewee product (Phase 9, UX-CAN-001/002): authorized
// assigned-interview views over the existing interview_sessions documents.
// Candidate access is enforced by authorizeInterviewAccess — the
// authenticated user must map to a candidate profile whose id equals
// interview_sessions.candidate_id. System check is a client-side browser
// capability flow (no readiness persistence is documented); the interview
// room (Phase 10), monitoring and alerts are intentionally not exposed here.

async function requireCandidateProfile(userId) {
  const profile = await findCandidateByUserId(userId);
  if (!profile) {
    throw new AppError('A candidate profile is required for this operation', 403);
  }
  return profile;
}

function interviewerDisplay(interviewerId) {
  if (!interviewerId) return Promise.resolve(null);
  const db = requireDatabase();
  return db
    .collection(COLLECTIONS.USERS)
    .findOne({ _id: interviewerId }, { projection: { name: 1 } })
    .then((user) => (user ? { id: user._id, name: user.name } : null));
}

function shapeCandidateInterview(interview, interviewer) {
  return {
    id: interview._id,
    title: interview.title,
    status: interview.status,
    scheduled_start_at: interview.scheduled_start_at ?? null,
    started_at: interview.started_at ?? null,
    ended_at: interview.ended_at ?? null,
    interviewer: interviewer ?? interview.interviewer ?? null,
    created_at: interview.created_at,
    updated_at: interview.updated_at,
  };
}

router.get('/interviews', authenticate, authorize('interviewee'), asyncHandler(async (req, res) => {
  const profile = await requireCandidateProfile(req.user.id);
  const interviews = await listInterviewsByCandidate(profile._id);
  const interviewerIds = new Set(interviews.map((i) => i.interviewer?.id).filter(Boolean));
  const names = new Map();
  for (const id of interviewerIds) {
    names.set(id, await interviewerDisplay(id));
  }
  res.status(200).json({
    status: 'ok',
    interviews: interviews.map((i) => shapeCandidateInterview(i, i.interviewer?.id ? names.get(i.interviewer.id) : null)),
  });
}));

router.get('/interviews/:id', authenticate, authorize('interviewee'), asyncHandler(async (req, res) => {
  await requireCandidateProfile(req.user.id);
  const interview = await authorizeInterviewAccess(req.user.id, req.user.role, req.params.id);
  const interviewer = await interviewerDisplay(interview.interviewer_id);
  res.status(200).json({
    status: 'ok',
    interview: shapeCandidateInterview(interview, interviewer),
  });
}));

// Interview Room (Phase 10, UX-CAN-003, PRD-FR-004, SRS-FR-008/009):
// Controlled interview room access for the authorized candidate.
router.get('/interviews/:id/room', authenticate, authorize('interviewee'), asyncHandler(async (req, res) => {
  await requireCandidateProfile(req.user.id);
  const interview = await authorizeInterviewAccess(req.user.id, req.user.role, req.params.id);
  const roomContext = await getInterviewRoomContext(interview._id);
  res.status(200).json({
    status: 'ok',
    room: roomContext,
  });
}));

router.post('/interviews/:id/room/join', authenticate, authorize('interviewee'), asyncHandler(async (req, res) => {
  await requireCandidateProfile(req.user.id);
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

router.post('/interviews/:id/room/leave', authenticate, authorize('interviewee'), asyncHandler(async (req, res) => {
  await requireCandidateProfile(req.user.id);
  await authorizeInterviewAccess(req.user.id, req.user.role, req.params.id);
  res.status(200).json({
    status: 'ok',
    message: 'Left interview room successfully',
  });
}));

// Submit sampled webcam frame for monitoring (Phase 12, PRD-FR-005, SRS-FR-008/011)
router.post('/interviews/:id/frames', authenticate, authorize('interviewee'), asyncHandler(async (req, res) => {
  await requireCandidateProfile(req.user.id);
  const interview = await authorizeInterviewAccess(req.user.id, req.user.role, req.params.id);

  if (interview.status === 'completed') {
    throw new AppError('interview has already been completed', 409);
  }
  if (interview.status !== 'in_progress') {
    throw new AppError('interview session is not in progress', 409);
  }

  const validatedFrame = validateFramePayload(req.body);
  const result = sessionFrameTracker.recordReceivedFrame(interview._id, validatedFrame, req.user.id);

  res.status(200).json(result);
}));

// Query current webcam frame capture status (Phase 12)
router.get('/interviews/:id/frames/status', authenticate, authorize('interviewee'), asyncHandler(async (req, res) => {
  await requireCandidateProfile(req.user.id);
  const interview = await authorizeInterviewAccess(req.user.id, req.user.role, req.params.id);
  const status = sessionFrameTracker.getFrameStatus(interview._id);
  res.status(200).json(status);
}));

export default router;
