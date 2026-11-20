import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io as Client } from 'socket.io-client';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const aiDir = path.join(projectRoot, 'ai-service');
const uvicornBin = path.join(aiDir, 'venv/bin/uvicorn');

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'interview_monitoring_e2e_test';
process.env.JWT_SECRET = 'phase20-e2e-mvp-secret';

const TEST_DB_NAME = 'interview_monitoring_e2e_test';

const { default: app } = await import('../src/app.js');
const { initializeSocketServer } = await import('../src/socket/server.js');
const { connectDatabase, closeDatabase, getDatabaseName } = await import('../src/config/database.js');
const { ensureBaselineIndexes } = await import('../src/db/indexes.js');
const { COLLECTIONS } = await import('../src/db/collections.js');
const { processBehaviourAnalysis } = await import('../src/events/eventEngine.js');
const { findEventsByInterview } = await import('../src/events/eventRepository.js');
const { findAlertsByInterview } = await import('../src/alerts/alertRepository.js');
const { findEvidenceByInterview } = await import('../src/evidence/evidenceRepository.js');
const { findReportByInterviewId } = await import('../src/reports/reportRepository.js');

let httpServer;
let ioServer;
let port;
let aiProcess = null;

// Synthetic 320x240 JPEG base64 valid image for YuNet CV analysis
const SYNTHETIC_BASE64_JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCADwAUADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCvRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH/9k=';

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

