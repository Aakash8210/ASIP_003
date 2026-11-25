import { Router } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { authorizeInterviewAccess } from '../auth/resourceAccess.js';
import {
  savePilotFeedback,
  findFeedbackByInterview,
  getPilotFeedbackSummary,
  listAllPilotFeedback,
} from '../feedback/feedbackRepository.js';

// Router for interview-scoped feedback endpoints:
// Mounted at /api/interviews/:id/feedback
export const interviewFeedbackRouter = Router({ mergeParams: true });

/**
 * POST /api/interviews/:id/feedback
 * Submits structured pilot feedback for an interview session.
 *
 * RBAC: Accessible by candidate, assigned interviewer, or HR recruiter owning the interview.
 * Explicit pilot consent acknowledgment is required.
 */
interviewFeedbackRouter.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const { feedback, isNew } = await savePilotFeedback({
      ...req.body,
      interview_id: interviewId,
      user_id: req.user.id,
      role: req.user.role,
    });

    res.status(isNew ? 201 : 200).json({
      status: 'ok',
      feedback,
      isNew,
    });
  })
);

/**
 * GET /api/interviews/:id/feedback
 * Retrieves feedback for an interview session.
 *
 * RBAC:
 * - Candidate (interviewee) can only retrieve their own feedback record (privacy boundary).
 * - Reviewers (HR, assigned interviewer) can retrieve all feedback for the interview.
 */
interviewFeedbackRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const isCandidate = req.user.role === 'interviewee' || req.user.role === 'candidate';

    if (isCandidate) {
      const records = await findFeedbackByInterview(interviewId, { userId: req.user.id });
      res.status(200).json({
        status: 'ok',
        feedback: records[0] || null,
      });
      return;
    }

    // HR or assigned interviewer
    const records = await findFeedbackByInterview(interviewId);
    res.status(200).json({
      status: 'ok',
      feedback: records,
    });
  })
);

// Router for system-level pilot feedback management:
// Mounted at /api/pilot-feedback
export const rootPilotFeedbackRouter = Router();

/**
 * GET /api/pilot-feedback/summary
 * Aggregates overall pilot feedback ratings, friction points, and role distribution.
 *
 * RBAC: HR only.
 */
rootPilotFeedbackRouter.get(
  '/summary',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const summary = await getPilotFeedbackSummary();
    res.status(200).json({
      status: 'ok',
      summary,
    });
  })
);

/**
 * GET /api/pilot-feedback
 * Lists all pilot feedback submissions with pagination.
 *
 * RBAC: HR only.
 */
rootPilotFeedbackRouter.get(
  '/',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const result = await listAllPilotFeedback(req.query);
    res.status(200).json({
      status: 'ok',
      ...result,
    });
  })
);
