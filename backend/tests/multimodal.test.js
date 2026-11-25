import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const aiDir = path.join(projectRoot, 'ai-service');
const uvicornBin = path.join(aiDir, 'venv/bin/uvicorn');

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'interview_monitoring_multimodal_test';
process.env.JWT_SECRET = 'phase23-multimodal-test-secret';

const TEST_DB_NAME = 'interview_monitoring_multimodal_test';

const { default: app } = await import('../src/app.js');
const { connectDatabase, closeDatabase, getDatabaseName } = await import('../src/config/database.js');
const { ensureBaselineIndexes } = await import('../src/db/indexes.js');
const { COLLECTIONS } = await import('../src/db/collections.js');
const { signToken } = await import('../src/auth/tokens.js');
const { generateFinalReport } = await import('../src/reports/reportGenerator.js');

let httpServer;
let port;
let aiProcess = null;

async function checkAiServiceLive() {
  try {
    const res = await fetch('http://127.0.0.1:8000/health', { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

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

describe('Phase 23: V2 Multimodal Integrity Intelligence', () => {
  let db;

  let hrUser, hrToken, recruiter;
  let hr2User, hr2Token, recruiter2;
  let interviewerUser, interviewerToken;
  let unassignedInterviewerUser, unassignedInterviewerToken;
  let candidateUser, candidateToken, candidateProfile;

  let interviewId;

  before(async () => {
    db = await connectDatabase();
    assert.strictEqual(getDatabaseName(), TEST_DB_NAME);
    await ensureBaselineIndexes(db);

    await new Promise((resolve) => {
      httpServer = http.createServer(app);
      httpServer.listen(0, '127.0.0.1', () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    // Ensure AI Service is live on :8000
    const alreadyLive = await checkAiServiceLive();
    if (!alreadyLive) {
      aiProcess = spawn(
        uvicornBin,
        ['app.main:app', '--app-dir', aiDir, '--host', '127.0.0.1', '--port', '8000'],
        { stdio: 'ignore' }
      );
      let ready = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 250));
        ready = await checkAiServiceLive();
        if (ready) break;
      }
      assert.ok(ready, 'FastAPI AI Service failed to start on 127.0.0.1:8000');
    }

    // 1. HR Recruiter 1
    hrUser = {
      _id: randomUUID(),
      name: 'V2 Lead Recruiter',
      email: 'v2_hr@test.com',
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
      company: 'V2Corp',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.RECRUITERS).insertOne(recruiter);
    hrToken = signToken({ sub: hrUser._id, role: 'recruiter', email: hrUser.email });

    // 2. HR Recruiter 2 (unauthorized to interview)
    hr2User = {
      _id: randomUUID(),
      name: 'Unauth Recruiter',
      email: 'unauth_hr@test.com',
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

    // 3. Interviewer (assigned)
    interviewerUser = {
      _id: randomUUID(),
      name: 'V2 Interviewer',
      email: 'v2_interviewer@test.com',
      role: 'interviewer',
      password_hash: 'hashed',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.USERS).insertOne(interviewerUser);
    interviewerToken = signToken({ sub: interviewerUser._id, role: 'interviewer', email: interviewerUser.email });

    // 4. Interviewer (unassigned)
    unassignedInterviewerUser = {
      _id: randomUUID(),
      name: 'Unassigned Interviewer',
      email: 'unassigned_v2@test.com',
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

    // 5. Candidate
    candidateUser = {
      _id: randomUUID(),
      name: 'V2 Candidate',
      email: 'v2_candidate@test.com',
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

    // 6. Interview session
    interviewId = randomUUID();
    const now = new Date();
    await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).insertOne({
      _id: interviewId,
      title: 'Phase 23 V2 Multimodal Intelligence Interview',
      recruiter_id: recruiter._id,
      interviewer_id: interviewerUser._id,
      candidate_id: candidateProfile._id,
      status: 'in_progress',
      scheduled_start_at: now,
      started_at: now,
      created_at: now,
      updated_at: now,
    });
  });

  after(async () => {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    if (aiProcess) {
      aiProcess.kill('SIGTERM');
    }
    if (db) {
      await db.dropDatabase();
      await closeDatabase();
    }
  });

  describe('POST /api/interviews/:id/multimodal/audio', () => {
    it('accepts audio telemetry with explicit consent acknowledgment', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/multimodal/audio`, {
        method: 'POST',
        token: candidateToken,
        body: {
          consent_acknowledged: true,
          total_duration_ms: 5000,
          speech_duration_ms: 3500,
          silence_duration_ms: 1500,
          estimated_speaker_count: 1,
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.result.modality, 'audio');
      assert.strictEqual(res.body.result.speech_ratio, 0.7);
    });

    it('rejects audio telemetry when consent is false or missing (400 Bad Request)', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/multimodal/audio`, {
        method: 'POST',
        token: candidateToken,
        body: {
          consent_acknowledged: false,
          total_duration_ms: 5000,
        },
      });

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.message || res.body.error, /consent/i);
    });

    it('returns 403 for unauthorized HR recruiter', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/multimodal/audio`, {
        method: 'POST',
        token: hr2Token,
        body: { consent_acknowledged: true, total_duration_ms: 5000 },
      });

      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('POST /api/interviews/:id/multimodal/transcript', () => {
    it('accepts transcript analysis with explicit consent acknowledgment', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/multimodal/transcript`, {
        method: 'POST',
        token: interviewerToken,
        body: {
          consent_acknowledged: true,
          transcript_text: 'I designed a high throughput event-driven pipeline using Node and Kafka.',
          prompt_text: 'Describe your experience with event-driven architecture.',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.result.modality, 'transcript');
      assert.strictEqual(res.body.result.word_count > 5, true);
    });

    it('rejects transcript analysis when consent is missing (400 Bad Request)', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/multimodal/transcript`, {
        method: 'POST',
        token: interviewerToken,
        body: {
          transcript_text: 'Hello world',
        },
      });

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.message || res.body.error, /consent/i);
    });
  });

  describe('POST /api/interviews/:id/multimodal/fuse', () => {
    it('allows reviewer to execute multimodal fusion and persists V2 events', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/multimodal/fuse`, {
        method: 'POST',
        token: hrToken,
        body: {
          consent_acknowledged: true,
          visual_signals: [
            { signal_type: 'MULTIPLE_FACES', status: 'observed', observation_count: 3 },
          ],
          audio_result: {
            interview_id: interviewId,
            analysis_id: 'aud_test_fuse',
            total_duration_ms: 10000,
            speech_duration_ms: 8000,
            silence_duration_ms: 2000,
            speech_ratio: 0.8,
            estimated_speaker_count: 2,
            audio_quality: 'good',
            confidence: 0.85,
          },
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.fusion.modality, 'multimodal');
      assert.strictEqual(res.body.events_created >= 1, true);

      // Verify event was saved to monitoring_events collection with version v2
      const savedEvents = await db.collection(COLLECTIONS.MONITORING_EVENTS).find({
        interview_id: interviewId,
        category: 'MULTIMODAL',
      }).toArray();

      assert.strictEqual(savedEvents.length >= 1, true);
      assert.strictEqual(savedEvents[0].version, 'v2');
      assert.strictEqual(savedEvents[0].event_type, 'MULTIMODAL_CORROBORATED_PRESENCE');
    });

    it('denies candidate from triggering fusion (403 Forbidden)', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/multimodal/fuse`, {
        method: 'POST',
        token: candidateToken,
        body: {
          consent_acknowledged: true,
          visual_signals: [],
        },
      });

      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('GET /api/interviews/:id/multimodal', () => {
    it('allows assigned interviewer to retrieve V2 multimodal events', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/multimodal`, {
        method: 'GET',
        token: interviewerToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(Array.isArray(res.body.multimodal_events), true);
      assert.strictEqual(res.body.count >= 1, true);
    });

    it('denies candidate from retrieving reviewer multimodal events (403 Forbidden)', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/multimodal`, {
        method: 'GET',
        token: candidateToken,
      });

      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('Report Generator V2 Multimodal Insights', () => {
    it('includes v2_multimodal_insights when V2 events are present in session', async () => {
      const report = await generateFinalReport(interviewId, hrUser._id);

      assert.ok(report);
      assert.strictEqual(report.interview_id, interviewId);
      assert.ok(report.v2_multimodal_insights);
      assert.strictEqual(report.v2_multimodal_insights.enabled, true);
      assert.strictEqual(report.v2_multimodal_insights.total_v2_events >= 1, true);
      assert.strictEqual(report.v2_multimodal_insights.cross_modal_corroborations_count >= 1, true);
    });

    it('leaves v2_multimodal_insights as null when no V2 events exist (backward compatibility)', async () => {
      const v1InterviewId = randomUUID();
      const now = new Date();
      await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).insertOne({
        _id: v1InterviewId,
        title: 'V1 Visual-Only Session',
        recruiter_id: recruiter._id,
        interviewer_id: interviewerUser._id,
        candidate_id: candidateProfile._id,
        status: 'completed',
        scheduled_start_at: now,
        started_at: now,
        ended_at: now,
        created_at: now,
        updated_at: now,
      });

      const report = await generateFinalReport(v1InterviewId, hrUser._id);
      assert.ok(report);
      assert.strictEqual(report.v2_multimodal_insights, null);
    });
  });
});
