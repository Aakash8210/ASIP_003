import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'interview_monitoring_reports_test';
process.env.JWT_SECRET = 'phase19-reports-test-secret';

const TEST_DB_NAME = 'interview_monitoring_reports_test';

const { default: app } = await import('../src/app.js');
const { connectDatabase, closeDatabase, getDatabaseName } = await import('../src/config/database.js');
const { ensureBaselineIndexes } = await import('../src/db/indexes.js');
const { COLLECTIONS } = await import('../src/db/collections.js');
const { signToken } = await import('../src/auth/tokens.js');
const { REVIEW_STATUSES } = await import('../src/reports/reportConstants.js');
const {
  upsertFinalReport,
  findReportByInterviewId,
  findReportById,
  updateReportReview,
  listReports,
} = await import('../src/reports/reportRepository.js');
const { generateFinalReport } = await import('../src/reports/reportGenerator.js');
const { completeInterviewSession, startInterviewSession } = await import('../src/db/persistence.js');
const { sessionFrameTracker } = await import('../src/monitoring/frameValidator.js');

let httpServer;
let port;

const makeRequest = (path, { method = 'GET', body, token, origin = 'http://localhost:5180' } = {}) => {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      Origin: origin,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = data;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

describe('Phase 19: Interview Report System', () => {
  let db;

  // Test users & tokens
  let hrUser, hrToken, recruiter;
  let hr2User, hr2Token, recruiter2;
  let interviewerUser, interviewerToken;
  let unassignedInterviewerUser, unassignedInterviewerToken;
  let candidateUser, candidateToken, candidateProfile;

  // Test interview session
  let interviewId;

  before(async () => {
    db = await connectDatabase();
    assert.strictEqual(getDatabaseName(), TEST_DB_NAME);
    await ensureBaselineIndexes(db);

    // Start HTTP server on dynamic port
    await new Promise((resolve) => {
      httpServer = http.createServer(app);
      httpServer.listen(0, '127.0.0.1', () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    // 1. Seed HR recruiter 1
    hrUser = {
      _id: randomUUID(),
      name: 'Primary Recruiter',
      email: 'recruiter1@test.com',
      role: 'recruiter',
      password_hash: 'hashed',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.USERS).insertOne(hrUser);
    recruiter = {
      _id: randomUUID(),
      user_id: hrUser._id,
      company: 'TechCorp',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.RECRUITERS).insertOne(recruiter);
    hrToken = signToken({ sub: hrUser._id, role: 'recruiter', email: hrUser.email });

    // 2. Seed HR recruiter 2 (unauthorized to interview 1)
    hr2User = {
      _id: randomUUID(),
      name: 'Secondary Recruiter',
      email: 'recruiter2@test.com',
      role: 'recruiter',
      password_hash: 'hashed',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.USERS).insertOne(hr2User);
    recruiter2 = {
      _id: randomUUID(),
      user_id: hr2User._id,
      company: 'OtherCorp',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.RECRUITERS).insertOne(recruiter2);
    hr2Token = signToken({ sub: hr2User._id, role: 'recruiter', email: hr2User.email });

    // 3. Seed Interviewer 1 (assigned)
    interviewerUser = {
      _id: randomUUID(),
      name: 'Lead Interviewer',
      email: 'interviewer1@test.com',
      role: 'interviewer',
      password_hash: 'hashed',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.USERS).insertOne(interviewerUser);
    interviewerToken = signToken({ sub: interviewerUser._id, role: 'interviewer', email: interviewerUser.email });

    // 4. Seed Interviewer 2 (unassigned)
    unassignedInterviewerUser = {
      _id: randomUUID(),
      name: 'Other Interviewer',
      email: 'interviewer2@test.com',
      role: 'interviewer',
      password_hash: 'hashed',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.USERS).insertOne(unassignedInterviewerUser);
    unassignedInterviewerToken = signToken({
      sub: unassignedInterviewerUser._id,
      role: 'interviewer',
      email: unassignedInterviewerUser.email,
    });

    // 5. Seed Candidate
    candidateUser = {
      _id: randomUUID(),
      name: 'Jane Candidate',
      email: 'candidate@test.com',
      role: 'candidate',
      password_hash: 'hashed',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.USERS).insertOne(candidateUser);
    candidateProfile = {
      _id: randomUUID(),
      user_id: candidateUser._id,
      name: candidateUser.name,
      email: candidateUser.email,
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.CANDIDATES).insertOne(candidateProfile);
    candidateToken = signToken({ sub: candidateUser._id, role: 'candidate', email: candidateUser.email });

    // 6. Seed completed interview session
    interviewId = randomUUID();
    const startTime = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    const endTime = new Date(Date.now() - 600 * 1000); // 10 minutes ago
    await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).insertOne({
      _id: interviewId,
      title: 'Senior Software Engineer System Design',
      recruiter_id: recruiter._id,
      interviewer_id: interviewerUser._id,
      candidate_id: candidateProfile._id,
      status: 'completed',
      scheduled_start_at: startTime,
      started_at: startTime,
      ended_at: endTime,
      created_at: startTime,
      updated_at: endTime,
    });

    // 7. Seed telemetry
    sessionFrameTracker.recordReceivedFrame(
      interviewId,
      {
        timestamp: new Date().toISOString(),
        sequenceNumber: 1,
        width: 640,
        height: 480,
        format: 'image/jpeg',
        sizeBytes: 15000,
        captureStatus: 'NORMAL',
      },
      candidateProfile._id
    );

    // 8. Seed monitoring events
    await db.collection(COLLECTIONS.MONITORING_EVENTS).insertMany([
      {
        _id: randomUUID(),
        event_id: `evt_${randomUUID().slice(0, 8)}`,
        interview_id: interviewId,
        event_type: 'LOOKING_AWAY',
        severity: 'low',
        confidence: 0.85,
        timestamp: new Date(Date.now() - 2500 * 1000),
        data: { duration_seconds: 4 },
        created_at: new Date(Date.now() - 2500 * 1000),
      },
      {
        _id: randomUUID(),
        event_id: `evt_${randomUUID().slice(0, 8)}`,
        interview_id: interviewId,
        event_type: 'MULTIPLE_FACES',
        severity: 'high',
        confidence: 0.92,
        timestamp: new Date(Date.now() - 1500 * 1000),
        data: { persons_detected: 2 },
        created_at: new Date(Date.now() - 1500 * 1000),
      },
    ]);

    // 9. Seed alert
    await db.collection(COLLECTIONS.ALERTS).insertOne({
      _id: randomUUID(),
      alert_id: `alt_${randomUUID().slice(0, 8)}`,
      interview_id: interviewId,
      severity: 'high',
      status: 'NEW',
      message: 'Secondary presence observed in candidate camera view',
      created_at: new Date(Date.now() - 1500 * 1000),
    });

    // 10. Seed evidence
    await db.collection(COLLECTIONS.EVIDENCE).insertOne({
      _id: randomUUID(),
      evidence_id: `evd_${randomUUID().slice(0, 8)}`,
      interview_id: interviewId,
      evidence_type: 'bounding_box',
      retention_class: 'standard',
      captured_at: new Date(Date.now() - 1500 * 1000),
      expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      context: { observation: 'Secondary presence observed' },
      metadata: { size_bytes: 512 },
      created_at: new Date(),
    });
  });

  after(async () => {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    if (db) {
      await db.dropDatabase();
      await closeDatabase();
    }
  });

  describe('Report Generator & Persistence Unit Logic', () => {
    it('generates an audit-ready, objective post-interview report', async () => {
      const report = await generateFinalReport(interviewId, hrUser._id);

      assert.ok(report);
      assert.strictEqual(report.interview_id, interviewId);
      assert.strictEqual(report.candidate_id, candidateProfile._id);
      assert.strictEqual(report.interviewer_id, interviewerUser._id);
      assert.strictEqual(report.recruiter_id, recruiter._id);

      // Verify Session Metadata
      assert.strictEqual(report.session_metadata.title, 'Senior Software Engineer System Design');
      assert.strictEqual(report.session_metadata.status, 'completed');
      assert.strictEqual(report.session_metadata.candidate.name, 'Jane Candidate');
      assert.strictEqual(report.session_metadata.interviewer.name, 'Lead Interviewer');
      assert.strictEqual(report.session_metadata.recruiter.name, 'Primary Recruiter');
      assert.ok(report.session_metadata.duration_seconds > 0);

      // Verify Interpretable Integrity Indicators
      assert.ok(report.integrity_indicators);
      assert.ok(report.integrity_indicators.visual_consistency);
      assert.ok(report.integrity_indicators.stream_reliability);
      assert.ok(report.integrity_indicators.multi_presence);
      assert.strictEqual(report.integrity_indicators.multi_presence.occurrences, 1);
      assert.strictEqual(report.integrity_indicators.active_alerts.new_count, 1);

      // Verify Events & Evidence aggregated
      assert.strictEqual(report.events.length, 2);
      assert.strictEqual(report.alerts.length, 1);
      assert.strictEqual(report.evidence_ids.length, 1);
      assert.strictEqual(report.evidence_summary.total_evidence, 1);

      // Verify Initial Review State
      assert.strictEqual(report.review_status, REVIEW_STATUSES.PENDING_REVIEW);
      assert.strictEqual(report.review_notes, null);

      // Verify Neutral Factual Narrative
      assert.ok(typeof report.summary === 'string');
      assert.ok(report.summary.includes('Post-interview integrity summary'));
      assert.ok(!report.summary.includes('cheating') && !report.summary.includes('guilty'));

      // Verify Persisted in MongoDB
      const stored = await findReportByInterviewId(interviewId);
      assert.ok(stored);
      assert.strictEqual(stored.report_id, report.report_id);
    });

    it('is idempotent: re-generating updates data while preserving human review state', async () => {
      // First update review state
      await updateReportReview(interviewId, {
        review_status: REVIEW_STATUSES.FLAGGED_FOR_FOLLOWUP,
        review_notes: 'Reviewed camera view - secondary person verified in frame for 3s.',
        reviewed_by: interviewerUser._id,
      });

      // Regenerate report
      const regenerated = await generateFinalReport(interviewId, hrUser._id);

      // Review status and notes must be preserved!
      assert.strictEqual(regenerated.review_status, REVIEW_STATUSES.FLAGGED_FOR_FOLLOWUP);
      assert.strictEqual(regenerated.review_notes, 'Reviewed camera view - secondary person verified in frame for 3s.');
      assert.strictEqual(regenerated.reviewed_by, interviewerUser._id);
      assert.ok(regenerated.reviewed_at);
    });
  });

  describe('Report Retrieval REST Endpoint: GET /api/interviews/:id/report', () => {
    it('returns 200 and the report for owning HR recruiter', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/report`, {
        method: 'GET',
        token: hrToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.report);
      assert.strictEqual(res.body.report.interview_id, interviewId);
      assert.strictEqual(res.body.report.session_metadata.title, 'Senior Software Engineer System Design');
    });

    it('returns 200 and the report for assigned interviewer', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/report`, {
        method: 'GET',
        token: interviewerToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.report.interview_id, interviewId);
    });

    it('returns 403 for unassigned interviewer', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/report`, {
        method: 'GET',
        token: unassignedInterviewerToken,
      });

      assert.strictEqual(res.statusCode, 403);
    });

    it('returns 403 for non-owning HR recruiter', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/report`, {
        method: 'GET',
        token: hr2Token,
      });

      assert.strictEqual(res.statusCode, 403);
    });

    it('returns 403 for candidate (privacy protection)', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/report`, {
        method: 'GET',
        token: candidateToken,
      });

      assert.strictEqual(res.statusCode, 403);
    });

    it('returns 401 for unauthenticated request', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/report`, {
        method: 'GET',
      });

      assert.strictEqual(res.statusCode, 401);
    });
  });

  describe('Report Generation REST Endpoint: POST /api/interviews/:id/report/generate', () => {
    it('allows HR recruiter to force generate a fresh report', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/report/generate`, {
        method: 'POST',
        token: hrToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.report);
      assert.strictEqual(res.body.report.interview_id, interviewId);
    });

    it('allows assigned interviewer to force generate a fresh report', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/report/generate`, {
        method: 'POST',
        token: interviewerToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.report.interview_id, interviewId);
    });

    it('returns 403 for candidate', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/report/generate`, {
        method: 'POST',
        token: candidateToken,
      });

      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('Report Review Workflow REST Endpoint: PATCH /api/interviews/:id/report/review', () => {
    it('allows reviewer to sign off with REVIEWED status and feedback notes', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/report/review`, {
        method: 'PATCH',
        token: hrToken,
        body: {
          review_status: 'REVIEWED',
          review_notes: 'All timeline observations verified. Overall candidate presentation satisfactory.',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.report.review_status, 'REVIEWED');
      assert.strictEqual(
        res.body.report.review_notes,
        'All timeline observations verified. Overall candidate presentation satisfactory.'
      );
      assert.strictEqual(res.body.report.reviewed_by, hrUser._id);
      assert.ok(res.body.report.reviewed_at);
    });

    it('returns 400 when an invalid review_status is provided', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/report/review`, {
        method: 'PATCH',
        token: hrToken,
        body: {
          review_status: 'INVALID_STATUS',
        },
      });

      assert.strictEqual(res.statusCode, 400);
    });

    it('returns 403 for unassigned interviewer', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/report/review`, {
        method: 'PATCH',
        token: unassignedInterviewerToken,
        body: {
          review_status: 'REVIEWED',
        },
      });

      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('Reports List REST Endpoint: GET /api/reports', () => {
    it('allows HR recruiter to list reports scoped to their recruiter account', async () => {
      const res = await makeRequest('/api/reports', {
        method: 'GET',
        token: hrToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(Array.isArray(res.body.reports));
      assert.ok(res.body.reports.length >= 1);
      assert.strictEqual(res.body.reports[0].interview_id, interviewId);
      assert.ok(res.body.pagination);
      assert.strictEqual(res.body.pagination.total, 1);
    });

    it('allows assigned interviewer to list reports scoped to their assignments', async () => {
      const res = await makeRequest('/api/reports', {
        method: 'GET',
        token: interviewerToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.reports.length, 1);
    });

    it('returns empty list for an interviewer with no assigned reports', async () => {
      const res = await makeRequest('/api/reports', {
        method: 'GET',
        token: unassignedInterviewerToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.reports.length, 0);
    });

    it('supports reviewStatus filtering', async () => {
      const res = await makeRequest('/api/reports?reviewStatus=REVIEWED', {
        method: 'GET',
        token: hrToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.reports.length, 1);

      const pendingRes = await makeRequest('/api/reports?reviewStatus=FLAGGED_FOR_FOLLOWUP', {
        method: 'GET',
        token: hrToken,
      });

      assert.strictEqual(pendingRes.statusCode, 200);
      assert.strictEqual(pendingRes.body.reports.length, 0);
    });

    it('returns 403 for candidate users', async () => {
      const res = await makeRequest('/api/reports', {
        method: 'GET',
        token: candidateToken,
      });

      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('Auto-Generation on Session Completion Hook', () => {
    it('compiles report automatically into final_reports when completeInterviewSession is called', async () => {
      // Create another interview
      const newInterviewId = randomUUID();
      const startTime = new Date();
      await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).insertOne({
        _id: newInterviewId,
        title: 'Backend Node.js Systems Interview',
        recruiter_id: recruiter._id,
        interviewer_id: interviewerUser._id,
        candidate_id: candidateProfile._id,
        status: 'in_progress',
        scheduled_start_at: startTime,
        started_at: startTime,
        created_at: startTime,
        updated_at: startTime,
      });

      // Complete session via persistence
      const completed = await completeInterviewSession(newInterviewId);
      assert.strictEqual(completed.status, 'completed');

      // Verify report was automatically created in final_reports
      const autoReport = await findReportByInterviewId(newInterviewId);
      assert.ok(autoReport);
      assert.strictEqual(autoReport.interview_id, newInterviewId);
      assert.strictEqual(autoReport.session_metadata.title, 'Backend Node.js Systems Interview');
      assert.strictEqual(autoReport.review_status, REVIEW_STATUSES.PENDING_REVIEW);
    });
  });
});
