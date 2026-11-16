import { Router } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { authorizeInterviewAccess } from '../auth/resourceAccess.js';
import {
  findAlertsByInterview,
  findAlertById,
  getAlertsSummary,
} from '../alerts/alertRepository.js';
import {
  acknowledgeAlertAndNotify,
  dismissAlertAndNotify,
} from '../alerts/alertEngine.js';
import { evaluateAndEscalateAlerts } from '../alerts/alertEscalationService.js';

// Router for interview-scoped alert endpoints:
// Mounted at /interviews/:id/alerts
export const interviewAlertsRouter = Router({ mergeParams: true });

/**
 * GET /api/interviews/:id/alerts
 * Lists alerts for an interview with filtering and pagination.
 */
interviewAlertsRouter.get(
  '/',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const { status, priority, alert_type, from, to, page, limit, sortBy, sortOrder } = req.query;

    const result = await findAlertsByInterview(interviewId, {
      status,
      priority,
      alert_type,
      from,
      to,
      page,
      limit,
      sortBy,
      sortOrder,
    });

    res.status(200).json({
      status: 'ok',
      interview_id: interviewId,
      alerts: result.alerts,
      pagination: result.pagination,
    });
  })
);

/**
 * GET /api/interviews/:id/alerts/summary
 * Retrieves aggregated alert counts and priority breakdowns for an interview.
 */
interviewAlertsRouter.get(
  '/summary',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const summary = await getAlertsSummary(interviewId);

    res.status(200).json({
      status: 'ok',
      summary,
    });
  })
);

/**
 * POST /api/interviews/:id/alerts/escalate
 * Triggers an escalation evaluation for unacknowledged alerts in an interview.
 */
interviewAlertsRouter.post(
  '/escalate',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const result = await evaluateAndEscalateAlerts(interviewId, req.body || {});

    res.status(200).json({
      status: 'ok',
      ...result,
    });
  })
);

// Router for individual alert actions:
// Mounted at /alerts
export const singleAlertRouter = Router();

/**
 * GET /api/alerts/:alertId
 * Retrieves a single alert by ID.
 */
singleAlertRouter.get(
  '/:alertId',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const { alertId } = req.params;
    const alert = await findAlertById(alertId);

    if (!alert) {
      throw new AppError(`Alert '${alertId}' not found`, 404);
    }

    await authorizeInterviewAccess(req.user.id, req.user.role, alert.interview_id);

    res.status(200).json({
      status: 'ok',
      alert,
    });
  })
);

/**
 * PATCH /api/alerts/:alertId/acknowledge
 * Acknowledges an alert and broadcasts real-time update.
 */
singleAlertRouter.patch(
  '/:alertId/acknowledge',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const { alertId } = req.params;
    const alert = await findAlertById(alertId);

    if (!alert) {
      throw new AppError(`Alert '${alertId}' not found`, 404);
    }

    await authorizeInterviewAccess(req.user.id, req.user.role, alert.interview_id);

    const updated = await acknowledgeAlertAndNotify(alert._id, req.user.id);

    res.status(200).json({
      status: 'ok',
      alert: updated,
    });
  })
);

/**
 * PATCH /api/alerts/:alertId/dismiss
 * Dismisses an alert and broadcasts real-time update.
 */
singleAlertRouter.patch(
  '/:alertId/dismiss',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const { alertId } = req.params;
    const alert = await findAlertById(alertId);

    if (!alert) {
      throw new AppError(`Alert '${alertId}' not found`, 404);
    }

    await authorizeInterviewAccess(req.user.id, req.user.role, alert.interview_id);

    const updated = await dismissAlertAndNotify(alert._id, req.user.id);

    res.status(200).json({
      status: 'ok',
      alert: updated,
    });
  })
);

export default {
  interviewAlertsRouter,
  singleAlertRouter,
};

