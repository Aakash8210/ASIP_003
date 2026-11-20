import { randomUUID } from 'node:crypto';
import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import {
  EVIDENCE_TYPES,
  SUPPORTED_EVIDENCE_TYPES,
  RETENTION_CLASSES,
  SUPPORTED_RETENTION_CLASSES,
  RETENTION_PERIODS_MS,
  EVIDENCE_MIME_TYPES,
} from './evidenceConstants.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Normalizes and validates an evidence document specification.
 */
export function normalizeEvidenceSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new AppError('Evidence specification must be an object', 400);
  }

  const {
    interview_id,
    event_id = null,
    evidence_type = EVIDENCE_TYPES.OBSERVATION_CONTEXT,
    storage_reference = null,
    start_time = null,
    end_time = null,
    content_hash = null,
    size_bytes = null,
    mime_type = EVIDENCE_MIME_TYPES.JSON,
    metadata = {},
    retention_class = RETENTION_CLASSES.STANDARD,
    expires_at = null,
    idempotency_key = null,
  } = spec;

  if (!interview_id || typeof interview_id !== 'string') {
    throw new AppError('interview_id is required for evidence', 400);
  }

  if (!SUPPORTED_EVIDENCE_TYPES.includes(evidence_type)) {
    throw new AppError(
      `Invalid evidence_type '${evidence_type}'. Supported: ${SUPPORTED_EVIDENCE_TYPES.join(', ')}`,
      400
    );
  }

  if (retention_class && !SUPPORTED_RETENTION_CLASSES.includes(retention_class)) {
    throw new AppError(
      `Invalid retention_class '${retention_class}'. Supported: ${SUPPORTED_RETENTION_CLASSES.join(', ')}`,
      400
    );
  }

  const now = new Date();
  let calculatedExpiresAt = expires_at ? new Date(expires_at) : null;

  if (!calculatedExpiresAt && retention_class) {
    const periodMs = RETENTION_PERIODS_MS[retention_class];
    if (periodMs !== null && periodMs !== undefined) {
      calculatedExpiresAt = new Date(now.getTime() + periodMs);
    }
  }

  const generatedIdempotencyKey =
    idempotency_key ||
    `evd_${interview_id}_${event_id || 'general'}_${evidence_type}_${(start_time ? new Date(start_time).getTime() : now.getTime())}`;

  const generatedEvidenceId =
    spec.evidence_id ||
    `evd_${interview_id.slice(0, 8)}_${randomUUID().slice(0, 8)}`;

  const calculatedSize =
    typeof size_bytes === 'number' && Number.isFinite(size_bytes)
      ? size_bytes
      : Buffer.byteLength(JSON.stringify(metadata || {}), 'utf8');

  return {
    evidence_id: generatedEvidenceId,
    interview_id,
    event_id: event_id || null,
    evidence_type,
    storage_reference: storage_reference || null,
    start_time: start_time ? new Date(start_time) : null,
    end_time: end_time ? new Date(end_time) : null,
    content_hash: content_hash || null,
    size_bytes: calculatedSize,
    mime_type: mime_type || EVIDENCE_MIME_TYPES.JSON,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    retention_class: retention_class || RETENTION_CLASSES.STANDARD,
    captured_at: start_time ? new Date(start_time) : now,
    expires_at: calculatedExpiresAt,
    idempotency_key: generatedIdempotencyKey,
  };
}

/**
 * Idempotently creates or updates an evidence record in MongoDB.
 */
export async function createOrUpdateEvidence(rawSpec) {
  const spec = normalizeEvidenceSpec(rawSpec);
  const db = requireDatabase();
  const now = new Date();

  const filter = { idempotency_key: spec.idempotency_key };
  const update = {
    $set: {
      interview_id: spec.interview_id,
      event_id: spec.event_id,
      evidence_type: spec.evidence_type,
      storage_reference: spec.storage_reference,
      start_time: spec.start_time,
      end_time: spec.end_time,
      content_hash: spec.content_hash,
      size_bytes: spec.size_bytes,
      mime_type: spec.mime_type,
      metadata: spec.metadata,
      retention_class: spec.retention_class,
      captured_at: spec.captured_at,
      expires_at: spec.expires_at,
      updated_at: now,
    },
    $setOnInsert: {
      _id: randomUUID(),
      evidence_id: spec.evidence_id,
      created_at: now,
    },
  };

  const result = await db.collection(COLLECTIONS.EVIDENCE).findOneAndUpdate(
    filter,
    update,
    {
      upsert: true,
      returnDocument: 'after',
      includeResultMetadata: true,
    }
  );

  return result.value;
}

