import express from 'express';
import authRouter from './auth.js';
import rbacRouter from './rbac.js';
import interviewsRouter from './interviews.js';
import candidatesRouter from './candidates.js';
import interviewersRouter from './interviewers.js';
import interviewerRouter from './interviewer.js';
import intervieweeRouter from './interviewee.js';
import { singleEventRouter } from './monitoringEvents.js';
import { singleAlertRouter } from './alerts.js';
import { singleEvidenceRouter } from './evidence.js';
import { rootReportsRouter } from './reports.js';
import { rootPilotFeedbackRouter } from './feedback.js';
import { organizationRouter } from './organization.js';

const router = express.Router();

/**
 * API Router
 *
 * This is the root router for all API endpoints.
 * Mount specific route modules here as they are implemented.
 *
 * Phase 6: /auth (authentication), /rbac (authorization verification)
 * Phase 7: /interviews (HR interview management), /candidates (HR candidate selection list)
 * Phase 8: /interviewers (HR interviewer selection list), /interviewer (assigned-interview + permitted report access)
 * Phase 9: /interviewee (candidate assigned-interview views)
 * Phase 10: /interviewee/interviews/:id/room, /interviewer/interviews/:id/room (interview room)
 * Phase 11: Real-time Socket.io signaling + WebRTC
 * Phase 12: Webcam frame capture & transmission
 * Phase 13: Computer Vision (FastAPI AI Service)
 * Phase 14: Observable Behaviour Signal Extraction (FastAPI AI Service)
 * Phase 15: Event Engine & Persistence (/interviews/:id/monitoring-events, /monitoring-events)
 * Phase 16: Real-Time Alerts & Notification Engine (/interviews/:id/alerts, /alerts)
 * Phase 17: Evidence System (/interviews/:id/evidence, /evidence)
 * Phase 18: Live Monitoring & Basic Integrity View (/interviews/:id/live-monitoring)
 * Phase 19: Interview Report (/interviews/:id/report, /reports)
 * Future phases will add:
 * - Phase 20: End-to-End MVP tests
 * - Phase 21: Controlled AI evaluation
 */

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'AI Interview Monitoring API',
    version: '0.1.0',
    status: 'Phase 24: SaaS Productization & Enterprise Scale',
    endpoints: {
      health: 'GET /health',
      api: 'GET /api',
    },
    documentation: 'See README.md for API documentation',
  });
});

router.use('/auth', authRouter);
router.use('/rbac', rbacRouter);
router.use('/interviews', interviewsRouter);
router.use('/monitoring-events', singleEventRouter);
router.use('/alerts', singleAlertRouter);
router.use('/evidence', singleEvidenceRouter);
router.use('/reports', rootReportsRouter);
router.use('/pilot-feedback', rootPilotFeedbackRouter);
router.use('/organization', organizationRouter);
router.use('/candidates', candidatesRouter);
router.use('/interviewers', interviewersRouter);
router.use('/interviewer', interviewerRouter);
router.use('/interviewee', intervieweeRouter);

export default router;
