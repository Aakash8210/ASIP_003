import { Router } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { authorizeInterviewAccess } from '../auth/resourceAccess.js';
import {
  findEvidenceByInterview,
  findEvidenceById,
  getEvidenceSummary,
} from '../evidence/evidenceRepository.js';

// Router for interview-scoped evidence endpoints:
// Mounted at /interviews/:id/evidence
export const interviewEvidenceRouter = Router({ mergeParams: true });

/**
 * GET /api/interviews/:id/evidence
 * Lists evidence records associated with an interview session.
 * Supports filtering by eventId and evidenceType with pagination.
 *
 * RBAC: Accessible only by HR recruiters owning the interview or the assigned interviewer.
 * Candidates (interviewee) receive 403 Forbidden.
 */
interviewEvidenceRouter.get(
  '/',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const { eventId, type, limit, offset, sortOrder } = req.query;

    const result = await findEvidenceByInterview(interviewId, {
      eventId: eventId || null,
      evidenceType: type || null,
      limit,
      offset,
      sortOrder: sortOrder === 'asc' ? 1 : -1,
    });

    res.status(200).json({
      status: 'ok',
      evidence: result.items,
      pagination: result.pagination,
    });
  })
);

/**
 * GET /api/interviews/:id/evidence/summary
 * Retrieves aggregated evidence metrics and type breakdown for an interview session.
 */
interviewEvidenceRouter.get(
  '/summary',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const summary = await getEvidenceSummary(interviewId);

    res.status(200).json({
      status: 'ok',
      summary,
    });
  })
);

// Router for standalone evidence endpoints:
// Mounted at /evidence
export const singleEvidenceRouter = Router();

/**
 * GET /api/evidence/:evidenceId
 * Retrieves a single evidence record by _id or evidence_id.
 * Enforces interview-level authorization on the evidence's parent interview.
 */
singleEvidenceRouter.get(
  '/:evidenceId',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const { evidenceId } = req.params;

    const evidence = await findEvidenceById(evidenceId);
    if (!evidence) {
      throw new AppError(`Evidence record '${evidenceId}' not found`, 404);
    }

    // Enforce interview authorization
    await authorizeInterviewAccess(req.user.id, req.user.role, evidence.interview_id);

    res.status(200).json({
      status: 'ok',
      evidence,
    });
  })
);
