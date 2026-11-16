import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Queries monitoring events for a given interview with filtering and pagination.
 *
 * @param {string} interviewId - The interview ID.
 * @param {object} options - Filtering and pagination options.
 * @returns {Promise<{ events: Array<object>, pagination: object }>}
 */
export async function findEventsByInterview(interviewId, options = {}) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required', 400);
  }

  const db = requireDatabase();
  const {
    status,
    eventType,
    event_type,
    severity,
    category,
    from,
    to,
    page = 1,
    limit = 20,
    sortBy = 'timestamp',
    sortOrder = 'desc',
  } = options;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query = { interview_id: interviewId };

  if (status && typeof status === 'string') {
    query.status = status.toUpperCase();
  }

  const resolvedEventType = eventType || event_type;
  if (resolvedEventType && typeof resolvedEventType === 'string') {
    query.event_type = resolvedEventType;
  }

  if (severity && typeof severity === 'string') {
    query.severity = severity.toLowerCase();
  }

  if (category && typeof category === 'string') {
    query.category = category.toUpperCase();
  }

  if (from || to) {
    query.timestamp = {};
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) {
        query.timestamp.$gte = fromDate;
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        query.timestamp.$lte = toDate;
      }
    }
    if (Object.keys(query.timestamp).length === 0) {
      delete query.timestamp;
    }
  }

  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  const sort = { [sortBy]: sortDirection };

  const [events, total] = await Promise.all([
    db
      .collection(COLLECTIONS.MONITORING_EVENTS)
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .toArray(),
    db.collection(COLLECTIONS.MONITORING_EVENTS).countDocuments(query),
  ]);

  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    events,
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
 * Retrieves a single monitoring event document by its _id or event_id.
 *
 * @param {string} eventId - MongoDB _id or business event_id string.
 * @returns {Promise<object|null>} The event document or null if not found.
 */
export async function findEventById(eventId) {
  if (!eventId || typeof eventId !== 'string') {
    throw new AppError('eventId is required', 400);
  }

  const db = requireDatabase();
  return await db.collection(COLLECTIONS.MONITORING_EVENTS).findOne({
    $or: [{ _id: eventId }, { event_id: eventId }],
  });
}

/**
 * Aggregates monitoring event counts, status breakdowns, and temporal bounds for an interview.
 *
 * @param {string} interviewId - The interview ID.
 * @returns {Promise<object>} The aggregated summary.
 */
export async function getEventsSummary(interviewId) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required', 400);
  }

  const db = requireDatabase();

  const [countsByStatus, countsBySeverity, countsByType, bounds] = await Promise.all([
    db
      .collection(COLLECTIONS.MONITORING_EVENTS)
      .aggregate([
        { $match: { interview_id: interviewId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .toArray(),

    db
      .collection(COLLECTIONS.MONITORING_EVENTS)
      .aggregate([
        { $match: { interview_id: interviewId } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ])
      .toArray(),

    db
      .collection(COLLECTIONS.MONITORING_EVENTS)
      .aggregate([
        { $match: { interview_id: interviewId } },
        { $group: { _id: '$event_type', count: { $sum: 1 } } },
      ])
      .toArray(),

    db
      .collection(COLLECTIONS.MONITORING_EVENTS)
      .aggregate([
        { $match: { interview_id: interviewId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            first_event_at: { $min: '$timestamp' },
            latest_event_at: { $max: '$timestamp' },
          },
        },
      ])
      .toArray(),
  ]);

  const summary = {
    interview_id: interviewId,
    total_events: bounds[0]?.total || 0,
    active_events: 0,
    resolved_events: 0,
    by_status: {},
    by_severity: {
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    },
    by_event_type: {},
    first_event_at: bounds[0]?.first_event_at || null,
    latest_event_at: bounds[0]?.latest_event_at || null,
  };

  for (const item of countsByStatus) {
    if (item._id) {
      summary.by_status[item._id] = item.count;
      if (item._id === 'ACTIVE') summary.active_events = item.count;
      if (item._id === 'RESOLVED') summary.resolved_events = item.count;
    }
  }

  for (const item of countsBySeverity) {
    if (item._id) {
      summary.by_severity[item._id] = item.count;
    }
  }

  for (const item of countsByType) {
    if (item._id) {
      summary.by_event_type[item._id] = item.count;
    }
  }

  return summary;
}

