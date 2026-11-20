import { Router } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { authorizeInterviewAccess } from '../auth/resourceAccess.js';
import { getLiveMonitoringSnapshot } from '../monitoring/liveMonitoringService.js';

/**
 * Router for interview live monitoring endpoints.
 * Mounted at /interviews/:id/live-monitoring
 */
export const liveMonitoringRouter = Router({ mergeParams: true });

/**
 * GET /api/interviews/:id/live-monitoring
 * Retrieves a unified live monitoring state/snapshot for the interview session:
 * active session status, candidate frame telemetry, chronological monitoring events,
 * alerts, evidence summary, and interpretable integrity indicators.
 *
 * RBAC: Accessible only by HR recruiters owning the interview or the assigned interviewer.
 * Candidates (interviewee) receive 403 Forbidden.
 */
liveMonitoringRouter.get(
  '/',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const snapshot = await getLiveMonitoringSnapshot(interviewId);

    res.status(200).json({
      status: 'ok',
      snapshot,
    });
  })
);

/**
 * GET /api/interviews/:id/live-monitoring/indicators
 * Retrieves specifically the interpretable integrity indicators and observation summary.
 */
liveMonitoringRouter.get(
  '/indicators',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const snapshot = await getLiveMonitoringSnapshot(interviewId);

    res.status(200).json({
      status: 'ok',
      interview_id: interviewId,
      integrity_indicators: snapshot.integrity_indicators,
      telemetry: snapshot.telemetry,
      captured_at: snapshot.captured_at,
    });
  })
);

export default liveMonitoringRouter;
