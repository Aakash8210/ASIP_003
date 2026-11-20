import { Router } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { authorizeInterviewAccess } from '../auth/resourceAccess.js';
import { toProductRole } from '../auth/roles.js';
import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import {
  findReportByInterviewId,
  findReportById,
  updateReportReview,
  listReports,
} from '../reports/reportRepository.js';
import { generateFinalReport } from '../reports/reportGenerator.js';
import { findRecruiterByUserId } from '../db/persistence.js';

// Router for interview-scoped report endpoints:
// Mounted at /interviews/:id/report
export const interviewReportRouter = Router({ mergeParams: true });

/**
 * GET /api/interviews/:id/report
 * Retrieves the post-interview report for an interview session.
 * If the interview is completed but no report was pre-generated, generates it on the fly.
 *
 * RBAC: Accessible only by HR recruiters owning the interview or the assigned interviewer.
 * Candidates (interviewee) receive 403 Forbidden.
 */
interviewReportRouter.get(
  '/',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    const interview = await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    let report = await findReportByInterviewId(interviewId);

    if (!report) {
      if (interview.status === 'completed') {
        // Auto-generate report on demand for completed sessions
        report = await generateFinalReport(interviewId, req.user.id);
      } else {
        throw new AppError('Report will be available after the interview is completed and reviewed', 404);
      }
    }

    res.status(200).json({
      status: 'ok',
      report,
    });
  })
);

/**
 * POST /api/interviews/:id/report/generate
 * Explicitly triggers report generation or regeneration for an interview session.
 */
interviewReportRouter.post(
  '/generate',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const report = await generateFinalReport(interviewId, req.user.id);

    res.status(200).json({
      status: 'ok',
      report,
    });
  })
);

/**
 * PATCH /api/interviews/:id/report/review
 * Updates the human review status and review notes for a report.
 */
interviewReportRouter.patch(
  '/review',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const { review_status, review_notes } = req.body || {};
    if (!review_status) {
      throw new AppError('review_status is required', 400);
    }

    const updated = await updateReportReview(interviewId, {
      review_status,
      review_notes,
      reviewed_by: req.user.id,
    });

    res.status(200).json({
      status: 'ok',
      report: updated,
    });
  })
);

// Router for root /reports endpoints:
// Mounted at /reports
export const rootReportsRouter = Router();

/**
 * GET /api/reports
 * Lists final reports accessible to the authenticated reviewer (HR or Interviewer).
 */
rootReportsRouter.get(
  '/',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const { limit, offset, status, reviewStatus, sortOrder } = req.query;
    const query = {};

    const effectiveStatus = reviewStatus || status;
    if (effectiveStatus) {
      query.review_status = effectiveStatus;
    }

    const productRole = toProductRole(req.user.role) || req.user.role;
    if (productRole === 'interviewer') {
      // Interviewer sees reports for interviews assigned to them
      query.interviewer_id = req.user.id;
    } else if (productRole === 'hr' || req.user.role === 'recruiter') {
      // HR sees reports for interviews they recruited/owned
      const recruiterProfile = await findRecruiterByUserId(req.user.id);
      if (recruiterProfile) {
        query.recruiter_id = recruiterProfile._id;
      }
    }

    const result = await listReports(query, {
      limit,
      offset,
      sortOrder: sortOrder === 'asc' ? 1 : -1,
    });

    res.status(200).json({
      status: 'ok',
      reports: result.reports,
      pagination: result.pagination,
    });
  })
);

/**
 * GET /api/reports/:reportId
 * Retrieves a single report by ID with interview access authorization.
 */
rootReportsRouter.get(
  '/:reportId',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const { reportId } = req.params;
    const report = await findReportById(reportId);
    if (!report) {
      throw new AppError(`Report '${reportId}' not found`, 404);
    }

    // Enforce interview authorization
    await authorizeInterviewAccess(req.user.id, req.user.role, report.interview_id);

    res.status(200).json({
      status: 'ok',
      report,
    });
  })
);

export default interviewReportRouter;
