import { Server } from 'socket.io';
import { verifyToken } from '../auth/tokens.js';
import { authorizeInterviewAccess } from '../auth/resourceAccess.js';
import { toProductRole } from '../auth/roles.js';
import { findUserById } from '../db/persistence.js';
import { validateFramePayload, sessionFrameTracker } from '../monitoring/frameValidator.js';

let ioInstance = null;

/**
 * Returns the active Socket.io server instance.
 */
export function getSocketServer() {
  return ioInstance;
}

/**
 * Socket.io Server for WebRTC Signaling and Real-Time Communication (Phase 11)
 * and Real-Time Alert Dispatching (Phase 16)
 *
 * Implements:
 * - JWT authentication on socket handshake (no unauthenticated sockets allowed)
 * - User personal notification room (user:<id>)
 * - Interview-room-specific access authorization (no cross-interview access)
 * - Isolated reviewer-only notification room (interview:<id>:reviewers) for HR/interviewers
 * - WebRTC SDP offer/answer exchange
 * - ICE candidate exchange
 * - Participant presence notifications (participant-joined, participant-left)
 * - Safe error handling and cleanup on disconnect
 */
export function initializeSocketServer(httpServer, options = {}) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:5173',
    'http://localhost:5180',
    'https://5180-iteaxs65egwgp2h9q52q5.e2b.app',
  ];

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    serveClient: false,
    pingTimeout: 20000,
    pingInterval: 25000,
    ...options,
  });

  ioInstance = io;

  // Authentication Middleware:
  // Requires valid JWT token in socket handshake auth or authorization header
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = verifyToken(token);
      if (!decoded || !decoded.sub || typeof decoded.sub !== 'string') {
        return next(new Error('Invalid token payload'));
      }

      const user = await findUserById(decoded.sub);
      if (!user) {
        return next(new Error('User not found or token expired'));
      }

      socket.user = {
        id: user._id,
        backendRole: user.role,
        role: toProductRole(user.role) || user.role,
        email: user.email ?? null,
        name: user.name ?? null,
      };

      next();
    } catch (err) {
      return next(new Error(err.message || 'Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    // Automatically join personal notification room for user-targeted alert delivery
    socket.join(`user:${socket.user.id}`);

    // Join Interview Room with backend authorization
    socket.on('join-room', async (data, callback) => {
      const interviewId = data?.interviewId;
      if (!interviewId || typeof interviewId !== 'string') {
        const errorMsg = 'interviewId is required';
        socket.emit('error', { message: errorMsg });
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      try {
        // Enforce interview authorization (candidate ownership or interviewer assignment)
        const interview = await authorizeInterviewAccess(
          socket.user.id,
          socket.user.backendRole,
          interviewId
        );

        if (!interview) {
          const errorMsg = 'Unauthorized to join interview room';
          socket.emit('error', { message: errorMsg });
          if (typeof callback === 'function') callback({ error: errorMsg });
          return;
        }

        const roomName = `interview:${interviewId}`;
        socket.join(roomName);
        socket.activeInterviewId = interviewId;

        // If participant is an interviewer or HR recruiter, join the reviewer room for monitoring alerts
        // (Candidates never join this room, preventing recruiter alert leakage)
        if (socket.user.role === 'interviewer' || socket.user.role === 'hr') {
          socket.join(`interview:${interviewId}:reviewers`);
        }

        // Fetch other active participants in this room
        const roomSockets = await io.in(roomName).fetchSockets();
        const existingParticipants = roomSockets
          .filter((s) => s.id !== socket.id)
          .map((s) => ({
            socketId: s.id,
            userId: s.user?.id,
            role: s.user?.role,
            name: s.user?.name,
          }));

        // Notify other participants in the room
        socket.to(roomName).emit('participant-joined', {
          socketId: socket.id,
          userId: socket.user.id,
          role: socket.user.role,
          name: socket.user.name,
          timestamp: new Date().toISOString(),
        });

        if (typeof callback === 'function') {
          callback({
            status: 'ok',
            room: roomName,
            participants: existingParticipants,
          });
        }
      } catch (err) {
        const errorMsg = err.message || 'Failed to join interview room';
        socket.emit('error', { message: errorMsg });
        if (typeof callback === 'function') callback({ error: errorMsg });
      }
    });

    // WebRTC Offer Exchange
    socket.on('webrtc-offer', (data, callback) => {
      const interviewId = data?.interviewId;
      const sdp = data?.sdp;
      const targetSocketId = data?.targetSocketId;

      const roomName = `interview:${interviewId}`;
      if (!socket.rooms.has(roomName) || socket.activeInterviewId !== interviewId) {
        const errorMsg = 'Socket is not in this interview room';
        socket.emit('error', { message: errorMsg });
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      if (!sdp || typeof sdp !== 'object' || !sdp.type || !sdp.sdp) {
        const errorMsg = 'Invalid SDP offer payload';
        socket.emit('error', { message: errorMsg });
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      const payload = {
        interviewId,
        sdp,
        senderSocketId: socket.id,
        senderUserId: socket.user.id,
        senderRole: socket.user.role,
        senderName: socket.user.name,
      };

      if (targetSocketId) {
        socket.to(targetSocketId).emit('webrtc-offer', payload);
      } else {
        socket.to(roomName).emit('webrtc-offer', payload);
      }

      if (typeof callback === 'function') callback({ status: 'ok' });
    });

    // WebRTC Answer Exchange
    socket.on('webrtc-answer', (data, callback) => {
      const interviewId = data?.interviewId;
      const sdp = data?.sdp;
      const targetSocketId = data?.targetSocketId;

      const roomName = `interview:${interviewId}`;
      if (!socket.rooms.has(roomName) || socket.activeInterviewId !== interviewId) {
        const errorMsg = 'Socket is not in this interview room';
        socket.emit('error', { message: errorMsg });
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      if (!sdp || typeof sdp !== 'object' || !sdp.type || !sdp.sdp) {
        const errorMsg = 'Invalid SDP answer payload';
        socket.emit('error', { message: errorMsg });
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      const payload = {
        interviewId,
        sdp,
        senderSocketId: socket.id,
        senderUserId: socket.user.id,
        senderRole: socket.user.role,
        senderName: socket.user.name,
      };

      if (targetSocketId) {
        socket.to(targetSocketId).emit('webrtc-answer', payload);
      } else {
        socket.to(roomName).emit('webrtc-answer', payload);
      }

      if (typeof callback === 'function') callback({ status: 'ok' });
    });

    // WebRTC ICE Candidate Exchange
    socket.on('webrtc-ice-candidate', (data, callback) => {
      const interviewId = data?.interviewId;
      const candidate = data?.candidate;
      const targetSocketId = data?.targetSocketId;

      const roomName = `interview:${interviewId}`;
      if (!socket.rooms.has(roomName) || socket.activeInterviewId !== interviewId) {
        const errorMsg = 'Socket is not in this interview room';
        socket.emit('error', { message: errorMsg });
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      if (!candidate || typeof candidate !== 'object') {
        const errorMsg = 'Invalid ICE candidate payload';
        socket.emit('error', { message: errorMsg });
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      const payload = {
        interviewId,
        candidate,
        senderSocketId: socket.id,
        senderUserId: socket.user.id,
        senderRole: socket.user.role,
      };

      if (targetSocketId) {
        socket.to(targetSocketId).emit('webrtc-ice-candidate', payload);
      } else {
        socket.to(roomName).emit('webrtc-ice-candidate', payload);
      }

      if (typeof callback === 'function') callback({ status: 'ok' });
    });

    // Webcam Frame Transmission (Phase 12, PRD-FR-005, SRS-FR-011)
    socket.on('webcam-frame', (data, callback) => {
      const interviewId = data?.interviewId || socket.activeInterviewId;
      const roomName = `interview:${interviewId}`;

      if (!interviewId || !socket.rooms.has(roomName) || socket.activeInterviewId !== interviewId) {
        const errorMsg = 'Socket is not in this interview room';
        socket.emit('error', { message: errorMsg });
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      if (socket.user.role !== 'interviewee') {
        const errorMsg = 'Only candidate can submit monitoring webcam frames';
        socket.emit('error', { message: errorMsg });
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      try {
        const validated = validateFramePayload(data);
        const result = sessionFrameTracker.recordReceivedFrame(interviewId, validated, socket.user.id);

        // Notify interviewer in room of active frame capture telemetry (metadata only, no raw payload)
        socket.to(roomName).emit('monitoring-frame-status', {
          interviewId,
          sequenceNumber: validated.sequenceNumber,
          timestamp: validated.timestamp,
          captureStatus: validated.captureStatus,
        });

        if (typeof callback === 'function') {
          callback(result);
        }
      } catch (err) {
        const errorMsg = err.message || 'Invalid frame payload';
        socket.emit('error', { message: errorMsg });
        if (typeof callback === 'function') callback({ error: errorMsg });
      }
    });

    // Leave Interview Room
    socket.on('leave-room', (data, callback) => {
      const interviewId = data?.interviewId || socket.activeInterviewId;
      if (interviewId) {
        const roomName = `interview:${interviewId}`;
        socket.leave(roomName);
        socket.leave(`interview:${interviewId}:reviewers`);
        socket.to(roomName).emit('participant-left', {
          socketId: socket.id,
          userId: socket.user.id,
          role: socket.user.role,
          name: socket.user.name,
          timestamp: new Date().toISOString(),
        });
      }
      socket.activeInterviewId = null;
      if (typeof callback === 'function') callback({ status: 'ok' });
    });

    // Disconnect handling
    socket.on('disconnecting', () => {
      if (socket.activeInterviewId) {
        const roomName = `interview:${socket.activeInterviewId}`;
        socket.leave(`interview:${socket.activeInterviewId}:reviewers`);
        socket.to(roomName).emit('participant-left', {
          socketId: socket.id,
          userId: socket.user.id,
          role: socket.user.role,
          name: socket.user.name,
          timestamp: new Date().toISOString(),
        });
      }
    });
  });

  return io;
}
