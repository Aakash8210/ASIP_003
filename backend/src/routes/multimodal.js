import { Router } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../auth/middleware.js';
import { authorizeInterviewAccess } from '../auth/resourceAccess.js';
import {
  analyzeAudio,
  analyzeTranscript,
  analyzeMultimodal,
} from '../services/aiServiceClient.js';
import { processMultimodalFusion } from '../events/eventEngine.js';
import { findEventsByInterview } from '../events/eventRepository.js';

export const multimodalRouter = Router({ mergeParams: true });

/**
 * POST /api/interviews/:id/multimodal/audio
 * Submits audio telemetry chunk for observable acoustic feature analysis.
 *
 * RBAC: Accessible by candidate, assigned interviewer, or owning HR recruiter.
 * Requires explicit consent acknowledgment.
 */
multimodalRouter.post(
  '/audio',
  authenticate,
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const consent = req.body?.consent_acknowledged ?? req.body?.pilot_consent_acknowledged;
    if (consent !== true) {
      throw new AppError('Explicit consent required for audio telemetry processing (consent_acknowledged must be true)', 400);
    }

    const result = await analyzeAudio(interviewId, {
      ...req.body,
      consent_acknowledged: true,
    });

    res.status(200).json({
      status: 'ok',
      result,
    });
  })
);

/**
 * POST /api/interviews/:id/multimodal/transcript
 * Submits transcript text/segments for observable lexical and pacing analysis.
 *
 * RBAC: Accessible by candidate, assigned interviewer, or owning HR recruiter.
 * Requires explicit consent acknowledgment.
 */
multimodalRouter.post(
  '/transcript',
  authenticate,
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const consent = req.body?.consent_acknowledged ?? req.body?.pilot_consent_acknowledged;
    if (consent !== true) {
      throw new AppError('Explicit consent required for transcript telemetry processing (consent_acknowledged must be true)', 400);
    }

    const result = await analyzeTranscript(interviewId, {
      ...req.body,
      consent_acknowledged: true,
    });

    res.status(200).json({
      status: 'ok',
      result,
    });
  })
);

/**
 * POST /api/interviews/:id/multimodal/fuse
 * Executes multimodal fusion combining visual, audio, and transcript observations.
 * Persists any corroborated/notable signals into monitoring_events (version: 'v2').
 *
 * RBAC: Reviewer only (HR, assigned interviewer). Candidates receive 403.
 */
multimodalRouter.post(
  '/fuse',
  authenticate,
  authorize('hr', 'interviewer'),
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const consent = req.body?.consent_acknowledged ?? req.body?.pilot_consent_acknowledged ?? true;
    if (consent !== true) {
      throw new AppError('Explicit consent required for multimodal fusion processing', 400);
    }

    // Call AI service fusion engine
    const fusionResult = await analyzeMultimodal(interviewId, {
      ...req.body,
      consent_acknowledged: true,
    });

    // Ingest into event engine
    const eventSummary = await processMultimodalFusion(fusionResult, interviewId);

    res.status(200).json({
      status: 'ok',
      fusion: fusionResult,
      events_created: eventSummary.events_created,
      events_updated: eventSummary.events_updated,
    });
  })
);

/**
 * GET /api/interviews/:id/multimodal
 * Retrieves V2 multimodal events and observations for an interview session.
 *
 * RBAC:
 * - Reviewers (HR, assigned interviewer): returns all V2 multimodal events.
 * - Candidates: receive 403 (candidate privacy boundary protects reviewer-facing multimodal analysis).
 */
multimodalRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const interviewId = req.params.id;
    await authorizeInterviewAccess(req.user.id, req.user.role, interviewId);

    const isCandidate = req.user.role === 'candidate' || req.user.role === 'interviewee';
    if (isCandidate) {
      throw new AppError('Candidates do not have access to internal reviewer multimodal analysis', 403);
    }

    const eventsResult = await findEventsByInterview(interviewId, {
      category: 'MULTIMODAL',
      limit: 50,
      sortOrder: 'desc',
    });

    res.status(200).json({
      status: 'ok',
      interview_id: interviewId,
      multimodal_events: eventsResult.events || [],
      count: eventsResult.pagination?.total || 0,
    });
  })
);
