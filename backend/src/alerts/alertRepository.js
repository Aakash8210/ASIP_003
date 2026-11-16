import { randomUUID } from 'node:crypto';
import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import { AppError } from '../middleware/errorHandler.js';
import { ALERT_STATUSES } from './alertConstants.js';

/**
 * Phase 16: Alert Repository
 * Handles atomic persistence, idempotency, querying, and lifecycle updates in MongoDB.
 */

/**
 * Creates or updates an alert atomically using its unique idempotency key.
 *
 * @param {object} alertSpec - Normalized alert specification.
 * @returns {Promise<{ alert: object, isNew: boolean }>}
 */
export async function createOrUpdateAlert(alertSpec) {
  if (!alertSpec || !alertSpec.idempotency_key) {
    throw new AppError('Alert specification must include an idempotency_key', 400);
  }

  const db = requireDatabase();
  const now = new Date();

  const filter = { idempotency_key: alertSpec.idempotency_key };
  const update = {
    $set: {
      interview_id: alertSpec.interview_id,
      candidate_id: alertSpec.candidate_id || null,
      event_id: alertSpec.event_id || null,
      event_type: alertSpec.event_type,
      alert_type: alertSpec.alert_type || 'MONITORING_EVENT',
      policy_id: alertSpec.policy_id,
      priority: alertSpec.priority,
      severity: alertSpec.severity || alertSpec.priority.toLowerCase(),
      title: alertSpec.title,
      message: alertSpec.message,
      source: 'MONITORING_EVENT_ENGINE',
      recipient_ids: alertSpec.recipient_ids || [],
      recipient_user_id: alertSpec.recipient_ids?.[0] || null,
      metrics: alertSpec.metrics || {},
      schema_version: '1.0',
      updated_at: now,
    },
    $setOnInsert: {
      _id: randomUUID(),
      alert_id: `alt_${alertSpec.interview_id}_${randomUUID().slice(0, 8)}`,
      status: ALERT_STATUSES.NEW,
      created_at: now,
      acknowledged_at: null,
      acknowledged_by: null,
      dismissed_at: null,
      dismissed_by: null,
      escalation_level: 0,
      last_escalated_at: null,
    },
  };

  const result = await db.collection(COLLECTIONS.ALERTS).findOneAndUpdate(filter, update, {
    upsert: true,
    returnDocument: 'after',
    includeResultMetadata: true,
  });

  const doc = result.value;
  const isNew = !result.lastErrorObject?.updatedExisting;

  return { alert: doc, isNew };
}

/**
 * Queries alerts for an interview with filtering and pagination.
 */
export async function findAlertsByInterview(interviewId, options = {}) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required', 400);
  }

  const db = requireDatabase();
  const {
    status,
    priority,
    alert_type,
    from,
    to,
    page = 1,
    limit = 20,
    sortBy = 'created_at',
    sortOrder = 'desc',
  } = options;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query = { interview_id: interviewId };

  if (status && typeof status === 'string') {
    query.status = status.toUpperCase();
  }

  if (priority && typeof priority === 'string') {
    query.priority = priority.toUpperCase();
  }

  if (alert_type && typeof alert_type === 'string') {
    query.alert_type = alert_type;
  }

  if (from || to) {
    query.created_at = {};
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) query.created_at.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) query.created_at.$lte = toDate;
    }
    if (Object.keys(query.created_at).length === 0) delete query.created_at;
  }

  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  const sort = { [sortBy]: sortDirection };

  const [alerts, total] = await Promise.all([
    db.collection(COLLECTIONS.ALERTS).find(query).sort(sort).skip(skip).limit(limitNum).toArray(),
    db.collection(COLLECTIONS.ALERTS).countDocuments(query),
  ]);

  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    alerts,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  };
}

/**
 * Retrieves an alert document by _id or alert_id.
 */
export async function findAlertById(alertId) {
  if (!alertId || typeof alertId !== 'string') {
    throw new AppError('alertId is required', 400);
  }

  const db = requireDatabase();
  return await db.collection(COLLECTIONS.ALERTS).findOne({
    $or: [{ _id: alertId }, { alert_id: alertId }],
  });
}

/**
 * Aggregates alert status and priority counts for an interview.
 */
