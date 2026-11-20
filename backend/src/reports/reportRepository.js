import { randomUUID } from 'node:crypto';
import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import { AppError } from '../middleware/errorHandler.js';
import { REVIEW_STATUSES, SUPPORTED_REVIEW_STATUSES } from './reportConstants.js';

/**
 * Finds a final report by its associated interview ID.
 *
 * @param {string} interviewId - The interview ID.
 * @returns {Promise<object|null>} The report document if found.
 */
export async function findReportByInterviewId(interviewId) {
  if (!interviewId || typeof interviewId !== 'string') return null;
  const db = requireDatabase();
  return db.collection(COLLECTIONS.FINAL_REPORTS).findOne({ interview_id: interviewId });
}

/**
 * Finds a final report by its _id or business report_id.
 *
 * @param {string} reportId - The report ID.
 * @returns {Promise<object|null>} The report document if found.
 */
export async function findReportById(reportId) {
  if (!reportId || typeof reportId !== 'string') return null;
  const db = requireDatabase();
  return db.collection(COLLECTIONS.FINAL_REPORTS).findOne({
    $or: [{ _id: reportId }, { report_id: reportId }],
  });
}

/**
 * Idempotently saves or updates a final report document in MongoDB.
 *
 * @param {object} reportDoc - The report document to upsert.
 * @returns {Promise<object>} The persisted report document.
 */
export async function upsertFinalReport(reportDoc) {
  if (!reportDoc || !reportDoc.interview_id) {
    throw new AppError('interview_id is required for final report persistence', 400);
  }

  const db = requireDatabase();
  const now = new Date();

  const filter = { interview_id: reportDoc.interview_id };
  const { _id, report_id, created_at, generated_at, ...fieldsToSet } = reportDoc;
  const update = {
    $set: {
      ...fieldsToSet,
      updated_at: now,
    },
    $setOnInsert: {
      _id: _id || randomUUID(),
      report_id: report_id || `rpt_${reportDoc.interview_id.slice(0, 8)}_${randomUUID().slice(0, 8)}`,
      created_at: created_at || now,
      generated_at: generated_at || now,
    },
  };

  const result = await db.collection(COLLECTIONS.FINAL_REPORTS).findOneAndUpdate(
    filter,
    update,
    {
      upsert: true,
      returnDocument: 'after',
    }
  );

  return result.value !== undefined ? result.value : result;
}

/**
 * Updates human review status and review notes on an existing final report.
 *
 * @param {string} interviewId - The interview ID.
 * @param {object} reviewData - Object containing review_status, review_notes, reviewed_by.
 * @returns {Promise<object>} The updated report document.
 */
export async function updateReportReview(interviewId, { review_status, review_notes = null, reviewed_by = null }) {
  if (!interviewId || typeof interviewId !== 'string') {
    throw new AppError('interviewId is required', 400);
  }

  if (!SUPPORTED_REVIEW_STATUSES.includes(review_status)) {
    throw new AppError(
      `Invalid review_status '${review_status}'. Supported: ${SUPPORTED_REVIEW_STATUSES.join(', ')}`,
      400
    );
  }

  const db = requireDatabase();
  const now = new Date();

  const result = await db.collection(COLLECTIONS.FINAL_REPORTS).findOneAndUpdate(
    { interview_id: interviewId },
    {
      $set: {
        review_status,
        review_notes: review_notes ?? null,
        reviewed_by: reviewed_by ?? null,
        reviewed_at: now,
        updated_at: now,
      },
    },
    { returnDocument: 'after' }
  );

  const doc = result.value !== undefined ? result.value : result;
  if (!doc) {
    throw new AppError(`Final report for interview '${interviewId}' not found`, 404);
  }

  return doc;
}

/**
 * Lists final reports with filtering, pagination, and sorting.
 *
 * @param {object} filter - MongoDB query filter.
 * @param {object} options - Pagination options (limit, offset, sortOrder).
 * @returns {Promise<object>} Paginated reports and total count.
 */
export async function listReports(filter = {}, options = {}) {
  const { limit = 20, offset = 0, sortOrder = -1 } = options;
  const db = requireDatabase();

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const [reports, total] = await Promise.all([
    db
      .collection(COLLECTIONS.FINAL_REPORTS)
      .find(filter)
      .sort({ generated_at: sortOrder === 1 ? 1 : -1 })
      .skip(safeOffset)
      .limit(safeLimit)
      .toArray(),
    db.collection(COLLECTIONS.FINAL_REPORTS).countDocuments(filter),
  ]);

  return {
    reports,
    pagination: {
      total,
      limit: safeLimit,
      offset: safeOffset,
      page: Math.floor(safeOffset / safeLimit) + 1,
      totalPages: Math.ceil(total / safeLimit) || 1,
      hasNext: safeOffset + reports.length < total,
      hasPrev: safeOffset > 0,
    },
  };
}
