import { randomUUID } from 'node:crypto';
import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Validates a rating value (must be an integer between 1 and 5).
 */
function isValidRating(val) {
  return typeof val === 'number' && Number.isInteger(val) && val >= 1 && val <= 5;
}

/**
 * Saves or updates pilot feedback idempotently.
 *
 * @param {object} spec - Feedback specification.
 * @returns {Promise<{ feedback: object, isNew: boolean }>}
 */
export async function savePilotFeedback(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new AppError('Feedback specification is required', 400);
  }

  const {
    interview_id,
    user_id,
    role,
    pilot_consent_acknowledged,
    ratings = {},
    friction_points = [],
    feedback_notes = '',
    client_metadata = {},
  } = spec;

  if (!interview_id || typeof interview_id !== 'string') {
    throw new AppError('interview_id is required', 400);
  }

  if (!user_id || typeof user_id !== 'string') {
    throw new AppError('user_id is required', 400);
  }

  if (!role || !['candidate', 'interviewee', 'interviewer', 'hr'].includes(role)) {
    throw new AppError('Valid user role is required for pilot feedback', 400);
  }

  // Normalize role
  const normalizedRole = role === 'interviewee' ? 'candidate' : role;

  if (pilot_consent_acknowledged !== true) {
    throw new AppError('Explicit pilot consent acknowledgment is required to record feedback', 400);
  }

  // Validate ratings
  if (!isValidRating(ratings.overall_experience)) {
    throw new AppError('overall_experience rating must be an integer between 1 and 5', 400);
  }
  if (!isValidRating(ratings.system_clarity)) {
    throw new AppError('system_clarity rating must be an integer between 1 and 5', 400);
  }
  if (!isValidRating(ratings.technical_friction)) {
    throw new AppError('technical_friction rating must be an integer between 1 and 5', 400);
  }
  if (ratings.trust_and_fairness !== undefined && !isValidRating(ratings.trust_and_fairness)) {
    throw new AppError('trust_and_fairness rating must be an integer between 1 and 5', 400);
  }

  if (!Array.isArray(friction_points)) {
    throw new AppError('friction_points must be an array of strings', 400);
  }

  const cleanedNotes = typeof feedback_notes === 'string' ? feedback_notes.trim().slice(0, 2000) : '';

  const db = requireDatabase();
  const now = new Date();
  const idempotencyKey = `${interview_id}:${user_id}:pilot_feedback`;

  const feedbackDoc = {
    interview_id,
    user_id,
    role: normalizedRole,
    pilot_consent_acknowledged: true,
    ratings: {
      overall_experience: ratings.overall_experience,
      system_clarity: ratings.system_clarity,
      technical_friction: ratings.technical_friction,
      ...(ratings.trust_and_fairness ? { trust_and_fairness: ratings.trust_and_fairness } : {}),
    },
    friction_points: friction_points.map((p) => String(p).trim().slice(0, 50)).filter(Boolean),
    feedback_notes: cleanedNotes,
    client_metadata: typeof client_metadata === 'object' && client_metadata !== null ? client_metadata : {},
    updated_at: now,
  };

  const result = await db.collection(COLLECTIONS.PILOT_FEEDBACK).findOneAndUpdate(
    { idempotency_key: idempotencyKey },
    {
      $set: feedbackDoc,
      $setOnInsert: {
        _id: randomUUID(),
        feedback_id: `pfb_${interview_id}_${randomUUID().slice(0, 8)}`,
        idempotency_key: idempotencyKey,
        created_at: now,
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
      includeResultMetadata: true,
    }
  );

  const doc = result.value !== undefined ? result.value : result;
  const wasExisting = Boolean(result.lastErrorObject?.updatedExisting);

  return {
    feedback: doc,
    isNew: !wasExisting,
  };
}

/**
 * Finds feedback records for an interview session.
 *
 * @param {string} interviewId - The interview ID.
 * @param {object} options - Optional filters (role, userId).
 * @returns {Promise<Array<object>>}
 */
export async function findFeedbackByInterview(interviewId, options = {}) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required', 400);
  }

  const db = requireDatabase();
  const query = { interview_id: interviewId };

  if (options.role) {
    const norm = options.role === 'interviewee' ? 'candidate' : options.role;
    query.role = norm;
  }

  if (options.userId) {
    query.user_id = options.userId;
  }

  return await db
    .collection(COLLECTIONS.PILOT_FEEDBACK)
    .find(query)
    .sort({ created_at: -1 })
    .toArray();
}

/**
 * Retrieves aggregated pilot feedback statistics across all submissions.
 *
 * @returns {Promise<object>} Summary metrics.
 */
export async function getPilotFeedbackSummary() {
  const db = requireDatabase();
  const allFeedback = await db
    .collection(COLLECTIONS.PILOT_FEEDBACK)
    .find({})
    .toArray();

  const total = allFeedback.length;
  if (total === 0) {
    return {
      total_submissions: 0,
      by_role: { candidate: 0, interviewer: 0, hr: 0 },
      average_ratings: {
        overall_experience: null,
        system_clarity: null,
        technical_friction: null,
        trust_and_fairness: null,
      },
      friction_points_frequency: {},
      recent_feedback_count: 0,
    };
  }

  const byRole = { candidate: 0, interviewer: 0, hr: 0 };
  let sumOverall = 0;
  let sumClarity = 0;
  let sumFriction = 0;
  let sumTrust = 0;
  let trustCount = 0;
  const frictionFreq = {};

  for (const item of allFeedback) {
    const r = item.role || 'candidate';
    byRole[r] = (byRole[r] || 0) + 1;

    if (item.ratings) {
      if (typeof item.ratings.overall_experience === 'number') sumOverall += item.ratings.overall_experience;
      if (typeof item.ratings.system_clarity === 'number') sumClarity += item.ratings.system_clarity;
      if (typeof item.ratings.technical_friction === 'number') sumFriction += item.ratings.technical_friction;
      if (typeof item.ratings.trust_and_fairness === 'number') {
        sumTrust += item.ratings.trust_and_fairness;
        trustCount++;
      }
    }

    if (Array.isArray(item.friction_points)) {
      for (const tag of item.friction_points) {
        frictionFreq[tag] = (frictionFreq[tag] || 0) + 1;
      }
    }
  }

  return {
    total_submissions: total,
    by_role: byRole,
    average_ratings: {
      overall_experience: round(sumOverall / total, 2),
      system_clarity: round(sumClarity / total, 2),
      technical_friction: round(sumFriction / total, 2),
      trust_and_fairness: trustCount > 0 ? round(sumTrust / trustCount, 2) : null,
    },
    friction_points_frequency: frictionFreq,
    recent_feedback_count: total,
  };
}

function round(val, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

/**
 * Lists all pilot feedback with pagination and role filter.
 *
 * @param {object} options - Query options.
 * @returns {Promise<object>}
 */
export async function listAllPilotFeedback({ role, page = 1, limit = 20 } = {}) {
  const db = requireDatabase();
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (role) {
    query.role = role === 'interviewee' ? 'candidate' : role;
  }

  const [items, total] = await Promise.all([
    db.collection(COLLECTIONS.PILOT_FEEDBACK).find(query).sort({ created_at: -1 }).skip(skip).limit(limitNum).toArray(),
    db.collection(COLLECTIONS.PILOT_FEEDBACK).countDocuments(query),
  ]);

  return {
    feedback: items,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}
