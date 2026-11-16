import { Router } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { authorizeInterviewAccess } from '../auth/resourceAccess.js';
import { processBehaviourAnalysis, resolveMonitoringEvent } from '../events/eventEngine.js';
import { findEventsByInterview, findEventById, getEventsSummary } from '../events/eventRepository.js';
import { fetchSessionBehaviour } from '../services/aiServiceClient.js';

// Router for interview-scoped monitoring event endpoints:
// Mounted at /interviews/:id/monitoring-events (via interviewsRouter or direct)
export const interviewMonitoringEventsRouter = Router({ mergeParams: true });

/**
 * POST /api/interviews/:id/monitoring-events/process
 * Ingests a Phase 14 behaviour analysis payload, or pulls it from the AI service if not provided in the request body.
 */
interviewMonitoringEventsRouter.post(
  '/process',
  authenticate,
  authorize('hr', 'interviewer', 'interviewee'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    let payload = req.body;

    // If request body is empty or lacks analysis_id, pull accumulated behaviour from the AI service
    if (!payload || typeof payload !== 'object' || !payload.analysis_id) {
      payload = await fetchSessionBehaviour(interviewId);
    }

    const result = await processBehaviourAnalysis(payload, interviewId);

    res.status(200).json({
      status: 'ok',
      ...result,
    });
  })
);

/**
 * GET /api/interviews/:id/monitoring-events/summary
 * Retrieves aggregated monitoring event metrics for an interview.
 */
interviewMonitoringEventsRouter.get(
  '/summary',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const summary = await getEventsSummary(interviewId);

    res.status(200).json({
      status: 'ok',
      summary,
    });
  })
);

/**
 * GET /api/interviews/:id/monitoring-events
 * Lists monitoring events for an interview with query filtering and pagination.
 */
interviewMonitoringEventsRouter.get(
  '/',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const {
      status,
      eventType,
      event_type,
      severity,
      category,
      from,
      to,
      page,
      limit,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await findEventsByInterview(interviewId, {
      status,
      eventType,
      event_type,
      severity,
      category,
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
      events: result.events,
      pagination: result.pagination,
    });
  })
);

// Router for individual monitoring event endpoints:
// Mounted at /monitoring-events
export const singleEventRouter = Router();

/**
 * GET /api/monitoring-events/:eventId
 * Retrieves a single monitoring event by ID.
 */
singleEventRouter.get(
  '/:eventId',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const { eventId } = req.params;
    const event = await findEventById(eventId);

    if (!event) {
      throw new AppError(`Monitoring event '${eventId}' not found`, 404);
    }

    // Enforce interview access authorization for the event's parent interview
    await authorizeInterviewAccess(req.user.id, req.user.role, event.interview_id);

    res.status(200).json({
      status: 'ok',
      event,
    });
  })
);

/**
 * PATCH /api/monitoring-events/:eventId/resolve
 * Manually or programmatically marks an active monitoring event as resolved.
 */
singleEventRouter.patch(
  '/:eventId/resolve',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const { eventId } = req.params;
    const event = await findEventById(eventId);

    if (!event) {
      throw new AppError(`Monitoring event '${eventId}' not found`, 404);
    }

    await authorizeInterviewAccess(req.user.id, req.user.role, event.interview_id);

    const resolved = await resolveMonitoringEvent(eventId, req.body || {});

    res.status(200).json({
      status: 'ok',
      event: resolved,
    });
  })
);

export default {
  interviewMonitoringEventsRouter,
  singleEventRouter,
};

