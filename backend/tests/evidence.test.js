import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'interview_monitoring_evidence_test';
process.env.JWT_SECRET = 'phase17-evidence-test-secret';

const TEST_DB_NAME = 'interview_monitoring_evidence_test';

const { default: app } = await import('../src/app.js');
const { connectDatabase, closeDatabase, getDatabaseName } = await import('../src/config/database.js');
const { ensureBaselineIndexes } = await import('../src/db/indexes.js');
const { COLLECTIONS } = await import('../src/db/collections.js');
const {
  EVIDENCE_TYPES,
  RETENTION_CLASSES,
  RETENTION_PERIODS_MS,
  generateEvidenceIdempotencyKey,
} = await import('../src/evidence/evidenceConstants.js');
const {
  normalizeEvidenceSpec,
  createOrUpdateEvidence,
  findEvidenceByInterview,
  findEvidenceById,
  findEvidenceByEventId,
  getEvidenceSummary,
  deleteExpiredEvidence,
} = await import('../src/evidence/evidenceRepository.js');
const {
  buildEvidenceSpecForEvent,
  captureEvidenceForEvents,
} = await import('../src/evidence/evidenceService.js');
const { processBehaviourAnalysis } = await import('../src/events/eventEngine.js');

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

describe('Phase 17: Evidence System & Observation Context', () => {
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
    assert.ok(db, 'MongoDB connection must succeed for Phase 17 tests');
    assert.strictEqual(getDatabaseName(), TEST_DB_NAME);
    await ensureBaselineIndexes(db);

    // Clean test collections
    await db.collection(COLLECTIONS.USERS).deleteMany({ email: /@evidence-test\.local/ });
    await db.collection(COLLECTIONS.RECRUITERS).deleteMany({});
    await db.collection(COLLECTIONS.CANDIDATES).deleteMany({});
    await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).deleteMany({});
    await db.collection(COLLECTIONS.MONITORING_EVENTS).deleteMany({});
    await db.collection(COLLECTIONS.ALERTS).deleteMany({});
    await db.collection(COLLECTIONS.EVIDENCE).deleteMany({});

    httpServer = http.createServer(app);
    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    // Helper to register & login a user
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

    users.hr = await createTestUser('hr-owner@evidence-test.local', 'Password123!', 'hr', 'HR Owner');
    users.otherHr = await createTestUser('hr-other@evidence-test.local', 'Password123!', 'hr', 'Other HR');
    users.interviewer = await createTestUser('interviewer-assigned@evidence-test.local', 'Password123!', 'interviewer', 'Assigned Interviewer');
    users.otherInterviewer = await createTestUser('interviewer-other@evidence-test.local', 'Password123!', 'interviewer', 'Other Interviewer');
    users.candidate = await createTestUser('candidate@evidence-test.local', 'Password123!', 'interviewee', 'Candidate Person');

    hrProfile = await db.collection(COLLECTIONS.RECRUITERS).findOne({ user_id: users.hr.user.id });
    otherHrProfile = await db.collection(COLLECTIONS.RECRUITERS).findOne({ user_id: users.otherHr.user.id });
    candidateProfile = await db.collection(COLLECTIONS.CANDIDATES).findOne({ user_id: users.candidate.user.id });
    interviewerUser = users.interviewer.user;
    otherInterviewerUser = users.otherInterviewer.user;

    // Create interview owned by HR, assigned to interviewer, for candidate
    testInterview = {
      _id: randomUUID(),
      title: 'Phase 17 Evidence System Evaluation',
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
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    if (db) {
      await db.dropDatabase();
      await closeDatabase();
    }
  });

  describe('1. Evidence Specification & Normalization', () => {
    it('normalizes valid evidence spec with defaults', () => {
      const interviewId = randomUUID();
      const spec = normalizeEvidenceSpec({
        interview_id: interviewId,
        metadata: { score: 0.95 },
      });

      assert.strictEqual(spec.interview_id, interviewId);
      assert.strictEqual(spec.evidence_type, EVIDENCE_TYPES.OBSERVATION_CONTEXT);
      assert.strictEqual(spec.retention_class, RETENTION_CLASSES.STANDARD);
      assert.ok(spec.evidence_id);
      assert.ok(spec.expires_at > spec.captured_at);
      assert.ok(spec.size_bytes > 0);
    });

    it('rejects invalid evidence spec missing interview_id', () => {
      assert.throws(() => {
        normalizeEvidenceSpec({ metadata: {} });
      }, /interview_id is required/);
    });

    it('rejects unsupported evidence type', () => {
      assert.throws(() => {
        normalizeEvidenceSpec({
          interview_id: randomUUID(),
          evidence_type: 'INVALID_TYPE',
        });
      }, /Invalid evidence_type/);
    });

    it('rejects invalid retention class', () => {
      assert.throws(() => {
        normalizeEvidenceSpec({
          interview_id: randomUUID(),
          retention_class: 'FOREVER_AND_EVER',
        });
      }, /Invalid retention_class/);
    });
  });

  describe('2. Evidence Repository & Atomic Upsert', () => {
    it('creates evidence record and enforces idempotency key', async () => {
      const idempotencyKey = `test-idemp-${randomUUID()}`;
      const spec = {
        interview_id: testInterview._id,
        evidence_type: EVIDENCE_TYPES.OBSERVATION_CONTEXT,
        retention_class: RETENTION_CLASSES.STANDARD,
        metadata: {
          event_type: 'GAZE_AWAY_PROLONGED',
          confidence: 0.88,
          observation_count: 5,
        },
        idempotency_key: idempotencyKey,
      };

      const doc1 = await createOrUpdateEvidence(spec);
      assert.ok(doc1._id);
      assert.strictEqual(doc1.idempotency_key, idempotencyKey);
      assert.strictEqual(doc1.metadata.event_type, 'GAZE_AWAY_PROLONGED');

      // Re-upsert with same idempotency key must not create duplicate
      const doc2 = await createOrUpdateEvidence({
        ...spec,
        metadata: { ...spec.metadata, confidence: 0.92 },
      });

      assert.strictEqual(doc2._id.toString(), doc1._id.toString());
      assert.strictEqual(doc2.evidence_id, doc1.evidence_id);
      assert.strictEqual(doc2.metadata.confidence, 0.92);

      const count = await db.collection(COLLECTIONS.EVIDENCE).countDocuments({ idempotency_key: idempotencyKey });
      assert.strictEqual(count, 1, 'Only 1 record should exist for given idempotency key');
    });

    it('finds evidence by interview with pagination and filtering', async () => {
      const result = await findEvidenceByInterview(testInterview._id, {
        limit: 10,
        offset: 0,
      });

      assert.ok(result.items.length >= 1);
      assert.strictEqual(result.pagination.total, result.items.length);
      assert.strictEqual(result.pagination.limit, 10);
      assert.strictEqual(result.pagination.page, 1);
    });

    it('finds evidence by evidence_id and by _id', async () => {
      const all = await findEvidenceByInterview(testInterview._id, { limit: 1 });
      const first = all.items[0];

      const byEvidenceId = await findEvidenceById(first.evidence_id);
      assert.ok(byEvidenceId);
      assert.strictEqual(byEvidenceId.evidence_id, first.evidence_id);

      const byMongoId = await findEvidenceById(first._id);
      assert.ok(byMongoId);
      assert.strictEqual(byMongoId._id.toString(), first._id.toString());
    });

    it('aggregates evidence summary correctly', async () => {
      const summary = await getEvidenceSummary(testInterview._id);
      assert.strictEqual(summary.interview_id, testInterview._id);
      assert.ok(summary.total_evidence >= 1);
      assert.ok(summary.total_size_bytes > 0);
      assert.ok(summary.by_type[EVIDENCE_TYPES.OBSERVATION_CONTEXT] >= 1);
    });

    it('deletes expired evidence', async () => {
      const expiredSpec = {
        interview_id: testInterview._id,
        evidence_type: EVIDENCE_TYPES.METRICS_SUMMARY,
        expires_at: new Date(Date.now() - 1000).toISOString(),
        idempotency_key: `expired-${randomUUID()}`,
      };
      const expiredDoc = await createOrUpdateEvidence(expiredSpec);
      assert.ok(expiredDoc._id);

      const deletedResult = await deleteExpiredEvidence(new Date());
      assert.ok(deletedResult.deleted_count >= 1 || deletedResult.deletedCount >= 1);

      const found = await findEvidenceById(expiredDoc.evidence_id);
      assert.strictEqual(found, null);
    });
  });

  describe('3. Event Engine Evidence Capture & Linking', () => {
    it('captures structured evidence on qualifying monitoring event and links evidence_ids', async () => {
      const analysisPayload = {
        analysis_id: `analysis-${randomUUID()}`,
        interview_id: testInterview._id,
        schema_version: '1.0',
        timestamp: new Date().toISOString(),
        signals: [
          {
            signal_type: 'MULTIPLE_FACES',
            status: 'observed',
            severity: 'high',
            reliability: 'sufficient',
            metrics: {
              start_sequence: 1,
              is_ongoing: true,
              face_count: 2,
            },
            start_timestamp: new Date().toISOString(),
            end_timestamp: new Date().toISOString(),
            duration_ms: 2000,
          },
        ],
        monitoring_quality: {
          status: 'good',
          total_observations: 10,
        },
      };

      const result = await processBehaviourAnalysis(analysisPayload);
      assert.ok(result.events.length > 0, 'Should generate monitoring event');

      const event = result.events[0];
      assert.ok(event.event_id);

      // Verify evidence generation hook returned evidence summary
      assert.ok(result.evidence_summary);
      assert.ok(result.evidence_summary.created_or_updated >= 1);

      // Verify bidirectional link in DB
      const updatedEvent = await db.collection(COLLECTIONS.MONITORING_EVENTS).findOne({ event_id: event.event_id });
      assert.ok(updatedEvent);
      assert.ok(Array.isArray(updatedEvent.evidence_ids), 'Event must have evidence_ids array');
      assert.ok(updatedEvent.evidence_ids.length >= 1, 'Event must link to generated evidence ID');

      const evidenceRecords = await findEvidenceByEventId(event.event_id);
      assert.ok(evidenceRecords.length >= 1);
      assert.ok(
        evidenceRecords[0].event_id === event.event_id || evidenceRecords[0].event_id === event._id
      );
      assert.strictEqual(evidenceRecords[0].interview_id, testInterview._id);
      assert.strictEqual(evidenceRecords[0].metadata.event_type, event.event_type);
    });
  });

  describe('4. REST API Endpoints & RBAC Verification', () => {
    it('rejects unauthenticated requests to GET /api/interviews/:id/evidence with 401', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/evidence`);
      assert.strictEqual(res.statusCode, 401);
    });

    it('rejects candidate (interviewee) requests to GET /api/interviews/:id/evidence with 403', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/evidence`, {
        token: users.candidate.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects unassigned interviewer requests with 403', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/evidence`, {
        token: users.otherInterviewer.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects non-owning HR requests with 403', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/evidence`, {
        token: users.otherHr.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('allows owner HR recruiter to access GET /api/interviews/:id/evidence', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/evidence`, {
        token: users.hr.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(Array.isArray(res.body.evidence));
      assert.ok(res.body.pagination);
    });

    it('allows assigned interviewer to access GET /api/interviews/:id/evidence', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/evidence`, {
        token: users.interviewer.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(Array.isArray(res.body.evidence));
    });

    it('allows access to GET /api/interviews/:id/evidence/summary', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/evidence/summary`, {
        token: users.interviewer.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.summary.interview_id, testInterview._id);
      assert.ok(res.body.summary.total_evidence >= 1);
    });

    it('allows access to GET /api/evidence/:evidenceId for assigned interviewer', async () => {
      const listRes = await makeRequest(`/api/interviews/${testInterview._id}/evidence`, {
        token: users.interviewer.token,
      });
      const firstEvidence = listRes.body.evidence[0];
      assert.ok(firstEvidence);

      const res = await makeRequest(`/api/evidence/${firstEvidence.evidence_id}`, {
        token: users.interviewer.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.evidence.evidence_id, firstEvidence.evidence_id);
    });

    it('returns 404 for non-existent evidenceId on GET /api/evidence/:evidenceId', async () => {
      const res = await makeRequest(`/api/evidence/non-existent-id-12345`, {
        token: users.hr.token,
      });
      assert.strictEqual(res.statusCode, 404);
    });

    it('rejects candidate accessing GET /api/evidence/:evidenceId with 403', async () => {
      const listRes = await makeRequest(`/api/interviews/${testInterview._id}/evidence`, {
        token: users.hr.token,
      });
      const firstEvidence = listRes.body.evidence[0];

      const res = await makeRequest(`/api/evidence/${firstEvidence.evidence_id}`, {
        token: users.candidate.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });
  });
});
