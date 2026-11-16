import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'interview_monitoring_room_test';
process.env.JWT_SECRET = 'phase10-interview-room-test-secret';

const TEST_DB_NAME = 'interview_monitoring_room_test';

const { default: app } = await import('../src/app.js');
const { connectDatabase, closeDatabase, getDatabase, getDatabaseName } = await import('../src/config/database.js');
const { ensureBaselineIndexes } = await import('../src/db/indexes.js');
const { COLLECTIONS } = await import('../src/db/collections.js');

let server;
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

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data ? JSON.parse(data) : null,
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

describe('Interview Room (Phase 10)', () => {
  const users = {};
  let hrProfile;
  let candidate1Profile;
  let candidate2Profile;
  let testInterview;

  before(async () => {
    const db = await connectDatabase();
    assert.ok(db, 'MongoDB connection must succeed for Phase 10 tests');
    assert.strictEqual(getDatabaseName(), TEST_DB_NAME);
    await ensureBaselineIndexes(db);

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });

    // Register HR, 2 candidates, and 2 interviewers
    const regHR = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Room HR', email: 'room-hr@example.local', password: 'Password123!', role: 'hr' },
    });
    users.hr = regHR.body;

    const regC1 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Alice Candidate', email: 'alice@example.local', password: 'Password123!', role: 'interviewee' },
    });
    users.c1 = regC1.body;

    const regC2 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Bob Candidate', email: 'bob@example.local', password: 'Password123!', role: 'interviewee' },
    });
    users.c2 = regC2.body;

    const regI1 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Interviewer 1', email: 'interviewer1@example.local', password: 'Password123!', role: 'interviewer' },
    });
    users.i1 = regI1.body;

    const regI2 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Interviewer 2', email: 'interviewer2@example.local', password: 'Password123!', role: 'interviewer' },
    });
    users.i2 = regI2.body;

    candidate1Profile = await db.collection(COLLECTIONS.CANDIDATES).findOne({ user_id: users.c1.user.id });
    candidate2Profile = await db.collection(COLLECTIONS.CANDIDATES).findOne({ user_id: users.c2.user.id });
    hrProfile = await db.collection(COLLECTIONS.RECRUITERS).findOne({ user_id: users.hr.user.id });

    // HR creates an interview with Alice and assigns Interviewer 1
    const createRes = await makeRequest('/api/interviews', {
      method: 'POST',
      token: users.hr.token,
      body: {
        candidateId: candidate1Profile._id,
        title: 'Full Stack Engineer Interview',
        interviewerId: users.i1.user.id,
      },
    });
    assert.strictEqual(createRes.statusCode, 201);
    testInterview = createRes.body.interview;

    // HR invites the interview (status becomes 'invited')
    const inviteRes = await makeRequest(`/api/interviews/${testInterview.id}/invite`, {
      method: 'POST',
      token: users.hr.token,
    });
    assert.strictEqual(inviteRes.statusCode, 200);
    testInterview = inviteRes.body.interview;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    const db = getDatabase();
    if (db && db.databaseName === TEST_DB_NAME) {
      await db.dropDatabase();
    }
    await closeDatabase();
  });

  describe('Candidate Room Access & Authorization', () => {
    it('rejects unauthenticated room requests', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/room`);
      assert.strictEqual(res.statusCode, 401);
    });

    it('rejects an unauthorized role (interviewer accessing candidate namespace)', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/room`, {
        token: users.i1.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects another candidate attempting to access Alice room', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/room`, {
        token: users.c2.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('returns room context for authorized candidate', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/room`, {
        token: users.c1.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.room);
      assert.strictEqual(res.body.room.interview.id, testInterview.id);
      assert.strictEqual(res.body.room.interview.status, 'invited');
      assert.strictEqual(res.body.room.candidate.name, 'Alice Candidate');
      assert.strictEqual(res.body.room.interviewer.name, 'Interviewer 1');
    });

    it('returns 404 for nonexistent interview room', async () => {
      const res = await makeRequest('/api/interviewee/interviews/nonexistent-id/room', {
        token: users.c1.token,
      });
      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('Interviewer Room Access & Authorization', () => {
    it('rejects unauthenticated interviewer room requests', async () => {
      const res = await makeRequest(`/api/interviewer/interviews/${testInterview.id}/room`);
      assert.strictEqual(res.statusCode, 401);
    });

    it('rejects candidate attempting to access interviewer namespace', async () => {
      const res = await makeRequest(`/api/interviewer/interviews/${testInterview.id}/room`, {
        token: users.c1.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects unassigned interviewer (Interviewer 2) from accessing room', async () => {
      const res = await makeRequest(`/api/interviewer/interviews/${testInterview.id}/room`, {
        token: users.i2.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('returns room context for assigned interviewer', async () => {
      const res = await makeRequest(`/api/interviewer/interviews/${testInterview.id}/room`, {
        token: users.i1.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.room.interview.id, testInterview.id);
      assert.strictEqual(res.body.room.candidate.name, 'Alice Candidate');
      assert.strictEqual(res.body.room.interviewer.name, 'Interviewer 1');
    });
  });

  describe('Room Session Lifecycle (Join -> In Progress -> End -> Completed)', () => {
    it('candidate joins room: transitions status to in_progress and records started_at', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/room/join`, {
        method: 'POST',
        token: users.c1.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.room.interview.status, 'in_progress');
      assert.ok(res.body.room.interview.started_at);
    });

    it('joining when already in_progress is idempotent', async () => {
      const res = await makeRequest(`/api/interviewer/interviews/${testInterview.id}/room/join`, {
        method: 'POST',
        token: users.i1.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.room.interview.status, 'in_progress');
    });

    it('candidate leaves room cleanly without ending the overall interview', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/room/leave`, {
        method: 'POST',
        token: users.c1.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');

      // Still in_progress
      const checkRes = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/room`, {
        token: users.c1.token,
      });
      assert.strictEqual(checkRes.body.room.interview.status, 'in_progress');
    });

    it('interviewer ends interview: transitions status to completed and records ended_at', async () => {
      const res = await makeRequest(`/api/interviewer/interviews/${testInterview.id}/room/end`, {
        method: 'POST',
        token: users.i1.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.interview.status, 'completed');
      assert.ok(res.body.interview.ended_at);
    });

    it('room reflects completed state', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/room`, {
        token: users.c1.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.room.interview.status, 'completed');
      assert.ok(res.body.room.interview.ended_at);
    });

    it('cannot re-join a completed interview', async () => {
      const res = await makeRequest(`/api/interviewee/interviews/${testInterview.id}/room/join`, {
        method: 'POST',
        token: users.c1.token,
      });
      assert.strictEqual(res.statusCode, 409);
    });
  });
});

