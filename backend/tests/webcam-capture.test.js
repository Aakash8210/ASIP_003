import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { io as Client } from 'socket.io-client';

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'interview_monitoring_capture_test';
process.env.JWT_SECRET = 'phase12-webcam-capture-test-secret';

const TEST_DB_NAME = 'interview_monitoring_capture_test';

const { default: app } = await import('../src/app.js');
const { initializeSocketServer } = await import('../src/socket/server.js');
const { connectDatabase, closeDatabase, getDatabase, getDatabaseName } = await import('../src/config/database.js');
const { ensureBaselineIndexes } = await import('../src/db/indexes.js');
const { COLLECTIONS } = await import('../src/db/collections.js');
const { sessionFrameTracker } = await import('../src/monitoring/frameValidator.js');

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

// Generates a mock base64 image string with valid padding and plausible byte size
const createMockBase64Frame = (sizeBytes = 1024) => {
  const buffer = Buffer.alloc(sizeBytes, 'A');
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
};

describe('Webcam Frame Capture (Phase 12)', () => {
  const users = {};
  let candidate1Profile;
  let candidate2Profile;
  let testInterview;

  before(async () => {
    const db = await connectDatabase();
    assert.ok(db, 'MongoDB connection must succeed for Phase 12 tests');
    assert.strictEqual(getDatabaseName(), TEST_DB_NAME);
    await ensureBaselineIndexes(db);

    await db.collection(COLLECTIONS.USERS).deleteMany({ email: /@example\.local/ });
    await db.collection(COLLECTIONS.CANDIDATES).deleteMany({});
    await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).deleteMany({});
    sessionFrameTracker.resetAll();

    httpServer = http.createServer(app);
    ioServer = initializeSocketServer(httpServer);

    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    // Register HR, candidate 1 (assigned), candidate 2 (unassigned), interviewer 1 (assigned), interviewer 2 (unassigned)
    const regHR = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Capture HR', email: 'cap-hr@example.local', password: 'Password123!', role: 'hr' },
    });
    users.hr = regHR.body;

    const regC1 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Assigned Candidate', email: 'cap-candidate1@example.local', password: 'Password123!', role: 'interviewee' },
    });
    users.c1 = regC1.body;

    const regC2 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Other Candidate', email: 'cap-candidate2@example.local', password: 'Password123!', role: 'interviewee' },
    });
    users.c2 = regC2.body;

    const regI1 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Assigned Interviewer', email: 'cap-interviewer1@example.local', password: 'Password123!', role: 'interviewer' },
    });
    users.i1 = regI1.body;

    const regI2 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Unassigned Interviewer', email: 'cap-interviewer2@example.local', password: 'Password123!', role: 'interviewer' },
    });
    users.i2 = regI2.body;

    candidate1Profile = await db.collection(COLLECTIONS.CANDIDATES).findOne({ user_id: users.c1.user.id });
    candidate2Profile = await db.collection(COLLECTIONS.CANDIDATES).findOne({ user_id: users.c2.user.id });

    // HR creates an interview with Candidate 1 and assigns Interviewer 1
    const createRes = await makeRequest('/api/interviews', {
      method: 'POST',
      token: users.hr.token,
      body: {
        candidateId: candidate1Profile._id,
        title: 'Webcam Monitoring Session',
        interviewerId: users.i1.user.id,
      },
    });
    assert.strictEqual(createRes.statusCode, 201);
    testInterview = createRes.body.interview;

    // HR invites candidate
    await makeRequest(`/api/interviews/${testInterview.id}/invite`, {
      method: 'POST',
      token: users.hr.token,
    });
  });

  describe('Authentication and Access Authorization', () => {
    it('rejects unauthenticated frame submission (401)', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/frames`, {
        method: 'POST',
        body: {
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
          width: 640,
          height: 360,
          format: 'image/jpeg',
          frameData: createMockBase64Frame(),
        },
      });
      assert.strictEqual(res.statusCode, 401);
    });

    it('rejects frame submission by non-candidate role (403)', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/frames`, {
        method: 'POST',
        token: users.i1.token,
        body: {
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
          width: 640,
          height: 360,
          format: 'image/jpeg',
          frameData: createMockBase64Frame(),
        },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects frame submission by unassigned candidate (403)', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/frames`, {
        method: 'POST',
        token: users.c2.token,
        body: {
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
          width: 640,
          height: 360,
          format: 'image/jpeg',
          frameData: createMockBase64Frame(),
        },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects frame submission to nonexistent interview (404)', async () => {
      const res = await makeRequest('/api/interviewee/interviews/nonexistent-id/frames', {
        method: 'POST',
        token: users.c1.token,
        body: {
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
          width: 640,
          height: 360,
          format: 'image/jpeg',
          frameData: createMockBase64Frame(),
        },
      });
      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('Session Lifecycle Guarding', () => {
    it('rejects frame submission before session transitions to in_progress (409)', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/frames`, {
        method: 'POST',
        token: users.c1.token,
        body: {
          sequenceNumber: 1,
          timestamp: new Date().toISOString(),
          width: 640,
          height: 360,
          format: 'image/jpeg',
          frameData: createMockBase64Frame(),
        },
      });
      assert.strictEqual(res.statusCode, 409);
      assert.match(res.body.message, /not in progress/i);
    });

    it('allows candidate to join room, transitioning session to in_progress', async () => {
      const joinRes = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/room/join`, {
        method: 'POST',
        token: users.c1.token,
      });
      assert.strictEqual(joinRes.statusCode, 200);
      assert.strictEqual(joinRes.body.room.interview.status, 'in_progress');
    });
  });

  describe('Payload & Quality Validation', () => {
    it('accepts valid frame payload and returns acknowledgment (200)', async () => {
      const now = new Date().toISOString();
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/frames`, {
        method: 'POST',
        token: users.c1.token,
        body: {
          sequenceNumber: 1,
          timestamp: now,
          width: 640,
          height: 360,
          format: 'image/jpeg',
          frameData: createMockBase64Frame(500),
          captureStatus: 'captured',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.sequenceNumber, 1);
      assert.strictEqual(res.body.captureStatus, 'captured');
      assert.ok(res.body.frameId);
      assert.ok(res.body.receivedAt);
    });

    it('rejects frame with non-positive sequenceNumber (400)', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/frames`, {
        method: 'POST',
        token: users.c1.token,
        body: {
          sequenceNumber: 0,
          timestamp: new Date().toISOString(),
          width: 640,
          height: 360,
          format: 'image/jpeg',
          frameData: createMockBase64Frame(),
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.message, /sequenceNumber/i);
    });

    it('rejects frame with invalid timestamp (400)', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/frames`, {
        method: 'POST',
        token: users.c1.token,
        body: {
          sequenceNumber: 2,
          timestamp: 'invalid-date',
          width: 640,
          height: 360,
          format: 'image/jpeg',
          frameData: createMockBase64Frame(),
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.message, /timestamp/i);
    });

    it('rejects frame with out-of-bound dimensions (400)', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/frames`, {
        method: 'POST',
        token: users.c1.token,
        body: {
          sequenceNumber: 3,
          timestamp: new Date().toISOString(),
          width: 20, // below MIN_DIMENSION (64)
          height: 360,
          format: 'image/jpeg',
          frameData: createMockBase64Frame(),
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.message, /width/i);
    });

    it('rejects frame with unsupported image format (400)', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/frames`, {
        method: 'POST',
        token: users.c1.token,
        body: {
          sequenceNumber: 4,
          timestamp: new Date().toISOString(),
          width: 640,
          height: 360,
          format: 'image/gif',
          frameData: createMockBase64Frame(),
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.message, /format/i);
    });

    it('rejects frame with empty or undersized payload (400)', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/frames`, {
        method: 'POST',
        token: users.c1.token,
        body: {
          sequenceNumber: 5,
          timestamp: new Date().toISOString(),
          width: 640,
          height: 360,
          format: 'image/jpeg',
          frameData: 'data:image/jpeg;base64,AAAA', // too small
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.message, /below minimum/i);
    });
  });

  describe('Frame Capture Status Telemetry', () => {
    it('allows candidate to check frame capture status', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/frames/status`, {
        method: 'GET',
        token: users.c1.token,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.interviewId, testInterview.id);
      assert.strictEqual(res.body.captureActive, true);
      assert.strictEqual(res.body.totalFramesReceived, 1);
      assert.strictEqual(res.body.lastSequenceNumber, 1);
      assert.strictEqual(res.body.lastWidth, 640);
      assert.strictEqual(res.body.lastHeight, 360);
    });

    it('allows assigned interviewer to check candidate frame capture telemetry', async () => {
      const res = await makeRequest(`/api/interviewer/interviews/${testInterview.id}/frames/status`, {
        method: 'GET',
        token: users.i1.token,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.captureActive, true);
      assert.strictEqual(res.body.totalFramesReceived, 1);
    });

    it('rejects unassigned interviewer from checking telemetry (403)', async () => {
      const res = await makeRequest(`/api/interviewer/interviews/${testInterview.id}/frames/status`, {
        method: 'GET',
        token: users.i2.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('Socket.io Frame Transmission & Status Broadcast', () => {
    it('accepts webcam frame via socket and broadcasts telemetry to interviewer', async () => {
      const socketCandidate = createClientSocket(users.c1.token);
      const socketInterviewer = createClientSocket(users.i1.token);

      await new Promise((res) => socketCandidate.on('connect', res));
      await new Promise((res) => socketInterviewer.on('connect', res));

      // Both join room
      await new Promise((res) => socketCandidate.emit('join-room', { interviewId: testInterview.id }, res));
      await new Promise((res) => socketInterviewer.emit('join-room', { interviewId: testInterview.id }, res));

      const statusPromise = new Promise((resolve) => {
        socketInterviewer.on('monitoring-frame-status', resolve);
      });

      const framePayload = {
        interviewId: testInterview.id,
        sequenceNumber: 2,
        timestamp: new Date().toISOString(),
        width: 640,
        height: 360,
        format: 'image/jpeg',
        frameData: createMockBase64Frame(400),
        captureStatus: 'captured',
      };

      const ack = await new Promise((resolve) => {
        socketCandidate.emit('webcam-frame', framePayload, resolve);
      });

      assert.strictEqual(ack.status, 'ok');
      assert.strictEqual(ack.sequenceNumber, 2);

      const receivedStatus = await statusPromise;
      assert.strictEqual(receivedStatus.interviewId, testInterview.id);
      assert.strictEqual(receivedStatus.sequenceNumber, 2);
      assert.strictEqual(receivedStatus.captureStatus, 'captured');

      socketCandidate.disconnect();
      socketInterviewer.disconnect();
    });

    it('rejects webcam frame from socket not in interview room', async () => {
      const socketCandidate = createClientSocket(users.c1.token);
      await new Promise((res) => socketCandidate.on('connect', res));

      const errorPromise = new Promise((resolve) => {
        socketCandidate.on('error', resolve);
      });

      const ack = await new Promise((resolve) => {
        socketCandidate.emit(
          'webcam-frame',
          {
            interviewId: testInterview.id,
            sequenceNumber: 3,
            timestamp: new Date().toISOString(),
            width: 640,
            height: 360,
            format: 'image/jpeg',
            frameData: createMockBase64Frame(400),
          },
          resolve
        );
      });

      const err = await errorPromise;
      assert.match(err.message, /not in this interview room/i);
      assert.strictEqual(ack.error, 'Socket is not in this interview room');

      socketCandidate.disconnect();
    });
  });

  describe('Post-Session Completion Guard', () => {
    it('concludes the interview and transitions to completed', async () => {
      const endRes = await makeRequest(`/api/interviewer/interviews/${testInterview.id}/room/end`, {
        method: 'POST',
        token: users.i1.token,
      });
      assert.strictEqual(endRes.statusCode, 200);
      assert.strictEqual(endRes.body.interview.status, 'completed');
    });

    it('rejects frame submission after interview is completed (409)', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/frames`, {
        method: 'POST',
        token: users.c1.token,
        body: {
          sequenceNumber: 10,
          timestamp: new Date().toISOString(),
          width: 640,
          height: 360,
          format: 'image/jpeg',
          frameData: createMockBase64Frame(500),
        },
      });
      assert.strictEqual(res.statusCode, 409);
      assert.match(res.body.message, /already been completed/i);
    });
  });

  after(async () => {
    if (ioServer) {
      await new Promise((res) => ioServer.close(res));
    }
    if (httpServer) {
      await new Promise((res) => httpServer.close(res));
    }
    const db = getDatabase();
    if (db) {
      await db.collection(COLLECTIONS.USERS).deleteMany({ email: /@example\.local/ });
      await db.collection(COLLECTIONS.CANDIDATES).deleteMany({});
      await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).deleteMany({});
    }
    sessionFrameTracker.resetAll();
    await closeDatabase();
  });
});

