import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { io as Client } from 'socket.io-client';

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'interview_monitoring_alerts_test';
process.env.JWT_SECRET = 'phase16-alerts-test-secret';

const TEST_DB_NAME = 'interview_monitoring_alerts_test';

const { default: app } = await import('../src/app.js');
const { initializeSocketServer } = await import('../src/socket/server.js');
const { connectDatabase, closeDatabase, getDatabaseName } = await import('../src/config/database.js');
const { ensureBaselineIndexes } = await import('../src/db/indexes.js');
const { COLLECTIONS } = await import('../src/db/collections.js');
const { alertPolicyService } = await import('../src/alerts/alertPolicyService.js');
const { generateAlertIdempotencyKey, evaluateDeduplication } = await import('../src/alerts/alertDeduplicator.js');
const {
  createOrUpdateAlert,
  findAlertsByInterview,
  findAlertById,
  getAlertsSummary,
  acknowledgeAlert,
  dismissAlert,
  incrementAlertEscalation,
} = await import('../src/alerts/alertRepository.js');
const {
  evaluateEventForAlert,
  processEventsBatchForAlerts,
  acknowledgeAlertAndNotify,
  dismissAlertAndNotify,
} = await import('../src/alerts/alertEngine.js');
const { evaluateAndEscalateAlerts } = await import('../src/alerts/alertEscalationService.js');

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