export async function getAlertsSummary(interviewId) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required', 400);
  }

  const db = requireDatabase();

  const [countsByStatus, countsByPriority, countsByType, bounds] = await Promise.all([
    db
      .collection(COLLECTIONS.ALERTS)
      .aggregate([
        { $match: { interview_id: interviewId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .toArray(),

    db
      .collection(COLLECTIONS.ALERTS)
      .aggregate([
        { $match: { interview_id: interviewId } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ])
      .toArray(),

    db
      .collection(COLLECTIONS.ALERTS)
      .aggregate([
        { $match: { interview_id: interviewId } },
        { $group: { _id: '$event_type', count: { $sum: 1 } } },
      ])
      .toArray(),

    db
      .collection(COLLECTIONS.ALERTS)
      .aggregate([
        { $match: { interview_id: interviewId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            first_alert_at: { $min: '$created_at' },
            latest_alert_at: { $max: '$created_at' },
          },
        },
      ])
      .toArray(),
  ]);

  const summary = {
    interview_id: interviewId,
    total_alerts: bounds[0]?.total || 0,
    new_alerts: 0,
    acknowledged_alerts: 0,
    dismissed_alerts: 0,
    by_status: {},
    by_priority: {
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      INFO: 0,
    },
    by_event_type: {},
    first_alert_at: bounds[0]?.first_alert_at || null,
    latest_alert_at: bounds[0]?.latest_alert_at || null,
  };

  for (const item of countsByStatus) {
    if (item._id) {
      summary.by_status[item._id] = item.count;
      if (item._id === ALERT_STATUSES.NEW) summary.new_alerts = item.count;
      if (item._id === ALERT_STATUSES.ACKNOWLEDGED) summary.acknowledged_alerts = item.count;
      if (item._id === ALERT_STATUSES.DISMISSED) summary.dismissed_alerts = item.count;
    }
  }

  for (const item of countsByPriority) {
    if (item._id && summary.by_priority[item._id] !== undefined) {
      summary.by_priority[item._id] = item.count;
    }
  }

  for (const item of countsByType) {
    if (item._id) {
      summary.by_event_type[item._id] = item.count;
    }
  }

  return summary;
}

/**
 * Atomically transitions an alert from NEW to ACKNOWLEDGED.
 */
export async function acknowledgeAlert(alertId, actorUserId) {
  if (!alertId || typeof alertId !== 'string') {
    throw new AppError('alertId is required', 400);
  }
  if (!actorUserId || typeof actorUserId !== 'string') {
    throw new AppError('actorUserId is required', 400);
  }

  const db = requireDatabase();
  const now = new Date();

  // Find the alert first to validate current status
  const existing = await findAlertById(alertId);
  if (!existing) {
    throw new AppError(`Alert '${alertId}' not found`, 404);
  }

  if (existing.status === ALERT_STATUSES.DISMISSED) {
    throw new AppError('Cannot acknowledge an alert that has already been dismissed', 409);
  }

  if (existing.status === ALERT_STATUSES.ACKNOWLEDGED) {
    // Already acknowledged, return existing document idempotently
    return existing;
  }

  const result = await db.collection(COLLECTIONS.ALERTS).findOneAndUpdate(
    {
      _id: existing._id,
      status: ALERT_STATUSES.NEW,
    },
    {
      $set: {
        status: ALERT_STATUSES.ACKNOWLEDGED,
        acknowledged_at: now,
        acknowledged_by: actorUserId,
        updated_at: now,
      },
    },
    {
      returnDocument: 'after',
    }
  );

  return result.value !== undefined ? result.value : result;
}

/**
 * Atomically transitions an alert from NEW or ACKNOWLEDGED to DISMISSED.
 */
export async function dismissAlert(alertId, actorUserId) {
  if (!alertId || typeof alertId !== 'string') {
    throw new AppError('alertId is required', 400);
  }
  if (!actorUserId || typeof actorUserId !== 'string') {
    throw new AppError('actorUserId is required', 400);
  }

  const db = requireDatabase();
  const now = new Date();

  const existing = await findAlertById(alertId);
  if (!existing) {
    throw new AppError(`Alert '${alertId}' not found`, 404);
  }

  if (existing.status === ALERT_STATUSES.DISMISSED) {
    // Already dismissed, return existing document idempotently
    return existing;
  }

  const result = await db.collection(COLLECTIONS.ALERTS).findOneAndUpdate(
    {
      _id: existing._id,
      status: { $in: [ALERT_STATUSES.NEW, ALERT_STATUSES.ACKNOWLEDGED] },
    },
    {
      $set: {
        status: ALERT_STATUSES.DISMISSED,
        dismissed_at: now,
        dismissed_by: actorUserId,
        updated_at: now,
      },
    },
    {
      returnDocument: 'after',
    }
  );

  return result.value !== undefined ? result.value : result;
}

/**
 * Retrieves unacknowledged NEW alerts eligible for escalation.
 */
export async function findUnacknowledgedAlertsForEscalation(interviewId, olderThanDate, maxLevel = 2) {
  const db = requireDatabase();
  const query = {
    interview_id: interviewId,
    status: ALERT_STATUSES.NEW,
    escalation_level: { $lt: maxLevel },
  };

  if (olderThanDate) {
    query.$or = [
      { last_escalated_at: { $lte: olderThanDate } },
      { last_escalated_at: null, created_at: { $lte: olderThanDate } },
    ];
  }

  return await db.collection(COLLECTIONS.ALERTS).find(query).toArray();
}

/**
 * Increments an alert's escalation level atomically.
 */
export async function incrementAlertEscalation(alertDocId) {
  const db = requireDatabase();
  const now = new Date();

  const result = await db.collection(COLLECTIONS.ALERTS).findOneAndUpdate(
    {
      _id: alertDocId,
      status: ALERT_STATUSES.NEW,
    },
    {
      $inc: { escalation_level: 1 },
      $set: {
        last_escalated_at: now,
        updated_at: now,
      },
    },
    {
      returnDocument: 'after',
    }
  );

  return result.value !== undefined ? result.value : result;
}