async function checkAiServiceLive() {
  try {
    const res = await fetch('http://127.0.0.1:8000/health', { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

describe('Phase 20: End-to-End MVP Vertical Slice Integration Test', () => {
  let db;

  // Actors
  let hrToken, hrUser, recruiterDoc;
  let candidateToken, candidateUser, candidateProfileDoc;
  let interviewerToken, interviewerUser;
  let unassignedInterviewerToken, unassignedInterviewerUser;

  // Active interview ID
  let interviewId;

  // Real-time client sockets
  let reviewerSocket;
  let candidateSocket;
  const reviewerReceivedAlerts = [];
  const candidateReceivedAlerts = [];

  before(async () => {
    // 1. Connect MongoDB
    db = await connectDatabase();
    assert.strictEqual(getDatabaseName(), TEST_DB_NAME);
    await ensureBaselineIndexes(db);

    // 2. Start Node HTTP + Socket.io Server
    httpServer = http.createServer(app);
    ioServer = initializeSocketServer(httpServer);
    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    // 3. Ensure AI Service is live on :8000
    const alreadyLive = await checkAiServiceLive();
    if (!alreadyLive) {
      aiProcess = spawn(
        uvicornBin,
        ['app.main:app', '--app-dir', aiDir, '--host', '127.0.0.1', '--port', '8000'],
        { stdio: 'ignore' }
      );
      // Wait for AI service ready
      let ready = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 250));
        ready = await checkAiServiceLive();
        if (ready) break;
      }
      assert.ok(ready, 'FastAPI AI Service failed to start on 127.0.0.1:8000');
    }
  });

  after(async () => {
    // Disconnect sockets
    if (reviewerSocket && reviewerSocket.connected) reviewerSocket.disconnect();
    if (candidateSocket && candidateSocket.connected) candidateSocket.disconnect();

    // Close HTTP Server
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }

    // Kill AI Service if spawned by test
    if (aiProcess) {
      aiProcess.kill('SIGTERM');
    }

    // Clean up test DB
    if (db) {
      await db.dropDatabase();
      await closeDatabase();
    }
  });

  describe('Step 1: Multi-Role Registration & Authentication', () => {
    it('registers an HR Recruiter and returns 201 with auth token', async () => {
      const res = await makeRequest('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Sarah Connor',
          email: 'sarah.connor@cyberdyne.org',
          password: 'Password123!',
          role: 'hr',
          company: 'Cyberdyne Systems',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.role, 'hr');
      hrToken = res.body.token;
      hrUser = res.body.user;

      // Verify recruiter profile created in MongoDB
      recruiterDoc = await db.collection(COLLECTIONS.RECRUITERS).findOne({ user_id: hrUser.id });
      assert.ok(recruiterDoc, 'Linked recruiter profile must be created');
      assert.strictEqual(recruiterDoc.company, 'Cyberdyne Systems');
    });

    it('verifies HR login via POST /api/auth/login', async () => {
      const res = await makeRequest('/api/auth/login', {
        method: 'POST',
        body: {
          email: 'sarah.connor@cyberdyne.org',
          password: 'Password123!',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.token);
    });

    it('registers a Candidate and creates linked candidate profile', async () => {
      const res = await makeRequest('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'John Connor',
          email: 'john.connor@resistance.net',
          password: 'Password123!',
          role: 'interviewee',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.role, 'interviewee');
      candidateToken = res.body.token;
      candidateUser = res.body.user;

      candidateProfileDoc = await db.collection(COLLECTIONS.CANDIDATES).findOne({ user_id: candidateUser.id });
      assert.ok(candidateProfileDoc, 'Linked candidate profile must be created');
    });

    it('registers an Interviewer account', async () => {
      const res = await makeRequest('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Kyle Reese',
          email: 'kyle.reese@resistance.net',
          password: 'Password123!',
          role: 'interviewer',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.role, 'interviewer');
      interviewerToken = res.body.token;
      interviewerUser = res.body.user;
    });

    it('registers an Unassigned Interviewer for cross-role isolation verification', async () => {
      const res = await makeRequest('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Miles Dyson',
          email: 'miles.dyson@cyberdyne.org',
          password: 'Password123!',
          role: 'interviewer',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      unassignedInterviewerToken = res.body.token;
      unassignedInterviewerUser = res.body.user;
    });
  });

  describe('Step 2 & 3: Interview Creation & Invitation by HR', () => {
    it('creates an interview in draft status', async () => {
      const res = await makeRequest('/api/interviews', {
        method: 'POST',
        token: hrToken,
        body: {
          title: 'Senior Systems Resilience Engineer',
          candidateId: candidateProfileDoc._id,
          scheduledStartAt: new Date(Date.now() + 3600000).toISOString(),
        },
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.interview.id);
      assert.strictEqual(res.body.interview.status, 'draft');
      assert.strictEqual(res.body.interview.candidate.id, candidateProfileDoc._id);
      interviewId = res.body.interview.id;
    });

    it('invites the candidate and transitions interview to invited status', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/invite`, {
        method: 'POST',
        token: hrToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.interview.status, 'invited');
      assert.ok(res.body.interview.invite_reference);
    });
  });

  describe('Step 4: Interviewer Assignment by HR', () => {
    it('assigns the authorized interviewer to the interview session', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/assign`, {
        method: 'POST',
        token: hrToken,
        body: {
          interviewerId: interviewerUser.id,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.interview.interviewer.id, interviewerUser.id);

      // Verify DB session record
      const sessionInDb = await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).findOne({ _id: interviewId });
      assert.strictEqual(sessionInDb.interviewer_id, interviewerUser.id);
    });
  });

  describe('Step 5: Candidate Accesses Interview & Enforces RBAC', () => {
    it('allows candidate to view assigned interview details', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${interviewId}`, {
        method: 'GET',
        token: candidateToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.interview.id, interviewId);
      assert.strictEqual(res.body.interview.status, 'invited');
    });

    it('denies candidate access to HR management endpoints (403 Forbidden)', async () => {
      const res = await makeRequest('/api/interviews', {
        method: 'GET',
        token: candidateToken,
      });

      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('Step 6 & 7: Room Entry, Status in_progress, and Socket Isolation', () => {
    it('allows candidate and interviewer to join room, transitioning status to in_progress', async () => {
      // Candidate joins room
      const candJoin = await makeRequest(`/api/interviewee/interviews/${interviewId}/room/join`, {
        method: 'POST',
        token: candidateToken,
      });
      assert.strictEqual(candJoin.statusCode, 200);

      // Interviewer joins room
      const intJoin = await makeRequest(`/api/interviewer/interviews/${interviewId}/room/join`, {
        method: 'POST',
        token: interviewerToken,
      });
      assert.strictEqual(intJoin.statusCode, 200);

      // Verify interview status is now in_progress
      const session = await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).findOne({ _id: interviewId });
      assert.strictEqual(session.status, 'in_progress');
      assert.ok(session.started_at);
    });

    it('establishes real-time sockets with strict reviewer/candidate room isolation', async () => {
      reviewerSocket = createClientSocket(interviewerToken);
      candidateSocket = createClientSocket(candidateToken);

      // Listen for alert events
      reviewerSocket.on('monitoring-alert:new', (payload) => reviewerReceivedAlerts.push(payload));
      candidateSocket.on('monitoring-alert:new', (payload) => candidateReceivedAlerts.push(payload));

      // Wait for sockets connect
      await Promise.all([
        new Promise((resolve) => reviewerSocket.on('connect', resolve)),
        new Promise((resolve) => candidateSocket.on('connect', resolve)),
      ]);

      // Join interview rooms
      await new Promise((resolve) => reviewerSocket.emit('join-room', { interviewId }, resolve));
      await new Promise((resolve) => candidateSocket.emit('join-room', { interviewId }, resolve));

      // Give 100ms for rooms to settle
      await new Promise((r) => setTimeout(r, 100));
    });
  });

  describe('Step 8 & 9: Candidate Frame Submission & Live AI CV Analysis', () => {
    it('candidate submits sampled webcam frame to Node backend', async () => {
      const now = new Date().toISOString();
      const res = await makeRequest(`/api/interviewee/interviews/${interviewId}/frames`, {
        method: 'POST',
        token: candidateToken,
        body: {
          sequenceNumber: 1,
          timestamp: now,
          width: 320,
          height: 240,
          format: 'image/jpeg',
          sizeBytes: 15000,
          frameData: `data:image/jpeg;base64,${SYNTHETIC_BASE64_JPEG}`,
          captureStatus: 'NORMAL',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.sequenceNumber, 1);
      assert.strictEqual(res.body.status, 'ok');

      // Verify frame status via GET /frames/status
      const statusRes = await makeRequest(`/api/interviewee/interviews/${interviewId}/frames/status`, {
        method: 'GET',
        token: candidateToken,
      });
      assert.strictEqual(statusRes.statusCode, 200);
      assert.ok(statusRes.body.totalFramesReceived >= 1);
    });

    it('calls live FastAPI AI service POST /analysis/frame and receives structured CVAnalysisResult', async () => {
      const aiResponse = await fetch('http://127.0.0.1:8000/analysis/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_id: interviewId,
          sequence_number: 1,
          frame_timestamp: new Date().toISOString(),
          frame_data: SYNTHETIC_BASE64_JPEG,
        }),
      });

      assert.strictEqual(aiResponse.status, 200);
      const cvResult = await aiResponse.json();
      assert.ok(cvResult.status === 'ok' || cvResult.status === 'skipped');
      assert.ok(cvResult.analysis_id);
      assert.strictEqual(cvResult.detector_model, 'yunet-2023mar');
      assert.ok(cvResult.schema_version);
    });
  });

  describe('Step 10 & 11: AI Behaviour Signals & Backend Event Engine Persistence', () => {
    it('calls live FastAPI AI service POST /analysis/behaviour to extract behaviour signals', async () => {
      const nowTs = Date.now();
      const baseObservation = (seq, ts) => ({
        analysis_id: `cv_${interviewId}_${seq}`,
        interview_id: interviewId,
        sequence_number: seq,
        frame_timestamp: ts,
        status: 'ok',
        schema_version: '1.0',
        detector_model: 'yunet-2023mar',
        frame_quality: {
          grade: 'good',
          blur_score: 150.0,
          brightness_mean: 120.0,
          width_px: 640,
          height_px: 360,
        },
        face_detected: true,
        face_count: 2,
        multiple_faces_detected: true,
        detected_faces: [
          {
            bounding_box: { x: 0.2, y: 0.2, width: 0.25, height: 0.35 },
            confidence: 0.94,
            face_index: 0,
          },
          {
            bounding_box: { x: 0.6, y: 0.2, width: 0.25, height: 0.35 },
            confidence: 0.89,
            face_index: 1,
          },
        ],
      });

      const obs1 = baseObservation(1, new Date(nowTs - 1000).toISOString());
      const obs2 = baseObservation(2, new Date(nowTs).toISOString());

      const aiResponse = await fetch('http://127.0.0.1:8000/analysis/behaviour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_id: interviewId,
          observations: [obs1, obs2],
          track_session: true,
        }),
      });

      assert.strictEqual(aiResponse.status, 200);
      const behaviourResult = await aiResponse.json();
      assert.strictEqual(behaviourResult.interview_id, interviewId);
      assert.ok(Array.isArray(behaviourResult.signals));
      assert.ok(behaviourResult.signals.length >= 1);
      const mfSignal = behaviourResult.signals.find((s) => s.signal_type === 'MULTIPLE_FACES');
      assert.ok(mfSignal, 'MULTIPLE_FACES signal must be returned by AI behaviour engine');
      assert.strictEqual(mfSignal.status, 'observed');

      // Now pass this real AI payload to backend event engine
      const processResult = await processBehaviourAnalysis(behaviourResult, interviewId);
      assert.ok(processResult.events_created >= 1 || processResult.events_updated >= 1);

      // Verify monitoring_events in MongoDB
      const storedEvents = await findEventsByInterview(interviewId, { limit: 10 });
      assert.ok(storedEvents.events.length >= 1);
      const multipleFacesEvent = storedEvents.events.find((e) => e.event_type === 'MULTIPLE_FACES');
      assert.ok(multipleFacesEvent, 'MULTIPLE_FACES event must be persisted in monitoring_events');
      assert.strictEqual(multipleFacesEvent.severity, 'high');
    });
  });

  describe('Step 12: Real-Time Alerts & Reviewer Socket Dispatch with Candidate Isolation', () => {
    it('dispatches alert to reviewer socket while candidate receives zero alerts', async () => {
      // Allow 300ms for Socket.io delivery
      await new Promise((r) => setTimeout(r, 300));

      // Reviewer socket MUST receive alert:new
      assert.ok(
        reviewerReceivedAlerts.length >= 1,
        'Reviewer socket must receive real-time monitoring-alert:new event'
      );
      const alert = reviewerReceivedAlerts[0];
      assert.strictEqual(alert.interview_id, interviewId);
      assert.strictEqual(alert.priority, 'HIGH');

      // Candidate socket MUST NOT receive any alerts (privacy boundary)
      assert.strictEqual(
        candidateReceivedAlerts.length,
        0,
        'Candidate socket must NOT receive any reviewer alert events'
      );
    });

    it('allows HR and Interviewer to list alerts via REST, while Candidate receives 403', async () => {
      const hrAlerts = await makeRequest(`/api/interviews/${interviewId}/alerts`, {
        method: 'GET',
        token: hrToken,
      });
      assert.strictEqual(hrAlerts.statusCode, 200);
      assert.ok(hrAlerts.body.alerts.length >= 1);

      const candidateAlerts = await makeRequest(`/api/interviews/${interviewId}/alerts`, {
        method: 'GET',
        token: candidateToken,
      });
      assert.strictEqual(candidateAlerts.statusCode, 403);
    });
  });

  describe('Step 13: Evidence System Verification (Phase 17)', () => {
    it('verifies evidence context linked to qualifying event and checks RBAC', async () => {
      const evidenceRes = await makeRequest(`/api/interviews/${interviewId}/evidence`, {
        method: 'GET',
        token: interviewerToken,
      });

      assert.strictEqual(evidenceRes.statusCode, 200);
      assert.ok(evidenceRes.body.evidence.length >= 1);
      const item = evidenceRes.body.evidence[0];
      assert.strictEqual(item.interview_id, interviewId);
      assert.ok(item.metadata);
      assert.ok(item.metadata.event_id || item.event_id);

      // Candidate must get 403
      const candEvidence = await makeRequest(`/api/interviews/${interviewId}/evidence`, {
        method: 'GET',
        token: candidateToken,
      });
      assert.strictEqual(candEvidence.statusCode, 403);
    });
  });

  describe('Step 14: Live Monitoring Snapshot Verification (Phase 18)', () => {
    it('provides unified live monitoring state to interviewer with interpretable indicators', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/live-monitoring`, {
        method: 'GET',
        token: interviewerToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      const snapshot = res.body.snapshot;
      assert.strictEqual(snapshot.session.id, interviewId);
      assert.strictEqual(snapshot.session.status, 'in_progress');
      assert.ok(snapshot.integrity_indicators);
      assert.strictEqual(snapshot.integrity_indicators.multi_presence.status, 'OBSERVED');
      assert.strictEqual(snapshot.integrity_indicators.multi_presence.occurrences, 1);
      assert.ok(snapshot.events.length >= 1);
      assert.ok(snapshot.alerts.length >= 1);
      assert.ok(snapshot.evidence_summary.total_evidence >= 1);

      // Candidate must get 403
      const candLive = await makeRequest(`/api/interviews/${interviewId}/live-monitoring`, {
        method: 'GET',
        token: candidateToken,
      });
      assert.strictEqual(candLive.statusCode, 403);
    });
  });

  describe('Step 15: Reviewer Acknowledges Alert & Completes Interview Session', () => {
    it('interviewer acknowledges active alert via PATCH /api/alerts/:alertId/acknowledge', async () => {
      const alertId = reviewerReceivedAlerts[0]?.alert_id || reviewerReceivedAlerts[0]?.id;
      assert.ok(alertId, 'Alert ID must be present in received alert payload');
      const res = await makeRequest(`/api/alerts/${alertId}/acknowledge`, {
        method: 'PATCH',
        token: interviewerToken,
        body: { note: 'Multiple presence verified and documented by interviewer' },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.alert.status, 'ACKNOWLEDGED');
      assert.strictEqual(res.body.alert.acknowledged_by, interviewerUser.id);
    });

    it('interviewer ends interview session and status transitions to completed', async () => {
      const res = await makeRequest(`/api/interviewer/interviews/${interviewId}/room/end`, {
        method: 'POST',
        token: interviewerToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.interview.status, 'completed');

      // Verify in DB
      const session = await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).findOne({ _id: interviewId });
      assert.strictEqual(session.status, 'completed');
      assert.ok(session.ended_at);
    });
  });

  describe('Step 16: Post-Interview Final Report & Review Status Workflow (Phase 19)', () => {
    it('verifies final report was automatically compiled upon session completion', async () => {
      const autoReport = await findReportByInterviewId(interviewId);
      assert.ok(autoReport, 'Final report must be automatically generated into final_reports on completion');
      assert.strictEqual(autoReport.interview_id, interviewId);
      assert.strictEqual(autoReport.session_metadata.title, 'Senior Systems Resilience Engineer');
      assert.strictEqual(autoReport.session_metadata.status, 'completed');
      assert.strictEqual(autoReport.review_status, 'PENDING_REVIEW');
    });

    it('allows HR to retrieve final report and submit human review status', async () => {
      // 1. Retrieve report
      const getRes = await makeRequest(`/api/interviews/${interviewId}/report`, {
        method: 'GET',
        token: hrToken,
      });

      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.body.status, 'ok');
      assert.strictEqual(getRes.body.report.interview_id, interviewId);
      assert.ok(getRes.body.report.summary.includes('Post-interview integrity summary'));

      // 2. Submit human review sign-off
      const reviewRes = await makeRequest(`/api/interviews/${interviewId}/report/review`, {
        method: 'PATCH',
        token: hrToken,
        body: {
          review_status: 'REVIEWED',
          review_notes: 'End-to-end interview audit passed. Multiple presence incident verified as benign observation.',
        },
      });

      assert.strictEqual(reviewRes.statusCode, 200);
      assert.strictEqual(reviewRes.body.status, 'ok');
      assert.strictEqual(reviewRes.body.report.review_status, 'REVIEWED');
      assert.strictEqual(reviewRes.body.report.reviewed_by, hrUser.id);
      assert.ok(reviewRes.body.report.reviewed_at);

      // Candidate must get 403
      const candReport = await makeRequest(`/api/interviews/${interviewId}/report`, {
        method: 'GET',
        token: candidateToken,
      });
      assert.strictEqual(candReport.statusCode, 403);
    });
  });

  describe('Step 17: Cross-Role & Defect Audit Checks', () => {
    it('enforces 401 Unauthorized when token is missing across protected endpoints', async () => {
      const endpoints = [
        ['GET', `/api/interviews/${interviewId}`],
        ['POST', `/api/interviews/${interviewId}/report/generate`],
        ['GET', `/api/interviews/${interviewId}/live-monitoring`],
        ['GET', `/api/interviews/${interviewId}/evidence`],
        ['GET', `/api/interviews/${interviewId}/alerts`],
      ];

      for (const [method, path] of endpoints) {
        const res = await makeRequest(path, { method });
        assert.strictEqual(res.statusCode, 401, `Expected 401 for unauthenticated ${method} ${path}`);
      }
    });

    it('enforces 403 Forbidden for unassigned interviewer on assigned interview routes', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/live-monitoring`, {
        method: 'GET',
        token: unassignedInterviewerToken,
      });
      assert.strictEqual(res.statusCode, 403);

      const repRes = await makeRequest(`/api/interviews/${interviewId}/report`, {
        method: 'GET',
        token: unassignedInterviewerToken,
      });
      assert.strictEqual(repRes.statusCode, 403);
    });

    it('enforces 403 Forbidden for candidate attempting to access reviewer routes', async () => {
      const res = await makeRequest(`/api/interviewer/interviews/${interviewId}`, {
        method: 'GET',
        token: candidateToken,
      });
      assert.strictEqual(res.statusCode, 403);

      const liveRes = await makeRequest(`/api/interviews/${interviewId}/live-monitoring`, {
        method: 'GET',
        token: candidateToken,
      });
      assert.strictEqual(liveRes.statusCode, 403);
    });
  });
});