/**
 * Finds evidence records for an interview with filtering and pagination.
 */
export async function findEvidenceByInterview(interviewId, options = {}) {
  const {
    eventId = null,
    evidenceType = null,
    limit = 50,
    offset = 0,
    sortOrder = -1,
  } = options;

  const db = requireDatabase();
  const query = { interview_id: interviewId };

  if (eventId) {
    query.$or = [{ event_id: eventId }, { 'metadata.event_id': eventId }];
  }

  if (evidenceType && SUPPORTED_EVIDENCE_TYPES.includes(evidenceType)) {
    query.evidence_type = evidenceType;
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const [items, total] = await Promise.all([
    db
      .collection(COLLECTIONS.EVIDENCE)
      .find(query)
      .sort({ created_at: sortOrder === 1 ? 1 : -1 })
      .skip(safeOffset)
      .limit(safeLimit)
      .toArray(),
    db.collection(COLLECTIONS.EVIDENCE).countDocuments(query),
  ]);

  return {
    items,
    pagination: {
      total,
      limit: safeLimit,
      offset: safeOffset,
      page: Math.floor(safeOffset / safeLimit) + 1,
      hasMore: safeOffset + items.length < total,
    },
  };
}

/**
 * Retrieves a single evidence record by _id or evidence_id.
 */
export async function findEvidenceById(evidenceId) {
  if (!evidenceId || typeof evidenceId !== 'string') return null;

  const db = requireDatabase();
  return db.collection(COLLECTIONS.EVIDENCE).findOne({
    $or: [{ _id: evidenceId }, { evidence_id: evidenceId }],
  });
}

/**
 * Retrieves all evidence records linked to a specific event.
 */
export async function findEvidenceByEventId(eventId) {
  if (!eventId || typeof eventId !== 'string') return [];

  const db = requireDatabase();
  return db
    .collection(COLLECTIONS.EVIDENCE)
    .find({
      $or: [{ event_id: eventId }, { 'metadata.event_id': eventId }],
    })
    .sort({ created_at: -1 })
    .toArray();
}

/**
 * Returns aggregated summary metrics of evidence for an interview session.
 */
export async function getEvidenceSummary(interviewId) {
  const db = requireDatabase();

  const pipeline = [
    { $match: { interview_id: interviewId } },
    {
      $group: {
        _id: '$evidence_type',
        count: { $sum: 1 },
        total_size_bytes: { $sum: { $ifNull: ['$size_bytes', 0] } },
        earliest: { $min: '$created_at' },
        latest: { $max: '$created_at' },
      },
    },
  ];

  const results = await db.collection(COLLECTIONS.EVIDENCE).aggregate(pipeline).toArray();

  const byType = {};
  let totalCount = 0;
  let totalBytes = 0;
  let earliestDate = null;
  let latestDate = null;

  for (const item of results) {
    byType[item._id] = item.count;
    totalCount += item.count;
    totalBytes += item.total_size_bytes;

    if (item.earliest && (!earliestDate || item.earliest < earliestDate)) {
      earliestDate = item.earliest;
    }
    if (item.latest && (!latestDate || item.latest > latestDate)) {
      latestDate = item.latest;
    }
  }

  return {
    interview_id: interviewId,
    total_evidence: totalCount,
    total_evidence_count: totalCount,
    total_size_bytes: totalBytes,
    by_type: byType,
    earliest_evidence_at: earliestDate,
    latest_evidence_at: latestDate,
  };
}

/**
 * Purges expired evidence documents according to retention policy (PRD-NFR-004).
 */
export async function deleteExpiredEvidence() {
  const db = requireDatabase();
  const now = new Date();

  const result = await db.collection(COLLECTIONS.EVIDENCE).deleteMany({
    expires_at: { $lte: now, $ne: null },
  });

  return {
    deletedCount: result.deletedCount,
    deleted_count: result.deletedCount,
    timestamp: now,
  };
}
