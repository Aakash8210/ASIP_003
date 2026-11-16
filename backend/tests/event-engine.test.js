import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'interview_monitoring_events_test';
process.env.JWT_SECRET = 'phase15-event-engine-test-secret';

const TEST_DB_NAME = 'interview_monitoring_events_test';

const { default: app } = await import('../src/app.js');
const { connectDatabase, closeDatabase, getDatabase, getDatabaseName } = await import('../src/config/database.js');
const { ensureBaselineIndexes } = await import('../src/db/indexes.js');
const { COLLECTIONS } = await import('../src/db/collections.js');
const {
  validateBehaviourAnalysisPayload,
  normalizeSignalToEvent,
  normalizeMonitoringQualityToEvent,
} = await import('../src/events/eventNormalizer.js');
const { processBehaviourAnalysis, resolveMonitoringEvent } = await import('../src/events/eventEngine.js');
const { findEventsByInterview, findEventById, getEventsSummary } = await import('../src/events/eventRepository.js');

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

describe('Phase 15: Event Engine & Persistence', () => {
  const users = {};
  let db;
  let testInterview;
  let otherInterview;
  let hrProfile;
  let otherHrProfile;
  let candidateProfile;
  let interviewerUser;
  let otherInterviewerUser;

  before(async () => {
    db = await connectDatabase();
    assert.ok(db, 'MongoDB connection must succeed for Phase 15 tests');
    assert.strictEqual(getDatabaseName(), TEST_DB_NAME);
    await ensureBaselineIndexes(db);

    // Clean test collections
    await db.collection(COLLECTIONS.USERS).deleteMany({ email: /@event-test\.local/ });
    await db.collection(COLLECTIONS.RECRUITERS).deleteMany({});
    await db.collection(COLLECTIONS.CANDIDATES).deleteMany({});
    await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).deleteMany({});
    await db.collection(COLLECTIONS.MONITORING_EVENTS).deleteMany({});

    httpServer = http.createServer(app);
    await new Promise((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        port = httpServer.address().port;
        resolve();
      });
    });

    // 1. Create HR user
    const regHR = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Owner HR', email: 'hr1@event-test.local', password: 'Password123!', role: 'hr' },
    });
    users.hr = regHR.body;

    // 2. Create second HR user (unauthorized)
    const regHR2 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Other HR', email: 'hr2@event-test.local', password: 'Password123!', role: 'hr' },
    });
    users.otherHr = regHR2.body;

    // 3. Create Candidate
    const regCandidate = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Candidate 1', email: 'cand1@event-test.local', password: 'Password123!', role: 'interviewee' },
    });
    users.candidate = regCandidate.body;

    // 4. Create Assigned Interviewer
    const regInterviewer = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Interviewer 1', email: 'int1@event-test.local', password: 'Password123!', role: 'interviewer' },
    });
    users.interviewer = regInterviewer.body;

    // 5. Create Other Interviewer
    const regInterviewer2 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Interviewer 2', email: 'int2@event-test.local', password: 'Password123!', role: 'interviewer' },
    });
    users.otherInterviewer = regInterviewer2.body;

    hrProfile = await db.collection(COLLECTIONS.RECRUITERS).findOne({ user_id: users.hr.user.id });
    otherHrProfile = await db.collection(COLLECTIONS.RECRUITERS).findOne({ user_id: users.otherHr.user.id });
    candidateProfile = await db.collection(COLLECTIONS.CANDIDATES).findOne({ user_id: users.candidate.user.id });
    interviewerUser = users.interviewer.user;
    otherInterviewerUser = users.otherInterviewer.user;

    // Create test interview assigned to candidate1 and interviewer1
    testInterview = {
      _id: randomUUID(),
      title: 'Phase 15 Test Interview',
      recruiter_id: hrProfile._id,
      candidate_id: candidateProfile._id,
      interviewer_id: interviewerUser.id,
      status: 'in_progress',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).insertOne(testInterview);

    // Create secondary interview owned by other HR
    otherInterview = {
      _id: randomUUID(),
      title: 'Other HR Interview',
      recruiter_id: otherHrProfile._id,
      candidate_id: candidateProfile._id,
      interviewer_id: otherInterviewerUser.id,
      status: 'in_progress',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).insertOne(otherInterview);
  });

  after(async () => {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await closeDatabase();
  });

  describe('1. Normalization & Validation Unit Tests', () => {
    it('validateBehaviourAnalysisPayload validates schema and interview id', () => {
      assert.throws(() => validateBehaviourAnalysisPayload(null), /required and must be an object/);
      assert.throws(() => validateBehaviourAnalysisPayload({}), /analysis_id is required/);
      assert.throws(() => validateBehaviourAnalysisPayload({ analysis_id: 'a1' }), /interview_id is required/);
      assert.throws(
        () => validateBehaviourAnalysisPayload({ analysis_id: 'a1', interview_id: 'int-1' }, 'int-2'),
        /does not match requested interview/
      );

      const valid = validateBehaviourAnalysisPayload(
        { analysis_id: 'a1', interview_id: 'int-1', signals: [] },
        'int-1'
      );
      assert.strictEqual(valid, true);
    });

    it('normalizeSignalToEvent converts ongoing FACE_ABSENCE into ACTIVE event', () => {
      const signal = {
        signal_type: 'FACE_ABSENCE',
        status: 'observed',
        start_timestamp: '2026-11-10T08:00:00.000Z',
        end_timestamp: '2026-11-10T08:00:05.000Z',
        duration_ms: 5000,
        observation_count: 5,
        reliability: 'sufficient',
        metrics: {
          absence_start_sequence: 10,
          absence_end_sequence: 15,
          is_ongoing: true,
        },
        explanation: 'No face observed for consecutive frames.',
      };

      const event = normalizeSignalToEvent(signal, { analysis_id: 'analysis-123', interview_id: 'int-123' }, 'cand-1');
      assert.ok(event);
      assert.strictEqual(event.idempotency_key, 'int-123:FACE_ABSENCE:10');
      assert.strictEqual(event.event_type, 'FACE_ABSENCE');
      assert.strictEqual(event.status, 'ACTIVE');
      assert.strictEqual(event.severity, 'high');
      assert.strictEqual(event.candidate_id, 'cand-1');
      assert.strictEqual(event.confidence, 0.95);
      assert.strictEqual(event.duration_ms, 5000);
      assert.strictEqual(event.metrics.is_ongoing, true);
    });

    it('normalizeSignalToEvent converts resolved MULTIPLE_FACES into RESOLVED event', () => {
      const signal = {
        signal_type: 'MULTIPLE_FACES',
        status: 'observed',
        start_timestamp: '2026-11-10T08:00:10.000Z',
        end_timestamp: '2026-11-10T08:00:15.000Z',
        duration_ms: 5000,
        observation_count: 4,
        reliability: 'degraded',
        metrics: {
          start_sequence: 20,
          end_sequence: 24,
          max_faces_detected: 2,
          is_ongoing: false,
        },
        explanation: 'Multiple distinct faces detected in frame window.',
      };

      const event = normalizeSignalToEvent(signal, { analysis_id: 'analysis-123', interview_id: 'int-123' }, 'cand-1');
      assert.ok(event);
      assert.strictEqual(event.idempotency_key, 'int-123:MULTIPLE_FACES:20');
      assert.strictEqual(event.event_type, 'MULTIPLE_FACES');
      assert.strictEqual(event.status, 'RESOLVED');
      assert.strictEqual(event.severity, 'high');
      assert.strictEqual(event.confidence, 0.80);
    });

    it('normalizeSignalToEvent ignores normal/high consistency and unsupported types', () => {
      const normalConsistency = {
        signal_type: 'FACE_PRESENCE_CONSISTENCY',
        status: 'observed',
        metrics: { classification: 'normal', presence_ratio: 0.95 },
      };
      assert.strictEqual(normalizeSignalToEvent(normalConsistency, { analysis_id: 'a', interview_id: 'i' }), null);

      const unknownType = {
        signal_type: 'UNKNOWN_EMOTION_SIGNAL',
        status: 'observed',
      };
      assert.strictEqual(normalizeSignalToEvent(unknownType, { analysis_id: 'a', interview_id: 'i' }), null);
    });

    it('normalizeMonitoringQualityToEvent converts degraded stream to operational event', () => {
      const quality = {
        status: 'degraded',
        sequence_range_start: 1,
        sequence_range_end: 20,
        missing_sequence_count: 3,
        total_observations: 17,
        explanation: 'Stream experienced sequence gaps.',
      };

      const event = normalizeMonitoringQualityToEvent(quality, { analysis_id: 'a', interview_id: 'int-1' }, 'c-1');
      assert.ok(event);
      assert.strictEqual(event.event_type, 'MONITORING_DATA_QUALITY');
      assert.strictEqual(event.category, 'OPERATIONAL');
      assert.strictEqual(event.severity, 'medium');
      assert.strictEqual(event.metrics.missing_sequence_count, 3);
    });
  });

  describe('2. Persistence & Idempotency Engine Tests', () => {
    it('processBehaviourAnalysis rejects non-existent interview with 404', async () => {
      const payload = {
        analysis_id: 'a-nonexistent',
        interview_id: 'non-existent-interview-id',
        signals: [],
      };
      await assert.rejects(
        async () => processBehaviourAnalysis(payload),
        (err) => err.statusCode === 404 && err.message.includes('does not exist')
      );
    });

    it('persists initial behaviour signals into monitoring_events collection', async () => {
      const payload = {
        analysis_id: 'analysis-batch-001',
        interview_id: testInterview._id,
        signals: [
          {
            signal_type: 'FACE_ABSENCE',
            status: 'observed',
            start_timestamp: '2026-11-10T08:05:00.000Z',
            end_timestamp: '2026-11-10T08:05:04.000Z',
            duration_ms: 4000,
            observation_count: 4,
            reliability: 'sufficient',
            metrics: {
              absence_start_sequence: 100,
              absence_end_sequence: 104,
              is_ongoing: true,
            },
            explanation: 'Face not observed in active camera frame.',
          },
        ],
        monitoring_quality: {
          status: 'degraded',
          sequence_range_start: 95,
          sequence_range_end: 105,
          missing_sequence_count: 2,
          explanation: 'Minor frame drop.',
        },
      };

      const result = await processBehaviourAnalysis(payload, testInterview._id);
      assert.strictEqual(result.status, 'ok');
      assert.strictEqual(result.events_created, 2);
      assert.strictEqual(result.events_updated, 0);
      assert.strictEqual(result.events.length, 2);

      const dbEvents = await db.collection(COLLECTIONS.MONITORING_EVENTS).find({ interview_id: testInterview._id }).toArray();
      assert.strictEqual(dbEvents.length, 2);

      const absenceDoc = dbEvents.find((e) => e.event_type === 'FACE_ABSENCE');
      assert.ok(absenceDoc);
      assert.strictEqual(absenceDoc.status, 'ACTIVE');
      assert.strictEqual(absenceDoc.idempotency_key, `${testInterview._id}:FACE_ABSENCE:100`);
      assert.strictEqual(absenceDoc.candidate_id, candidateProfile._id);
      assert.strictEqual(absenceDoc.duration_ms, 4000);
      assert.ok(absenceDoc.event_id.startsWith(`evt_${testInterview._id}_`));
      assert.strictEqual(absenceDoc.review_status, 'unreviewed');
    });

    it('idempotently handles replayed identical payload without duplicate creation', async () => {
      const countBefore = await db.collection(COLLECTIONS.MONITORING_EVENTS).countDocuments({ interview_id: testInterview._id });

      const payload = {
        analysis_id: 'analysis-batch-001',
        interview_id: testInterview._id,
        signals: [
          {
            signal_type: 'FACE_ABSENCE',
            status: 'observed',
            start_timestamp: '2026-11-10T08:05:00.000Z',
            end_timestamp: '2026-11-10T08:05:04.000Z',
            duration_ms: 4000,
            observation_count: 4,
            reliability: 'sufficient',
            metrics: {
              absence_start_sequence: 100,
              absence_end_sequence: 104,
              is_ongoing: true,
            },
            explanation: 'Face not observed in active camera frame.',
          },
        ],
      };

      const result = await processBehaviourAnalysis(payload, testInterview._id);
      assert.strictEqual(result.events_created, 0);
      assert.strictEqual(result.events_updated, 1);

      const countAfter = await db.collection(COLLECTIONS.MONITORING_EVENTS).countDocuments({ interview_id: testInterview._id });
      assert.strictEqual(countAfter, countBefore, 'Replayed payload must not create duplicate documents in MongoDB');
    });

    it('updates ongoing run in place and preserves initial start timestamp and event_id', async () => {
      const initialDoc = await db.collection(COLLECTIONS.MONITORING_EVENTS).findOne({
        idempotency_key: `${testInterview._id}:FACE_ABSENCE:100`,
      });

      // Updated batch where absence has continued for 8000ms
      const payload = {
        analysis_id: 'analysis-batch-002',
        interview_id: testInterview._id,
        signals: [
          {
            signal_type: 'FACE_ABSENCE',
            status: 'observed',
            start_timestamp: '2026-11-10T08:05:00.000Z',
            end_timestamp: '2026-11-10T08:05:08.000Z',
            duration_ms: 8000,
            observation_count: 8,
            reliability: 'sufficient',
            metrics: {
              absence_start_sequence: 100,
              absence_end_sequence: 108,
              is_ongoing: true,
            },
            explanation: 'Face not observed in active camera frame.',
          },
        ],
      };

      const result = await processBehaviourAnalysis(payload, testInterview._id);
      assert.strictEqual(result.events_updated, 1);

      const updatedDoc = await db.collection(COLLECTIONS.MONITORING_EVENTS).findOne({
        idempotency_key: `${testInterview._id}:FACE_ABSENCE:100`,
      });

      assert.strictEqual(updatedDoc._id, initialDoc._id, '_id must be preserved across run updates');
      assert.strictEqual(updatedDoc.event_id, initialDoc.event_id, 'business event_id must be preserved');
      assert.strictEqual(updatedDoc.duration_ms, 8000, 'duration_ms must reflect ongoing elapsed duration');
      assert.strictEqual(updatedDoc.occurrence_count, 8);
      assert.strictEqual(updatedDoc.status, 'ACTIVE');
    });

    it('transitions ongoing run to RESOLVED when signal clears', async () => {
      const payload = {
        analysis_id: 'analysis-batch-003',
        interview_id: testInterview._id,
        signals: [
          {
            signal_type: 'FACE_ABSENCE',
            status: 'observed',
            start_timestamp: '2026-11-10T08:05:00.000Z',
            end_timestamp: '2026-11-10T08:05:10.000Z',
            duration_ms: 10000,
            observation_count: 10,
            reliability: 'sufficient',
            metrics: {
              absence_start_sequence: 100,
              absence_end_sequence: 110,
              is_ongoing: false,
            },
            explanation: 'Face absence concluded after candidate re-entered frame.',
          },
        ],
      };

      const result = await processBehaviourAnalysis(payload, testInterview._id);
      assert.strictEqual(result.events_resolved, 1);

      const resolvedDoc = await db.collection(COLLECTIONS.MONITORING_EVENTS).findOne({
        idempotency_key: `${testInterview._id}:FACE_ABSENCE:100`,
      });

      assert.strictEqual(resolvedDoc.status, 'RESOLVED');
      assert.ok(resolvedDoc.resolved_at instanceof Date);
    });

    it('resolveMonitoringEvent transitions active event to RESOLVED', async () => {
      // Find the degraded monitoring quality event which is still ACTIVE
      const activeEvent = await db.collection(COLLECTIONS.MONITORING_EVENTS).findOne({
        interview_id: testInterview._id,
        status: 'ACTIVE',
      });
      assert.ok(activeEvent);

      const resolved = await resolveMonitoringEvent(activeEvent._id, {
        resolution_note: 'Resolved by operator',
      });

      assert.strictEqual(resolved.status, 'RESOLVED');
      assert.ok(resolved.resolved_at instanceof Date);
      assert.strictEqual(resolved.metrics.resolution_note, 'Resolved by operator');
    });
  });

  describe('3. Repository Query & Aggregation Tests', () => {
    before(async () => {
      // Seed a few more events for query testing
      await db.collection(COLLECTIONS.MONITORING_EVENTS).insertMany([
        {
          _id: randomUUID(),
          event_id: `evt_${testInterview._id}_m1`,
          idempotency_key: `${testInterview._id}:MULTIPLE_FACES:200`,
          interview_id: testInterview._id,
          candidate_id: candidateProfile._id,
          event_type: 'MULTIPLE_FACES',
          category: 'VISUAL_MONITORING',
          source: 'PHASE_14_BEHAVIOUR_ENGINE',
          status: 'ACTIVE',
          first_observed_at: new Date('2026-11-10T08:10:00Z'),
          last_observed_at: new Date('2026-11-10T08:10:05Z'),
          timestamp: new Date('2026-11-10T08:10:00Z'),
          duration_ms: 5000,
          occurrence_count: 5,
          reliability: 'SUFFICIENT',
          severity: 'high',
          confidence: 0.95,
          metrics: { max_faces_detected: 2 },
          explanation: 'Multiple faces detected in frame window.',
          review_status: 'unreviewed',
          created_at: new Date(),
        },
        {
          _id: randomUUID(),
          event_id: `evt_${testInterview._id}_q1`,
          idempotency_key: `${testInterview._id}:FRAME_QUALITY:window1`,
          interview_id: testInterview._id,
          candidate_id: candidateProfile._id,
          event_type: 'FRAME_QUALITY_SUMMARY',
          category: 'OPERATIONAL',
          source: 'PHASE_14_BEHAVIOUR_ENGINE',
          status: 'RESOLVED',
          first_observed_at: new Date('2026-11-10T08:15:00Z'),
          last_observed_at: new Date('2026-11-10T08:15:05Z'),
          timestamp: new Date('2026-11-10T08:15:00Z'),
          duration_ms: 0,
          occurrence_count: 5,
          reliability: 'DEGRADED',
          severity: 'medium',
          confidence: 0.80,
          metrics: { classification: 'degraded' },
          explanation: 'Lighting and clarity degraded in recent frames.',
          review_status: 'unreviewed',
          created_at: new Date(),
        },
      ]);
    });

    it('findEventsByInterview filters by status, severity, and paginates', async () => {
      const activeRes = await findEventsByInterview(testInterview._id, { status: 'ACTIVE' });
      assert.strictEqual(activeRes.events.length, 1);
      assert.strictEqual(activeRes.events[0].status, 'ACTIVE');

      const highRes = await findEventsByInterview(testInterview._id, { severity: 'high' });
      assert.ok(highRes.events.length >= 2);
      assert.ok(highRes.events.every((e) => e.severity === 'high'));

      const paged = await findEventsByInterview(testInterview._id, { page: 1, limit: 2 });
      assert.strictEqual(paged.events.length, 2);
      assert.strictEqual(paged.pagination.page, 1);
      assert.strictEqual(paged.pagination.limit, 2);
      assert.ok(paged.pagination.total >= 4);
      assert.strictEqual(paged.pagination.hasNext, true);
    });

    it('findEventById retrieves by _id and by event_id', async () => {
      const someEvent = await db.collection(COLLECTIONS.MONITORING_EVENTS).findOne({ interview_id: testInterview._id });
      assert.ok(someEvent);

      const byId = await findEventById(someEvent._id);
      assert.strictEqual(byId._id, someEvent._id);

      const byEventId = await findEventById(someEvent.event_id);
      assert.strictEqual(byEventId.event_id, someEvent.event_id);

      const notFound = await findEventById('non-existent-id');
      assert.strictEqual(notFound, null);
    });

    it('getEventsSummary calculates status breakdown, severity breakdown, and temporal bounds', async () => {
      const summary = await getEventsSummary(testInterview._id);
      assert.strictEqual(summary.interview_id, testInterview._id);
      assert.ok(summary.total_events >= 4);
      assert.strictEqual(summary.active_events, 1);
      assert.ok(summary.resolved_events >= 3);
      assert.ok(summary.by_severity.high >= 2);
      assert.ok(summary.by_severity.medium >= 1);
      assert.ok(summary.first_event_at instanceof Date);
      assert.ok(summary.latest_event_at instanceof Date);
    });
  });

  describe('4. REST API Endpoint Tests & RBAC Access Control', () => {
    it('rejects unauthenticated requests to monitoring event routes with 401', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/monitoring-events`);
      assert.strictEqual(res.statusCode, 401);
    });

    it('rejects candidates from viewing monitoring events with 403', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/monitoring-events`, {
        token: users.candidate.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects unauthorized HR user not owning the interview with 403', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/monitoring-events`, {
        token: users.otherHr.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('rejects unassigned interviewer with 403', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/monitoring-events`, {
        token: users.otherInterviewer.token,
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it('allows owner HR to list monitoring events with pagination and filters', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/monitoring-events?page=1&limit=10`, {
        token: users.hr.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.interview_id, testInterview._id);
      assert.ok(Array.isArray(res.body.events));
      assert.ok(res.body.pagination);
      assert.ok(res.body.events.length >= 4);
    });

    it('allows assigned interviewer to list monitoring events', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/monitoring-events`, {
        token: users.interviewer.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
    });

    it('allows owner HR to retrieve monitoring events summary', async () => {
      const res = await makeRequest(`/api/interviews/${testInterview._id}/monitoring-events/summary`, {
        token: users.hr.token,
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.summary);
      assert.strictEqual(res.body.summary.interview_id, testInterview._id);
      assert.ok(res.body.summary.total_events >= 4);
    });

    it('allows owner HR to process a BehaviourAnalysisResult payload via POST', async () => {
      const payload = {
        analysis_id: `api-analysis-${randomUUID()}`,
        interview_id: testInterview._id,
        signals: [
          {
            signal_type: 'FACE_PRESENCE_CONSISTENCY',
            status: 'observed',
            start_timestamp: '2026-11-10T08:20:00.000Z',
            end_timestamp: '2026-11-10T08:20:30.000Z',
            duration_ms: 30000,
            observation_count: 30,
            reliability: 'sufficient',
            metrics: {
              classification: 'low',
              presence_ratio: 0.45,
            },
            explanation: 'Face presence observed in only 45% of camera sampling frames.',
          },
        ],
      };

      const res = await makeRequest(`/api/interviews/${testInterview._id}/monitoring-events/process`, {
        method: 'POST',
        body: payload,
        token: users.hr.token,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.interview_id, testInterview._id);
      assert.strictEqual(res.body.events_created, 1);
    });

    it('POST process returns 400 when payload interview_id does not match URL', async () => {
      const payload = {
        analysis_id: 'mismatch-1',
        interview_id: 'some-other-id',
        signals: [],
      };

      const res = await makeRequest(`/api/interviews/${testInterview._id}/monitoring-events/process`, {
        method: 'POST',
        body: payload,
        token: users.hr.token,
      });

      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.message.includes('does not match requested interview'));
    });

    it('retrieves a single monitoring event via GET /api/monitoring-events/:eventId', async () => {
      const event = await db.collection(COLLECTIONS.MONITORING_EVENTS).findOne({ interview_id: testInterview._id });
      assert.ok(event);

      const res = await makeRequest(`/api/monitoring-events/${event.event_id}`, {
        token: users.hr.token,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.event.event_id, event.event_id);
    });

    it('GET /api/monitoring-events/:eventId returns 404 for unknown eventId', async () => {
      const res = await makeRequest(`/api/monitoring-events/evt_nonexistent_12345`, {
        token: users.hr.token,
      });

      assert.strictEqual(res.statusCode, 404);
    });

    it('PATCH /api/monitoring-events/:eventId/resolve marks event as resolved', async () => {
      // Create a temporary active event to test resolve endpoint
      const tempDoc = {
        _id: randomUUID(),
        event_id: `evt_${testInterview._id}_temp`,
        idempotency_key: `${testInterview._id}:TEMP_ACTIVE:${randomUUID()}`,
        interview_id: testInterview._id,
        candidate_id: candidateProfile._id,
        event_type: 'MULTIPLE_FACES',
        category: 'VISUAL_MONITORING',
        source: 'PHASE_14_BEHAVIOUR_ENGINE',
        status: 'ACTIVE',
        timestamp: new Date(),
        created_at: new Date(),
      };
      await db.collection(COLLECTIONS.MONITORING_EVENTS).insertOne(tempDoc);

      const res = await makeRequest(`/api/monitoring-events/${tempDoc.event_id}/resolve`, {
        method: 'PATCH',
        body: { resolution_note: 'Candidate confirmed only one person present' },
        token: users.hr.token,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.event.status, 'RESOLVED');
      assert.strictEqual(res.body.event.metrics.resolution_note, 'Candidate confirmed only one person present');
    });
  });
});

