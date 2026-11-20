import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { io as Client } from 'socket.io-client';

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'interview_monitoring_live_test';
process.env.JWT_SECRET = 'phase18-live-test-secret';

const TEST_DB_NAME = 'interview_monitoring_live_test';

const { default: app } = await import('../src/app.js');
const { initializeSocketServer } = await import('../src/socket/server.js');
const { connectDatabase, closeDatabase, getDatabaseName } = await import('../src/config/database.js');
const { ensureBaselineIndexes } = await import('../src/db/indexes.js');
const { COLLECTIONS } = await import('../src/db/collections.js');
const {
  calculateIntegrityIndicators,
  getLiveMonitoringSnapshot,
  dispatchMonitoringUpdateToReviewers,
} = await import('../src/monitoring/liveMonitoringService.js');
const { sessionFrameTracker } = await import('../src/monitoring/frameValidator.js');
const { createOrUpdateAlert } = await import('../src/alerts/alertRepository.js');
const { createOrUpdateEvidence } = await import('../src/evidence/evidenceRepository.js');
const { EVIDENCE_TYPES, RETENTION_CLASSES } = await import('../src/evidence/evidenceConstants.js');

let httpServer;
let ioServer;
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

const createClientSocket = (token, options = {}) => {
  return Client(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
    forceNew: true,
    ...options,
  });
};

