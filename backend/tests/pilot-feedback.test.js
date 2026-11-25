import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'interview_monitoring_pilot_test';
process.env.JWT_SECRET = 'phase22-pilot-feedback-secret';

const TEST_DB_NAME = 'interview_monitoring_pilot_test';

const { default: app } = await import('../src/app.js');
const { connectDatabase, closeDatabase, getDatabaseName } = await import('../src/config/database.js');
const { ensureBaselineIndexes } = await import('../src/db/indexes.js');
const { COLLECTIONS } = await import('../src/db/collections.js');
const { signToken } = await import('../src/auth/tokens.js');
const {
  savePilotFeedback,
  findFeedbackByInterview,
  getPilotFeedbackSummary,
  listAllPilotFeedback,
} = await import('../src/feedback/feedbackRepository.js');

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

describe('Phase 22: Internal Validation / Pilot / Feedback System', () => {
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

    await new Promise((resolve) => {
      httpServer = http.createServer(app);
      httpServer.listen(0, '127.0.0.1', () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    // 1. HR Recruiter 1
    hrUser = {
      _id: randomUUID(),
      name: 'Pilot Lead Recruiter',
      email: 'pilot_hr@test.com',
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
      company: 'PilotCorp',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.RECRUITERS).insertOne(recruiter);
    hrToken = signToken({ sub: hrUser._id, role: 'recruiter', email: hrUser.email });

    // 2. HR Recruiter 2 (unassigned)
    hr2User = {
      _id: randomUUID(),
      name: 'Other Recruiter',
      email: 'other_hr@test.com',
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
      name: 'Pilot Interviewer',
      email: 'pilot_interviewer@test.com',
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
      email: 'unassigned@test.com',
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
      name: 'Pilot Candidate',
      email: 'pilot_candidate@test.com',
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
      title: 'Phase 22 Pilot Interview Session',
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

  describe('Repository Unit Logic', () => {
    it('requires explicit consent acknowledgment', async () => {
      await assert.rejects(
        () =>
          savePilotFeedback({
            interview_id: interviewId,
            user_id: candidateUser._id,
            role: 'candidate',
            pilot_consent_acknowledged: false,
            ratings: {
              overall_experience: 4,
              system_clarity: 4,
              technical_friction: 2,
            },
          }),
        /Explicit pilot consent acknowledgment is required/
      );
    });

    it('rejects invalid rating values outside 1-5', async () => {
      await assert.rejects(
        () =>
          savePilotFeedback({
            interview_id: interviewId,
            user_id: candidateUser._id,
            role: 'candidate',
            pilot_consent_acknowledged: true,
            ratings: {
              overall_experience: 6,
              system_clarity: 4,
              technical_friction: 2,
            },
          }),
        /overall_experience rating must be an integer between 1 and 5/
      );
    });

    it('computes aggregated summary accurately', async () => {
      // Empty check
      const emptySummary = await getPilotFeedbackSummary();
      assert.strictEqual(emptySummary.total_submissions, 0);

      // Save sample feedback
      await savePilotFeedback({
        interview_id: interviewId,
        user_id: 'test-user-1',
        role: 'candidate',
        pilot_consent_acknowledged: true,
        ratings: {
          overall_experience: 5,
          system_clarity: 4,
          technical_friction: 1,
          trust_and_fairness: 5,
        },
        friction_points: ['camera_permission', 'ui_clarity'],
      });

      await savePilotFeedback({
        interview_id: interviewId,
        user_id: 'test-user-2',
        role: 'interviewer',
        pilot_consent_acknowledged: true,
        ratings: {
          overall_experience: 4,
          system_clarity: 4,
          technical_friction: 2,
        },
        friction_points: ['alert_frequency'],
      });

      const summary = await getPilotFeedbackSummary();
      assert.strictEqual(summary.total_submissions, 2);
      assert.strictEqual(summary.by_role.candidate, 1);
      assert.strictEqual(summary.by_role.interviewer, 1);
      assert.strictEqual(summary.average_ratings.overall_experience, 4.5);
      assert.strictEqual(summary.average_ratings.system_clarity, 4);
      assert.strictEqual(summary.average_ratings.technical_friction, 1.5);
      assert.strictEqual(summary.average_ratings.trust_and_fairness, 5);
      assert.strictEqual(summary.friction_points_frequency['camera_permission'], 1);
      assert.strictEqual(summary.friction_points_frequency['alert_frequency'], 1);

      // Clean up test feedback records
      await db.collection(COLLECTIONS.PILOT_FEEDBACK).deleteMany({});
    });
  });

  describe('POST /api/interviews/:id/feedback', () => {
    it('allows candidate to submit pilot feedback with valid consent and ratings (201 Created)', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/feedback`, {
        method: 'POST',
        token: candidateToken,
        body: {
          pilot_consent_acknowledged: true,
          ratings: {
            overall_experience: 4,
            system_clarity: 5,
            technical_friction: 2,
            trust_and_fairness: 4,
          },
          friction_points: ['browser_setup'],
          feedback_notes: 'The monitoring was transparent and camera check was quick.',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.isNew, true);
      assert.ok(res.body.feedback);
      assert.strictEqual(res.body.feedback.role, 'candidate');
      assert.strictEqual(res.body.feedback.ratings.overall_experience, 4);
      assert.strictEqual(res.body.feedback.ratings.system_clarity, 5);
    });

    it('rejects submission when consent is missing or false (400 Bad Request)', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/feedback`, {
        method: 'POST',
        token: candidateToken,
        body: {
          pilot_consent_acknowledged: false,
          ratings: {
            overall_experience: 4,
            system_clarity: 4,
            technical_friction: 1,
          },
        },
      });

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.message || res.body.error, /consent/i);
    });

    it('rejects invalid rating values (400 Bad Request)', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/feedback`, {
        method: 'POST',
        token: candidateToken,
        body: {
          pilot_consent_acknowledged: true,
          ratings: {
            overall_experience: 0,
            system_clarity: 5,
            technical_friction: 2,
          },
        },
      });

      assert.strictEqual(res.statusCode, 400);
      assert.match(res.body.message || res.body.error, /rating/i);
    });

    it('updates existing feedback idempotently on re-submission (200 OK, isNew: false)', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/feedback`, {
        method: 'POST',
        token: candidateToken,
        body: {
          pilot_consent_acknowledged: true,
          ratings: {
            overall_experience: 5,
            system_clarity: 5,
            technical_friction: 1,
            trust_and_fairness: 5,
          },
          friction_points: ['browser_setup', 'lighting'],
          feedback_notes: 'Updated note after reviewing setup.',
        },
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.isNew, false);
      assert.strictEqual(res.body.feedback.ratings.overall_experience, 5);
      assert.strictEqual(res.body.feedback.ratings.technical_friction, 1);
      assert.strictEqual(res.body.feedback.feedback_notes, 'Updated note after reviewing setup.');
    });

    it('allows interviewer to submit feedback for the session (201 Created)', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/feedback`, {
        method: 'POST',
        token: interviewerToken,
        body: {
          pilot_consent_acknowledged: true,
          ratings: {
            overall_experience: 4,
            system_clarity: 4,
            technical_friction: 2,
          },
          friction_points: ['drawer_latency'],
          feedback_notes: 'Live indicator drawer was helpful for real-time overview.',
        },
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.isNew, true);
      assert.strictEqual(res.body.feedback.role, 'interviewer');
    });

    it('returns 403 when unassigned interviewer attempts to submit feedback', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/feedback`, {
        method: 'POST',
        token: unassignedInterviewerToken,
        body: {
          pilot_consent_acknowledged: true,
          ratings: { overall_experience: 3, system_clarity: 3, technical_friction: 3 },
        },
      });

      assert.strictEqual(res.statusCode, 403);
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/feedback`, {
        method: 'POST',
        body: {
          pilot_consent_acknowledged: true,
          ratings: { overall_experience: 4, system_clarity: 4, technical_friction: 2 },
        },
      });

      assert.strictEqual(res.statusCode, 401);
    });
  });

  describe('GET /api/interviews/:id/feedback', () => {
    it('returns ONLY candidate’s own feedback for candidate role (privacy boundary)', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/feedback`, {
        method: 'GET',
        token: candidateToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.feedback);
      assert.strictEqual(res.body.feedback.user_id, candidateUser._id);
      assert.strictEqual(res.body.feedback.role, 'candidate');
    });

    it('returns all interview feedback records for assigned interviewer', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/feedback`, {
        method: 'GET',
        token: interviewerToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(Array.isArray(res.body.feedback));
      assert.strictEqual(res.body.feedback.length, 2); // 1 candidate + 1 interviewer
    });

    it('returns all interview feedback records for HR recruiter', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/feedback`, {
        method: 'GET',
        token: hrToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(Array.isArray(res.body.feedback));
      assert.strictEqual(res.body.feedback.length, 2);
    });

    it('returns 403 for unauthorized HR recruiter', async () => {
      const res = await makeRequest(`/api/interviews/${interviewId}/feedback`, {
        method: 'GET',
        token: hr2Token,
      });

      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('GET /api/pilot-feedback/summary', () => {
    it('allows HR to retrieve aggregated pilot feedback summary', async () => {
      const res = await makeRequest('/api/pilot-feedback/summary', {
        method: 'GET',
        token: hrToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      const { summary } = res.body;
      assert.ok(summary);
      assert.strictEqual(summary.total_submissions, 2);
      assert.strictEqual(summary.by_role.candidate, 1);
      assert.strictEqual(summary.by_role.interviewer, 1);
      assert.strictEqual(typeof summary.average_ratings.overall_experience, 'number');
    });

    it('returns 403 for candidate on /api/pilot-feedback/summary', async () => {
      const res = await makeRequest('/api/pilot-feedback/summary', {
        method: 'GET',
        token: candidateToken,
      });

      assert.strictEqual(res.statusCode, 403);
    });

    it('returns 403 for interviewer on /api/pilot-feedback/summary', async () => {
      const res = await makeRequest('/api/pilot-feedback/summary', {
        method: 'GET',
        token: interviewerToken,
      });

      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe('GET /api/pilot-feedback', () => {
    it('allows HR to retrieve paginated list of pilot feedback', async () => {
      const res = await makeRequest('/api/pilot-feedback?page=1&limit=10', {
        method: 'GET',
        token: hrToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(Array.isArray(res.body.feedback));
      assert.strictEqual(res.body.pagination.total, 2);
      assert.strictEqual(res.body.pagination.page, 1);
    });

    it('allows filtering by role', async () => {
      const res = await makeRequest('/api/pilot-feedback?role=candidate', {
        method: 'GET',
        token: hrToken,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.feedback.length, 1);
      assert.strictEqual(res.body.feedback[0].role, 'candidate');
    });

    it('returns 403 for candidate on /api/pilot-feedback', async () => {
      const res = await makeRequest('/api/pilot-feedback', {
        method: 'GET',
        token: candidateToken,
      });

      assert.strictEqual(res.statusCode, 403);
    });
  });
});
