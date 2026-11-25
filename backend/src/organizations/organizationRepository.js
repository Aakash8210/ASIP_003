import { randomUUID } from 'node:crypto';
import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import { AppError } from '../middleware/errorHandler.js';

export async function findOrganizationById(orgId) {
  if (!orgId) return null;
  const db = requireDatabase();
  return await db.collection(COLLECTIONS.ORGANIZATIONS).findOne({
    $or: [{ _id: orgId }, { organization_id: orgId }],
  });
}

export async function findOrganizationByUserId(userId) {
  if (!userId) return null;
  const db = requireDatabase();
  return await db.collection(COLLECTIONS.ORGANIZATIONS).findOne({
    $or: [
      { 'members.user_id': userId },
      { created_by: userId },
    ],
  });
}

export async function findOrganizationBySlug(slug) {
  if (!slug) return null;
  const db = requireDatabase();
  return await db.collection(COLLECTIONS.ORGANIZATIONS).findOne({ slug });
}

export async function createOrganization(orgDoc) {
  const db = requireDatabase();
  const now = new Date();
  const id = orgDoc._id || randomUUID();
  const orgId = orgDoc.organization_id || `org_${id.slice(0, 8)}`;

  const doc = {
    ...orgDoc,
    _id: id,
    organization_id: orgId,
    created_at: now,
    updated_at: now,
  };

  await db.collection(COLLECTIONS.ORGANIZATIONS).insertOne(doc);
  return doc;
}

export async function updateOrganization(orgId, updateFields) {
  const db = requireDatabase();
  const now = new Date();

  const result = await db.collection(COLLECTIONS.ORGANIZATIONS).findOneAndUpdate(
    { $or: [{ _id: orgId }, { organization_id: orgId }] },
    {
      $set: {
        ...updateFields,
        updated_at: now,
      },
    },
    { returnDocument: 'after' }
  );

  return result.value !== undefined ? result.value : result;
}

export async function addMemberToOrganization(orgId, member) {
  const db = requireDatabase();
  const now = new Date();

  const memberDoc = {
    ...member,
    added_at: now,
  };

  const result = await db.collection(COLLECTIONS.ORGANIZATIONS).findOneAndUpdate(
    { $or: [{ _id: orgId }, { organization_id: orgId }] },
    {
      $push: { members: memberDoc },
      $set: { updated_at: now },
    },
    { returnDocument: 'after' }
  );

  return result.value !== undefined ? result.value : result;
}

export async function updateMemberRole(orgId, userId, newRole) {
  const db = requireDatabase();
  const now = new Date();

  const result = await db.collection(COLLECTIONS.ORGANIZATIONS).findOneAndUpdate(
    {
      $or: [{ _id: orgId }, { organization_id: orgId }],
      'members.user_id': userId,
    },
    {
      $set: {
        'members.$.role': newRole,
        updated_at: now,
      },
    },
    { returnDocument: 'after' }
  );

  return result.value !== undefined ? result.value : result;
}

export async function removeMemberFromOrganization(orgId, userId) {
  const db = requireDatabase();
  const now = new Date();

  const result = await db.collection(COLLECTIONS.ORGANIZATIONS).findOneAndUpdate(
    { $or: [{ _id: orgId }, { organization_id: orgId }] },
    {
      $pull: { members: { user_id: userId } },
      $set: { updated_at: now },
    },
    { returnDocument: 'after' }
  );

  return result.value !== undefined ? result.value : result;
}

// ---------------------------------------------------------------------------
// Audit Log Persistence
// ---------------------------------------------------------------------------

export async function recordAuditLog(logSpec) {
  const db = requireDatabase();
  const now = new Date();
  const logId = `aud_${randomUUID().slice(0, 8)}`;

  const doc = {
    _id: randomUUID(),
    log_id: logId,
    organization_id: logSpec.organization_id,
    actor_id: logSpec.actor_id,
    actor_name: logSpec.actor_name || 'System Actor',
    actor_role: logSpec.actor_role || 'hr',
    action: logSpec.action,
    target_type: logSpec.target_type || 'organization',
    target_id: logSpec.target_id || null,
    details: logSpec.details || {},
    created_at: now,
  };

  await db.collection(COLLECTIONS.AUDIT_LOGS).insertOne(doc);
  return doc;
}

export async function findAuditLogsByOrg(orgId, options = {}) {
  const db = requireDatabase();
  const { action, actor_id, page = 1, limit = 20 } = options;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query = { organization_id: orgId };
  if (action) query.action = action;
  if (actor_id) query.actor_id = actor_id;

  const [logs, total] = await Promise.all([
    db
      .collection(COLLECTIONS.AUDIT_LOGS)
      .find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .toArray(),
    db.collection(COLLECTIONS.AUDIT_LOGS).countDocuments(query),
  ]);

  return {
    logs,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}
