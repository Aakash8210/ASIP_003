import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { io as Client } from 'socket.io-client';

process.env.NODE_ENV = 'test';
process.env.MONGODB_DB_NAME = 'interview_monitoring_webrtc_test';
process.env.JWT_SECRET = 'phase11-webrtc-socket-test-secret';

const TEST_DB_NAME = 'interview_monitoring_webrtc_test';

const { default: app } = await import('../src/app.js');
const { initializeSocketServer } = await import('../src/socket/server.js');
const { connectDatabase, closeDatabase, getDatabase, getDatabaseName } = await import('../src/config/database.js');
const { ensureBaselineIndexes } = await import('../src/db/indexes.js');
const { COLLECTIONS } = await import('../src/db/collections.js');

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

const createClientSocket = (token, options = {}) => {
  return Client(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
    forceNew: true,
    ...options,
  });
};

describe('WebRTC & Socket.io Signaling (Phase 11)', () => {
  const users = {};
  let candidateProfile;
  let unauthorizedCandidateProfile;
  let testInterview;

  before(async () => {
    const db = await connectDatabase();
    assert.ok(db, 'MongoDB connection must succeed for Phase 11 tests');
    assert.strictEqual(getDatabaseName(), TEST_DB_NAME);
    await ensureBaselineIndexes(db);

    await db.collection(COLLECTIONS.USERS).deleteMany({ email: /@example\.local/ });
    await db.collection(COLLECTIONS.CANDIDATES).deleteMany({});
    await db.collection(COLLECTIONS.INTERVIEW_SESSIONS).deleteMany({});

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
      body: { name: 'Signaling HR', email: 'sig-hr@example.local', password: 'Password123!', role: 'hr' },
    });
    users.hr = regHR.body;

    const regC1 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Assigned Candidate', email: 'candidate1@example.local', password: 'Password123!', role: 'interviewee' },
    });
    users.c1 = regC1.body;

    const regC2 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Unassigned Candidate', email: 'candidate2@example.local', password: 'Password123!', role: 'interviewee' },
    });
    users.c2 = regC2.body;

    const regI1 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Assigned Interviewer', email: 'interviewer1@example.local', password: 'Password123!', role: 'interviewer' },
    });
    users.i1 = regI1.body;

    const regI2 = await makeRequest('/api/auth/register', {
      method: 'POST',
      body: { name: 'Unassigned Interviewer', email: 'interviewer2@example.local', password: 'Password123!', role: 'interviewer' },
    });
    users.i2 = regI2.body;

    candidateProfile = await db.collection(COLLECTIONS.CANDIDATES).findOne({ user_id: users.c1.user.id });
    unauthorizedCandidateProfile = await db.collection(COLLECTIONS.CANDIDATES).findOne({ user_id: users.c2.user.id });

    // HR creates an interview with Candidate 1 and assigns Interviewer 1
    const createRes = await makeRequest('/api/interviews', {
      method: 'POST',
      token: users.hr.token,
      body: {
        candidateId: candidateProfile._id,
        title: 'Real-Time Signaling Interview',
        interviewerId: users.i1.user.id,
      },
    });
    assert.strictEqual(createRes.statusCode, 201);
    testInterview = createRes.body.interview;

    // HR invites the interview
    await makeRequest(`/api/interviews/${testInterview.id}/invite`, {
      method: 'POST',
      token: users.hr.token,
    });
  });

  after(async () => {
    if (ioServer) {
      await ioServer.close();
    }
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    const db = getDatabase();
    if (db && db.databaseName === TEST_DB_NAME) {
      await db.dropDatabase();
    }
    await closeDatabase();
  });

  describe('Socket.io Authentication Middleware', () => {
    it('rejects connection without token', async () => {
      const socket = createClientSocket(null);
      const errorPromise = new Promise((resolve) => {
        socket.on('connect_error', (err) => resolve(err.message));
      });
      const errorMsg = await errorPromise;
      assert.match(errorMsg, /Authentication required/i);
      socket.disconnect();
    });

    it('rejects connection with invalid token', async () => {
      const socket = createClientSocket('invalid.jwt.token');
      const errorPromise = new Promise((resolve) => {
        socket.on('connect_error', (err) => resolve(err.message));
      });
      const errorMsg = await errorPromise;
      assert.ok(errorMsg);
      socket.disconnect();
    });

    it('authenticates successfully with valid JWT', async () => {
      const socket = createClientSocket(users.c1.token);
      await new Promise((resolve, reject) => {
        socket.on('connect', resolve);
        socket.on('connect_error', reject);
      });
      assert.strictEqual(socket.connected, true);
      socket.disconnect();
    });
  });

  describe('Interview Room Joining & Authorization', () => {
    it('allows assigned candidate to join their interview room', async () => {
      const socket = createClientSocket(users.c1.token);
      await new Promise((resolve) => socket.on('connect', resolve));

      const ack = await new Promise((resolve) => {
        socket.emit('join-room', { interviewId: testInterview.id }, resolve);
      });

      assert.strictEqual(ack.status, 'ok');
      assert.strictEqual(ack.room, `interview:${testInterview.id}`);
      assert.ok(Array.isArray(ack.participants));
      socket.disconnect();
    });

    it('allows assigned interviewer to join the interview room', async () => {
      const socket = createClientSocket(users.i1.token);
      await new Promise((resolve) => socket.on('connect', resolve));

      const ack = await new Promise((resolve) => {
        socket.emit('join-room', { interviewId: testInterview.id }, resolve);
      });

      assert.strictEqual(ack.status, 'ok');
      assert.strictEqual(ack.room, `interview:${testInterview.id}`);
      socket.disconnect();
    });

    it('rejects unassigned interviewer from joining the room', async () => {
      const socket = createClientSocket(users.i2.token);
      await new Promise((resolve) => socket.on('connect', resolve));

      const ack = await new Promise((resolve) => {
        socket.emit('join-room', { interviewId: testInterview.id }, resolve);
      });

      assert.ok(ack.error);
      assert.match(ack.error, /permission|unauthorized/i);
      socket.disconnect();
    });

    it('rejects different candidate from joining the room', async () => {
      const socket = createClientSocket(users.c2.token);
      await new Promise((resolve) => socket.on('connect', resolve));

      const ack = await new Promise((resolve) => {
        socket.emit('join-room', { interviewId: testInterview.id }, resolve);
      });

      assert.ok(ack.error);
      assert.match(ack.error, /permission|unauthorized/i);
      socket.disconnect();
    });

    it('notifies peer when a participant joins the room', async () => {
      const socketCandidate = createClientSocket(users.c1.token);
      const socketInterviewer = createClientSocket(users.i1.token);

      await new Promise((res) => socketCandidate.on('connect', res));
      await new Promise((res) => socketInterviewer.on('connect', res));

      // Candidate joins first
      await new Promise((res) => {
        socketCandidate.emit('join-room', { interviewId: testInterview.id }, res);
      });

      // Candidate listens for participant-joined
      const joinEventPromise = new Promise((resolve) => {
        socketCandidate.on('participant-joined', resolve);
      });

      // Interviewer joins
      await new Promise((res) => {
        socketInterviewer.emit('join-room', { interviewId: testInterview.id }, res);
      });

      const eventData = await joinEventPromise;
      assert.strictEqual(eventData.userId, users.i1.user.id);
      assert.strictEqual(eventData.role, 'interviewer');

      socketCandidate.disconnect();
      socketInterviewer.disconnect();
    });
  });

  describe('WebRTC Signaling Exchange (Offer, Answer, ICE)', () => {
    let clientCandidate;
    let clientInterviewer;

    before(async () => {
      clientCandidate = createClientSocket(users.c1.token);
      clientInterviewer = createClientSocket(users.i1.token);

      await new Promise((res) => clientCandidate.on('connect', res));
      await new Promise((res) => clientInterviewer.on('connect', res));

      await new Promise((res) => {
        clientCandidate.emit('join-room', { interviewId: testInterview.id }, res);
      });
      await new Promise((res) => {
        clientInterviewer.emit('join-room', { interviewId: testInterview.id }, res);
      });
    });

    after(() => {
      clientCandidate.disconnect();
      clientInterviewer.disconnect();
    });

    it('relays SDP offer from one participant to the other', async () => {
      const mockOfferSdp = { type: 'offer', sdp: 'v=0\r\no=alice 1234 5678 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };

      const offerReceivedPromise = new Promise((resolve) => {
        clientInterviewer.on('webrtc-offer', resolve);
      });

      const ack = await new Promise((resolve) => {
        clientCandidate.emit(
          'webrtc-offer',
          { interviewId: testInterview.id, sdp: mockOfferSdp },
          resolve
        );
      });
      assert.strictEqual(ack.status, 'ok');

      const receivedOffer = await offerReceivedPromise;
      assert.strictEqual(receivedOffer.interviewId, testInterview.id);
      assert.strictEqual(receivedOffer.sdp.type, 'offer');
      assert.strictEqual(receivedOffer.senderUserId, users.c1.user.id);
      assert.strictEqual(receivedOffer.senderRole, 'interviewee');
    });

    it('relays SDP answer back to the offer sender', async () => {
      const mockAnswerSdp = { type: 'answer', sdp: 'v=0\r\no=bob 5678 1234 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' };

      const answerReceivedPromise = new Promise((resolve) => {
        clientCandidate.on('webrtc-answer', resolve);
      });

      const ack = await new Promise((resolve) => {
        clientInterviewer.emit(
          'webrtc-answer',
          { interviewId: testInterview.id, sdp: mockAnswerSdp },
          resolve
        );
      });
      assert.strictEqual(ack.status, 'ok');

      const receivedAnswer = await answerReceivedPromise;
      assert.strictEqual(receivedAnswer.interviewId, testInterview.id);
      assert.strictEqual(receivedAnswer.sdp.type, 'answer');
      assert.strictEqual(receivedAnswer.senderUserId, users.i1.user.id);
      assert.strictEqual(receivedAnswer.senderRole, 'interviewer');
    });

    it('relays ICE candidates bidirectionally', async () => {
      const mockCandidate = { candidate: 'candidate:1 1 UDP 2130706431 127.0.0.1 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 };

      const candidateReceivedPromise = new Promise((resolve) => {
        clientInterviewer.on('webrtc-ice-candidate', resolve);
      });

      const ack = await new Promise((resolve) => {
        clientCandidate.emit(
          'webrtc-ice-candidate',
          { interviewId: testInterview.id, candidate: mockCandidate },
          resolve
        );
      });
      assert.strictEqual(ack.status, 'ok');

      const receivedCandidate = await candidateReceivedPromise;
      assert.strictEqual(receivedCandidate.interviewId, testInterview.id);
      assert.strictEqual(receivedCandidate.candidate.candidate, mockCandidate.candidate);
    });

    it('rejects signaling payload without valid room membership', async () => {
      const outsideSocket = createClientSocket(users.i2.token);
      await new Promise((res) => outsideSocket.on('connect', res));

      const ack = await new Promise((resolve) => {
        outsideSocket.emit(
          'webrtc-offer',
          { interviewId: testInterview.id, sdp: { type: 'offer', sdp: 'test' } },
          resolve
        );
      });
      assert.ok(ack.error);
      outsideSocket.disconnect();
    });

    it('rejects malformed SDP payloads safely without crashing', async () => {
      const ack = await new Promise((resolve) => {
        clientCandidate.emit(
          'webrtc-offer',
          { interviewId: testInterview.id, sdp: 'not-an-object' },
          resolve
        );
      });
      assert.ok(ack.error);
      assert.match(ack.error, /Invalid SDP/i);
    });

    it('rejects malformed ICE candidate payloads safely', async () => {
      const ack = await new Promise((resolve) => {
        clientCandidate.emit(
          'webrtc-ice-candidate',
          { interviewId: testInterview.id, candidate: null },
          resolve
        );
      });
      assert.ok(ack.error);
      assert.match(ack.error, /Invalid ICE candidate/i);
    });
  });

  describe('Participant Leave & Disconnect Signaling', () => {
    it('notifies peer when a participant cleanly leaves the room', async () => {
      const socketCandidate = createClientSocket(users.c1.token);
      const socketInterviewer = createClientSocket(users.i1.token);

      await new Promise((res) => socketCandidate.on('connect', res));
      await new Promise((res) => socketInterviewer.on('connect', res));

      await new Promise((res) => {
        socketCandidate.emit('join-room', { interviewId: testInterview.id }, res);
      });
      await new Promise((res) => {
        socketInterviewer.emit('join-room', { interviewId: testInterview.id }, res);
      });

      const leaveEventPromise = new Promise((resolve) => {
        socketInterviewer.on('participant-left', resolve);
      });

      await new Promise((res) => {
        socketCandidate.emit('leave-room', { interviewId: testInterview.id }, res);
      });

      const eventData = await leaveEventPromise;
      assert.strictEqual(eventData.userId, users.c1.user.id);

      socketCandidate.disconnect();
      socketInterviewer.disconnect();
    });

    it('notifies peer when a participant disconnects unexpectedly', async () => {
      const socketCandidate = createClientSocket(users.c1.token);
      const socketInterviewer = createClientSocket(users.i1.token);

      await new Promise((res) => socketCandidate.on('connect', res));
      await new Promise((res) => socketInterviewer.on('connect', res));

      await new Promise((res) => {
        socketCandidate.emit('join-room', { interviewId: testInterview.id }, res);
      });
      await new Promise((res) => {
        socketInterviewer.emit('join-room', { interviewId: testInterview.id }, res);
      });

      const disconnectEventPromise = new Promise((resolve) => {
        socketInterviewer.on('participant-left', resolve);
      });

      socketCandidate.disconnect();

      const eventData = await disconnectEventPromise;
      assert.strictEqual(eventData.userId, users.c1.user.id);

      socketInterviewer.disconnect();
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
    await closeDatabase();
  });
});