describe('Phase 18: Live Monitoring & Basic Integrity View', () => {
  const users = {};
  let db;
  let testInterview;
  let hrProfile;
  let otherHrProfile;
  let candidateProfile;
  let interviewerUser;
  let otherInterviewerUser;

  before(async () => {
    db = await connectDatabase();
    assert.ok(db, 'MongoDB connection must succeed for Phase 18 tests');
    assert.strictEqual(getDatabaseName(), TEST_DB_NAME);
    await ensureBaselineIndexes(db);

    // Clean test collections
    await db.collection(COLLECTIONS.USERS).deleteMany({ email: /@live-test\.local/ });
    await db.collection(COLLECTIONS.RECRUITERS).deleteMany({});
    await db.collection(COLLECTIONS.CANDIDATES).deleteMany({});
    await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).deleteMany({});
    await db.collection(COLLECTIONS.MONITORING_EVENTS).deleteMany({});
    await db.collection(COLLECTIONS.ALERTS).deleteMany({});
    await db.collection(COLLECTIONS.EVIDENCE).deleteMany({});

    httpServer = http.createServer(app);
    ioServer = initializeSocketServer(httpServer);

    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    const createTestUser = async (email, password, role, name) => {
      const reg = await makeRequest('/api/auth/register', {
        method: 'POST',
        body: { email, password, role, name },
      });
      assert.strictEqual(reg.statusCode, 201, `Failed to register ${email}: ${JSON.stringify(reg.body)}`);
      return {
        user: reg.body.user,
        token: reg.body.token,
      };
    };

    users.hr = await createTestUser('hr-owner@live-test.local', 'Password123!', 'hr', 'HR Owner');
    users.otherHr = await createTestUser('hr-other@live-test.local', 'Password123!', 'hr', 'Other HR');
    users.interviewer = await createTestUser('interviewer-assigned@live-test.local', 'Password123!', 'interviewer', 'Assigned Interviewer');
    users.otherInterviewer = await createTestUser('interviewer-other@live-test.local', 'Password123!', 'interviewer', 'Other Interviewer');
    users.candidate = await createTestUser('candidate@live-test.local', 'Password123!', 'interviewee', 'Candidate Person');

    hrProfile = await db.collection(COLLECTIONS.RECRUITERS).findOne({ user_id: users.hr.user.id });
    otherHrProfile = await db.collection(COLLECTIONS.RECRUITERS).findOne({ user_id: users.otherHr.user.id });
    candidateProfile = await db.collection(COLLECTIONS.CANDIDATES).findOne({ user_id: users.candidate.user.id });
    interviewerUser = users.interviewer.user;
    otherInterviewerUser = users.otherInterviewer.user;

    // Create active interview session
    testInterview = {
      _id: randomUUID(),
      title: 'Senior Engineering Integrity Evaluation',
      recruiter_id: hrProfile._id,
      candidate_id: candidateProfile._id,
      interviewer_id: interviewerUser.id,
      status: 'in_progress',
      scheduled_start_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).insertOne(testInterview);
  });

  after(async () => {
    if (ioServer) {
      ioServer.close();
    }
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    if (db) {
      await db.dropDatabase();
      await closeDatabase();
    }
  });

  describe('1. Interpretable Integrity Indicators Calculation Unit Tests', () => {
    it('calculates NORMAL visual consistency, STABLE stream, and CLEAR multi-presence with clean observations', () => {
      const events = [];
      const alerts = [];
      const telemetry = {
        captureActive: true,
        totalFramesReceived: 60,
      };

      const indicators = calculateIntegrityIndicators(events, alerts, telemetry, testInterview);

      assert.strictEqual(indicators.visual_consistency.status, 'NORMAL');
      assert.strictEqual(indicators.visual_consistency.severity, 'low');
      assert.strictEqual(indicators.stream_reliability.status, 'STABLE');
      assert.strictEqual(indicators.multi_presence.status, 'CLEAR');
      assert.strictEqual(indicators.active_alerts.new_count, 0);
      assert.ok(indicators.explanation.includes('Continuous webcam frame capture active') || indicators.explanation.includes('Monitoring active'));
      assert.ok(indicators.explanation.includes('no unexpected visual signals observed'));
    });

    it('identifies DISCONTINUOUS visual presence on active FACE_ABSENCE event', () => {
      const events = [
        {
          event_type: 'FACE_ABSENCE',
          status: 'ACTIVE',
          severity: 'high',
          confidence: 0.96,
          duration_ms: 4000,
        },
      ];
      const indicators = calculateIntegrityIndicators(events, [], { captureActive: true, totalFramesReceived: 10 });

      assert.strictEqual(indicators.visual_consistency.status, 'DISCONTINUOUS');
      assert.strictEqual(indicators.visual_consistency.severity, 'high');
      assert.strictEqual(indicators.event_counts.by_type.FACE_ABSENCE, 1);
      assert.strictEqual(indicators.event_counts.by_severity.high, 1);
    });

    it('identifies OBSERVED secondary presence on MULTIPLE_FACES event', () => {
      const events = [
        {
          event_type: 'MULTIPLE_FACES',
          status: 'ACTIVE',
          severity: 'high',
          confidence: 0.92,
        },
      ];
      const indicators = calculateIntegrityIndicators(events, [], { captureActive: true, totalFramesReceived: 20 });

      assert.strictEqual(indicators.multi_presence.status, 'OBSERVED');
      assert.strictEqual(indicators.multi_presence.occurrences, 1);
    });

    it('reports STANDBY stream when frames were received but capture is inactive', () => {
      const telemetry = { captureActive: false, totalFramesReceived: 50 };
      const indicators = calculateIntegrityIndicators([], [], telemetry);

      assert.strictEqual(indicators.stream_reliability.status, 'STANDBY');
    });
  });

  describe('2. Live Monitoring Snapshot Aggregation', () => {
    before(async () => {
      // Seed an event, an alert, and an evidence item for testInterview
      const eventDoc = {
        _id: randomUUID(),
        event_id: `evt_${testInterview._id}_1`,
        interview_id: testInterview._id,
        candidate_id: candidateProfile._id,
        event_type: 'FACE_ABSENCE',
        category: 'VISUAL_MONITORING',
        severity: 'high',
        confidence: 0.95,
        status: 'ACTIVE',
        occurrence_count: 1,
        duration_ms: 3200,
        first_observed_at: new Date().toISOString(),
        last_observed_at: new Date().toISOString(),
        created_at: new Date(),
        updated_at: new Date(),
      };
      await db.collection(COLLECTIONS.MONITORING_EVENTS).insertOne(eventDoc);

      await createOrUpdateAlert({
        idempotency_key: `live-alert-${randomUUID()}`,
        interview_id: testInterview._id,
        candidate_id: candidateProfile._id,
        event_id: eventDoc.event_id,
        event_type: 'FACE_ABSENCE',
        priority: 'HIGH',
        title: 'Face absence observed',
        message: 'No face detected during monitored interval.',
      });

      await createOrUpdateEvidence({
        interview_id: testInterview._id,
        event_id: eventDoc.event_id,
        evidence_type: EVIDENCE_TYPES.OBSERVATION_CONTEXT,
        retention_class: RETENTION_CLASSES.STANDARD,
        metadata: { event_type: 'FACE_ABSENCE', confidence: 0.95 },
      });
    });

    it('builds unified live monitoring snapshot with session, telemetry, events, alerts, and indicators', async () => {
      const snapshot = await getLiveMonitoringSnapshot(testInterview._id);

      assert.strictEqual(snapshot.interview_id, testInterview._id);
      assert.strictEqual(snapshot.session.title, testInterview.title);
      assert.strictEqual(snapshot.session.status, 'in_progress');
      assert.ok(snapshot.session.candidate);
      assert.ok(snapshot.session.interviewer);
      assert.ok(snapshot.telemetry);
      assert.ok(snapshot.integrity_indicators);
      assert.ok(Array.isArray(snapshot.events));
      assert.ok(snapshot.events.length >= 1);
      assert.ok(Array.isArray(snapshot.alerts));
      assert.ok(snapshot.alerts.length >= 1);
      assert.ok(snapshot.evidence_summary);
      assert.strictEqual(snapshot.integrity_indicators.visual_consistency.status, 'DISCONTINUOUS');
    });

    it('rejects non-existent interviewId with 404 AppError', async () => {
      await assert.rejects(
        async () => getLiveMonitoringSnapshot('non-existent-session-id'),
        (err) => err.statusCode === 404
      );
    });
  });

  describe('3. Socket.io Reviewer Broadcast & Candidate Isolation', () => {
    it('delivers real-time monitoring update exclusively to reviewer room and NOT to candidate', async () => {
      const reviewerSocket = createClientSocket(users.interviewer.token);
      const candidateSocket = createClientSocket(users.candidate.token);

      await Promise.all([
        new Promise((resolve) => reviewerSocket.on('connect', resolve)),
        new Promise((resolve) => candidateSocket.on('connect', resolve)),
      ]);

      // Reviewer joins reviewer room
      reviewerSocket.emit('join-room', { interviewId: testInterview._id, role: 'interviewer' });
      // Candidate joins normal room
      candidateSocket.emit('join-room', { interviewId: testInterview._id, role: 'candidate' });

      await new Promise((resolve) => setTimeout(resolve, 100));

      let reviewerReceived = false;
      let candidateReceived = false;

      reviewerSocket.on('monitoring:events-update', () => {
        reviewerReceived = true;
      });

      candidateSocket.on('monitoring:events-update', () => {
        candidateReceived = true;
      });

      dispatchMonitoringUpdateToReviewers(testInterview._id, {
        events_count: 1,
        message: 'Telemetry update',
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      assert.strictEqual(reviewerReceived, true, 'Reviewer must receive monitoring event update');
      assert.strictEqual(candidateReceived, false, 'Candidate must NOT receive reviewer monitoring event update');

      reviewerSocket.disconnect();
      candidateSocket.disconnect();
    });
  });

  describe('4. REST API Endpoints & RBAC Security Verification', () => {
    it('rejects unauthenticated request to GET /api/interviews/:id/live-monitoring with 401', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/live-monitoring`);
      assert.strictEqual(res.statusCode, 401);
    });

    it('rejects candidate request to GET /api/interviews/:id/live-monitoring with 403 Forbidden', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/live-monitoring`, {
        token: users.candidate.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects unassigned interviewer with 403 Forbidden', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/live-monitoring`, {
        token: users.otherInterviewer.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects non-owning HR recruiter with 403 Forbidden', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/live-monitoring`, {
        token: users.otherHr.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('allows assigned interviewer to access GET /api/interviews/:id/live-monitoring', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/live-monitoring`, {
        token: users.interviewer.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.snapshot.interview_id, testInterview._id);
      assert.ok(res.body.snapshot.integrity_indicators);
      assert.ok(Array.isArray(res.body.snapshot.events));
    });

    it('allows owner HR recruiter to access GET /api/interviews/:id/live-monitoring', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/live-monitoring`, {
        token: users.hr.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.snapshot.session.id, testInterview._id);
    });

    it('allows access to GET /api/interviews/:id/live-monitoring/indicators', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/live-monitoring/indicators`, {
        token: users.interviewer.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.interview_id, testInterview._id);
      assert.ok(res.body.integrity_indicators);
      assert.ok(res.body.telemetry);
    });
  });
});