describe('Phase 16: Real-Time Alerts & Notification Engine', () => {
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
    assert.ok(db, 'MongoDB connection must succeed for Phase 16 tests');
    assert.strictEqual(getDatabaseName(), TEST_DB_NAME);
    await ensureBaselineIndexes(db);

    // Clean test collections
    await db.collection(COLLECTIONS.USERS).deleteMany({ email: /@alerts-test\.local/ });
    await db.collection(COLLECTIONS.RECRUITERS).deleteMany({});
    await db.collection(COLLECTIONS.CANDIDATES).deleteMany({});
    await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).deleteMany({});
    await db.collection(COLLECTIONS.MONITORING_EVENTS).deleteMany({});
    await db.collection(COLLECTIONS.ALERTS).deleteMany({});

    httpServer = http.createServer(app);
    ioServer = initializeSocketServer(httpServer);

    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    // 1. Create HR user
    const regHR = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Alerts HR Owner', email: 'hr-owner@alerts-test.local', password: 'Password123!', role: 'hr' },
    });
    users.hr = regHR.body;

    // 2. Create second HR user (unauthorized)
    const regHR2 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Other HR', email: 'other-hr@alerts-test.local', password: 'Password123!', role: 'hr' },
    });
    users.otherHr = regHR2.body;

    // 3. Create Candidate
    const regCandidate = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Alert Candidate', email: 'candidate@alerts-test.local', password: 'Password123!', role: 'interviewee' },
    });
    users.candidate = regCandidate.body;

    // 4. Create Assigned Interviewer
    const regInterviewer = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Assigned Interviewer', email: 'interviewer1@alerts-test.local', password: 'Password123!', role: 'interviewer' },
    });
    users.interviewer = regInterviewer.body;

    // 5. Create Other Interviewer
    const regInterviewer2 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Other Interviewer', email: 'interviewer2@alerts-test.local', password: 'Password123!', role: 'interviewer' },
    });
    users.otherInterviewer = regInterviewer2.body;

    hrProfile = await db.collection(COLLECTIONS.RECRUITERS).findOne({ user_id: users.hr.user.id });
    otherHrProfile = await db.collection(COLLECTIONS.RECRUITERS).findOne({ user_id: users.otherHr.user.id });
    candidateProfile = await db.collection(COLLECTIONS.CANDIDATES).findOne({ user_id: users.candidate.user.id });
    interviewerUser = users.interviewer.user;
    otherInterviewerUser = users.otherInterviewer.user;

    // Create test interview
    testInterview = {
      _id: randomUUID(),
      title: 'Phase 16 Live Alerts Interview',
      recruiter_id: hrProfile._id,
      candidate_id: candidateProfile._id,
      interviewer_id: interviewerUser.id,
      status: 'in_progress',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).insertOne(testInterview);
  });

  after(async () => {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await closeDatabase();
  });

  describe('1. Alert Policies & Deduplication Unit Tests', () => {
    it('evaluates FACE_ABSENCE against POL_FACE_ABSENCE policy', () => {
      // Below threshold: duration 2000ms < 3000ms, count 2 < 3
      const minorAbsence = {
        event_type: 'FACE_ABSENCE',
        severity: 'high',
        duration_ms: 2000,
        occurrence_count: 2,
      };
      assert.strictEqual(alertPolicyService.evaluateEvent(minorAbsence).qualifies, false);

      // Above threshold: duration 4000ms >= 3000ms
      const qualifyingAbsence = {
        event_type: 'FACE_ABSENCE',
        severity: 'high',
        duration_ms: 4000,
        occurrence_count: 4,
        explanation: 'No face observed for consecutive frames.',
      };
      const result = alertPolicyService.evaluateEvent(qualifyingAbsence);
      assert.strictEqual(result.qualifies, true);
      assert.strictEqual(result.priority, 'HIGH');
      assert.strictEqual(result.title, 'Face absence observed');
      assert.ok(result.message.includes('No face observed'));
    });

    it('evaluates MULTIPLE_FACES against POL_MULTIPLE_FACES policy', () => {
      // 1 frame blip: occurrence_count 1 < 2
      const singleBlip = {
        event_type: 'MULTIPLE_FACES',
        severity: 'high',
        occurrence_count: 1,
      };
      assert.strictEqual(alertPolicyService.evaluateEvent(singleBlip).qualifies, false);

      // 2 frames: qualifies
      const multiFaceEvent = {
        event_type: 'MULTIPLE_FACES',
        severity: 'high',
        occurrence_count: 2,
      };
      const result = alertPolicyService.evaluateEvent(multiFaceEvent);
      assert.strictEqual(result.qualifies, true);
      assert.strictEqual(result.priority, 'HIGH');
      assert.strictEqual(result.title, 'Multiple faces detected');
    });

    it('evaluates FRAME_QUALITY_SUMMARY and resolves priority dynamically', () => {
      const degraded = {
        event_type: 'FRAME_QUALITY_SUMMARY',
        metrics: { classification: 'degraded' },
      };
      const resDegraded = alertPolicyService.evaluateEvent(degraded);
      assert.strictEqual(resDegraded.qualifies, true);
      assert.strictEqual(resDegraded.priority, 'MEDIUM');

      const unusable = {
        event_type: 'FRAME_QUALITY_SUMMARY',
        metrics: { classification: 'critical_unusable' },
      };
      const resUnusable = alertPolicyService.evaluateEvent(unusable);
      assert.strictEqual(resUnusable.qualifies, true);
      assert.strictEqual(resUnusable.priority, 'HIGH');
    });

    it('generateAlertIdempotencyKey generates deterministic key', () => {
      const event = {
        _id: 'evt-1',
        event_id: 'evt_int1_123',
        idempotency_key: 'int1:FACE_ABSENCE:100',
      };
      const key = generateAlertIdempotencyKey('int1', 'POL_FACE_ABSENCE', event);
      assert.strictEqual(key, 'int1:POL_FACE_ABSENCE:int1:FACE_ABSENCE:100');
    });

    it('evaluateDeduplication suppresses duplicate alerts for small duration increments', () => {
      const existingAlert = {
        status: 'NEW',
        metrics: { duration_ms: 3000 },
      };
      // Increment by only 2 seconds (< 5s threshold)
      const eventUpdate = { duration_ms: 5000 };
      const res = evaluateDeduplication(existingAlert, eventUpdate);
      assert.strictEqual(res.shouldDispatch, false);
      assert.strictEqual(res.action, 'UPDATE');
    });

    it('evaluateDeduplication suppresses re-alerting if alert was acknowledged or dismissed', () => {
      const ackedAlert = { status: 'ACKNOWLEDGED' };
      assert.strictEqual(evaluateDeduplication(ackedAlert, { duration_ms: 8000 }).action, 'SUPPRESS');

      const dismissedAlert = { status: 'DISMISSED' };
      assert.strictEqual(evaluateDeduplication(dismissedAlert, { duration_ms: 8000 }).action, 'SUPPRESS');
    });
  });

  describe('2. Persistence & Idempotency Database Tests', () => {
    it('creates a new alert document with initial NEW status and escalation_level 0', async () => {
      const alertSpec = {
        idempotency_key: `${testInterview._id}:POL_FACE_ABSENCE:run1`,
        interview_id: testInterview._id,
        candidate_id: candidateProfile._id,
        event_id: `evt_${testInterview._id}_1`,
        event_type: 'FACE_ABSENCE',
        policy_id: 'POL_FACE_ABSENCE',
        priority: 'HIGH',
        title: 'Face absence observed',
        message: 'No face was detected across the configured observation interval.',
        recipient_ids: [users.hr.user.id, interviewerUser.id],
        metrics: { duration_ms: 4000, occurrence_count: 4 },
      };

      const { alert, isNew } = await createOrUpdateAlert(alertSpec);
      assert.strictEqual(isNew, true);
      assert.strictEqual(alert.status, 'NEW');
      assert.strictEqual(alert.escalation_level, 0);
      assert.strictEqual(alert.priority, 'HIGH');
      assert.ok(alert.alert_id.startsWith(`alt_${testInterview._id}_`));
      assert.strictEqual(alert.recipient_user_id, users.hr.user.id);
      assert.strictEqual(alert.acknowledged_at, null);
    });

    it('idempotently updates existing alert without creating duplicate document', async () => {
      const countBefore = await db.collection(COLLECTIONS.ALERTS).countDocuments({ interview_id: testInterview._id });

      const alertSpec = {
        idempotency_key: `${testInterview._id}:POL_FACE_ABSENCE:run1`,
        interview_id: testInterview._id,
        candidate_id: candidateProfile._id,
        event_id: `evt_${testInterview._id}_1`,
        event_type: 'FACE_ABSENCE',
        policy_id: 'POL_FACE_ABSENCE',
        priority: 'HIGH',
        title: 'Face absence observed',
        message: 'No face was detected across the configured observation interval.',
        recipient_ids: [users.hr.user.id, interviewerUser.id],
        metrics: { duration_ms: 8000, occurrence_count: 8 },
      };

      const { alert, isNew } = await createOrUpdateAlert(alertSpec);
      assert.strictEqual(isNew, false);
      assert.strictEqual(alert.metrics.duration_ms, 8000);

      const countAfter = await db.collection(COLLECTIONS.ALERTS).countDocuments({ interview_id: testInterview._id });
      assert.strictEqual(countAfter, countBefore, 'Replaying alert payload must not create duplicate documents');
    });

    it('enforces unique index idx_alt_003_idempotency_unique on collection', async () => {
      const duplicateDoc = {
        _id: randomUUID(),
        alert_id: `alt_dup_${randomUUID().slice(0, 8)}`,
        idempotency_key: `${testInterview._id}:POL_FACE_ABSENCE:run1`,
        interview_id: testInterview._id,
        status: 'NEW',
        created_at: new Date(),
      };

      await assert.rejects(
        async () => db.collection(COLLECTIONS.ALERTS).insertOne(duplicateDoc),
        /E11000 duplicate key error/
      );
    });
  });

  describe('3. Alert Lifecycle State Transitions', () => {
    let testAlertId;

    before(async () => {
      const { alert } = await createOrUpdateAlert({
        idempotency_key: `${testInterview._id}:POL_MULTIPLE_FACES:run1`,
        interview_id: testInterview._id,
        candidate_id: candidateProfile._id,
        event_id: `evt_${testInterview._id}_m1`,
        event_type: 'MULTIPLE_FACES',
        policy_id: 'POL_MULTIPLE_FACES',
        priority: 'HIGH',
        title: 'Multiple faces detected',
        message: 'Multiple distinct faces were detected.',
        recipient_ids: [users.hr.user.id, interviewerUser.id],
      });
      testAlertId = alert.alert_id;
    });

    it('acknowledges an active alert and records actor and timestamp', async () => {
      const acked = await acknowledgeAlert(testAlertId, interviewerUser.id);
      assert.strictEqual(acked.status, 'ACKNOWLEDGED');
      assert.strictEqual(acked.acknowledged_by, interviewerUser.id);
      assert.ok(acked.acknowledged_at instanceof Date);
    });

    it('idempotently handles re-acknowledgement without error', async () => {
      const reAcked = await acknowledgeAlert(testAlertId, interviewerUser.id);
      assert.strictEqual(reAcked.status, 'ACKNOWLEDGED');
    });

    it('dismisses an acknowledged alert and records actor and timestamp', async () => {
      const dismissed = await dismissAlert(testAlertId, users.hr.user.id);
      assert.strictEqual(dismissed.status, 'DISMISSED');
      assert.strictEqual(dismissed.dismissed_by, users.hr.user.id);
      assert.ok(dismissed.dismissed_at instanceof Date);
    });

    it('rejects acknowledging an alert that has already been dismissed (409 Conflict)', async () => {
      await assert.rejects(
        async () => acknowledgeAlert(testAlertId, interviewerUser.id),
        (err) => err.statusCode === 409 && err.message.includes('already been dismissed')
      );
    });
  });

  describe('4. Escalation Policy & Service Tests', () => {
    let escalationAlertId;

    before(async () => {
      const { alert } = await createOrUpdateAlert({
        idempotency_key: `${testInterview._id}:POL_ESCALATION_TEST:run1`,
        interview_id: testInterview._id,
        candidate_id: candidateProfile._id,
        event_type: 'FACE_ABSENCE',
        policy_id: 'POL_FACE_ABSENCE',
        priority: 'HIGH',
        title: 'Face absence escalation test',
        message: 'Unacknowledged alert for escalation.',
        recipient_ids: [users.hr.user.id, interviewerUser.id],
      });
      escalationAlertId = alert._id;
    });

    it('escalates unacknowledged alert when delay threshold is met', async () => {
      // Evaluate escalation with delayMs: 0 so it immediately qualifies
      const result = await evaluateAndEscalateAlerts(testInterview._id, { delayMs: 0, maxLevel: 2 });
      assert.ok(result.escalated_count >= 1);

      const escalatedDoc = await findAlertById(escalationAlertId);
      assert.strictEqual(escalatedDoc.escalation_level, 1);
      assert.ok(escalatedDoc.last_escalated_at instanceof Date);
    });

    it('caps escalation at maxLevel and does not exceed configured maximum', async () => {
      // Run second escalation to reach level 2
      await evaluateAndEscalateAlerts(testInterview._id, { delayMs: 0, maxLevel: 2 });
      const docLevel2 = await findAlertById(escalationAlertId);
      assert.strictEqual(docLevel2.escalation_level, 2);

      // Attempt third escalation: should be skipped because maxLevel is 2
      const resultThird = await evaluateAndEscalateAlerts(testInterview._id, { delayMs: 0, maxLevel: 2 });
      const docStillLevel2 = await findAlertById(escalationAlertId);
      assert.strictEqual(docStillLevel2.escalation_level, 2);
    });

    it('does not escalate acknowledged or dismissed alerts', async () => {
      await acknowledgeAlert(escalationAlertId, users.hr.user.id);

      const result = await evaluateAndEscalateAlerts(testInterview._id, { delayMs: 0, maxLevel: 5 });
      const doc = await findAlertById(escalationAlertId);
      assert.strictEqual(doc.escalation_level, 2, 'Acknowledged alert must not escalate further');
    });
  });

  describe('5. Real-Time Socket.io Notification & Recipient Targeting Tests', () => {
    let hrSocket;
    let interviewerSocket;
    let candidateSocket;

    before(async () => {
      hrSocket = createClientSocket(users.hr.token);
      interviewerSocket = createClientSocket(users.interviewer.token);
      candidateSocket = createClientSocket(users.candidate.token);

      await Promise.all([
        new Promise((resolve) => hrSocket.on('connect', resolve)),
        new Promise((resolve) => interviewerSocket.on('connect', resolve)),
        new Promise((resolve) => candidateSocket.on('connect', resolve)),
      ]);

      await Promise.all([
        new Promise((resolve) => hrSocket.emit('join-room', { interviewId: testInterview._id }, resolve)),
        new Promise((resolve) => interviewerSocket.emit('join-room', { interviewId: testInterview._id }, resolve)),
        new Promise((resolve) => candidateSocket.emit('join-room', { interviewId: testInterview._id }, resolve)),
      ]);
    });

    after(() => {
      if (hrSocket) hrSocket.disconnect();
      if (interviewerSocket) interviewerSocket.disconnect();
      if (candidateSocket) candidateSocket.disconnect();
    });

    it('delivers real-time alert to HR and Interviewer, but strictly NOT to Candidate', async () => {
      let candidateReceived = false;
      candidateSocket.on('monitoring-alert:new', () => {
        candidateReceived = true;
      });

      const hrPromise = new Promise((resolve) => {
        hrSocket.once('monitoring-alert:new', resolve);
      });

      const interviewerPromise = new Promise((resolve) => {
        interviewerSocket.once('monitoring-alert:new', resolve);
      });

      const qualifyingEvent = {
        _id: randomUUID(),
        event_id: `evt_sock_${randomUUID().slice(0, 8)}`,
        idempotency_key: `${testInterview._id}:FACE_ABSENCE:socket_test_1`,
        interview_id: testInterview._id,
        candidate_id: candidateProfile._id,
        event_type: 'FACE_ABSENCE',
        severity: 'high',
        duration_ms: 6000,
        occurrence_count: 6,
        confidence: 0.95,
        explanation: 'Face absence observed across 6 frames.',
      };

      await evaluateEventForAlert(qualifyingEvent);

      const [hrPayload, interviewerPayload] = await Promise.all([hrPromise, interviewerPromise]);

      assert.ok(hrPayload);
      assert.strictEqual(hrPayload.interview_id, testInterview._id);
      assert.strictEqual(hrPayload.priority, 'HIGH');

      assert.ok(interviewerPayload);
      assert.strictEqual(interviewerPayload.interview_id, testInterview._id);

      // Verify candidate never received the alert
      assert.strictEqual(candidateReceived, false, 'Candidate must NEVER receive monitoring alerts');
    });

    it('delivers real-time acknowledgement update over Socket.io', async () => {
      const res = await findAlertsByInterview(testInterview._id, { status: 'NEW' });
      const targetAlert = res.alerts[0];
      assert.ok(targetAlert);

      const ackPromise = new Promise((resolve) => {
        interviewerSocket.once('monitoring-alert:acknowledged', resolve);
      });

      await acknowledgeAlertAndNotify(targetAlert._id, users.hr.user.id);

      const ackPayload = await ackPromise;
      assert.strictEqual(ackPayload.alert_id, targetAlert.alert_id);
      assert.strictEqual(ackPayload.status, 'ACKNOWLEDGED');
    });
  });

  describe('6. REST API Endpoints & RBAC Access Control Tests', () => {
    it('rejects unauthenticated requests to alert endpoints with 401', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/alerts`);
      assert.strictEqual(res.statusCode, 401);
    });

    it('rejects candidate requests to alert endpoints with 403 Forbidden', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/alerts`, {
        token: users.candidate.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects unauthorized HR user not owning the interview with 403 Forbidden', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/alerts`, {
        token: users.otherHr.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects unassigned interviewer with 403 Forbidden', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/alerts`, {
        token: users.otherInterviewer.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('allows owner HR to list alerts with filtering and pagination', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/alerts?page=1&limit=10`, {
        token: users.hr.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.interview_id, testInterview._id);
      assert.ok(Array.isArray(res.body.alerts));
      assert.ok(res.body.pagination);
    });

    it('allows assigned interviewer to list alerts', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/alerts`, {
        token: users.interviewer.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
    });

    it('allows owner HR to retrieve alerts summary', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/alerts/summary`, {
        token: users.hr.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.summary);
      assert.strictEqual(res.body.summary.interview_id, testInterview._id);
      assert.ok(res.body.summary.total_alerts >= 1);
    });

    it('allows owner HR to retrieve a single alert via GET /api/alerts/:alertId', async () => {
      const alertsRes = await makeRequest(`/api/interviews/${testInterview._id}/alerts`, {
        token: users.hr.token,
      });
      const alert = alertsRes.body.alerts[0];
      assert.ok(alert);

      const res = await makeRequest(`/api/alerts/${alert.alert_id}`, {
        token: users.hr.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.alert.alert_id, alert.alert_id);
    });

    it('GET /api/alerts/:alertId returns 404 for nonexistent alert', async () => {
      const res = await makeRequest(`/api/alerts/alt_nonexistent_999`, {
        token: users.hr.token,
      });
      assert.strictEqual(res.statusCode, 404);
    });

    it('allows assigned interviewer to acknowledge an alert via PATCH /api/alerts/:alertId/acknowledge', async () => {
      // Create a fresh alert in NEW status
      const { alert } = await createOrUpdateAlert({
        idempotency_key: `${testInterview._id}:POL_TEST_ACK:${randomUUID()}`,
        interview_id: testInterview._id,
        candidate_id: candidateProfile._id,
        event_type: 'FACE_ABSENCE',
        policy_id: 'POL_FACE_ABSENCE',
        priority: 'HIGH',
        title: 'Fresh Alert for Ack',
        message: 'Acknowledge endpoint test.',
        recipient_ids: [users.hr.user.id, interviewerUser.id],
      });

      const res = await makeRequest(`/api/alerts/${alert.alert_id}/acknowledge`, {
        method: 'PATCH',
        token: users.interviewer.token,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.alert.status, 'ACKNOWLEDGED');
      assert.strictEqual(res.body.alert.acknowledged_by, interviewerUser.id);
    });

    it('allows owner HR to dismiss an alert via PATCH /api/alerts/:alertId/dismiss', async () => {
      const alertsRes = await makeRequest(`/api/interviews/${testInterview._id}/alerts`, {
        token: users.hr.token,
      });
      const alert = alertsRes.body.alerts.find((a) => a.status !== 'DISMISSED');
      assert.ok(alert);

      const res = await makeRequest(`/api/alerts/${alert.alert_id}/dismiss`, {
        method: 'PATCH',
        token: users.hr.token,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.alert.status, 'DISMISSED');
      assert.strictEqual(res.body.alert.dismissed_by, users.hr.user.id);
    });

    it('allows owner HR to trigger escalation sweep via POST /api/interviews/:id/alerts/escalate', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/alerts/escalate`, {
        method: 'POST',
        body: { delayMs: 0, maxLevel: 3 },
        token: users.hr.token,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.interview_id, testInterview._id);
    });
  });
});
