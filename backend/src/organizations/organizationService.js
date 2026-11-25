import crypto, { randomUUID } from 'node:crypto';
import { requireDatabase } from '../config/database.js';
import { COLLECTIONS } from '../db/collections.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  PLAN_TIERS,
  MEMBER_ROLES,
  PLAN_ENTITLEMENTS,
  AUDIT_ACTIONS,
} from './organizationConstants.js';
import {
  findOrganizationById,
  findOrganizationByUserId,
  findOrganizationBySlug,
  createOrganization,
  updateOrganization,
  addMemberToOrganization,
  updateMemberRole,
  removeMemberFromOrganization,
  recordAuditLog,
  findAuditLogsByOrg,
} from './organizationRepository.js';

/**
 * Ensures an active organization exists for the given user, creating a default one if necessary.
 */
export async function getOrCreateUserOrganization(user) {
  if (!user || !user.id) {
    throw new AppError('Valid user is required to resolve organization', 400);
  }

  let org = await findOrganizationByUserId(user.id);
  if (org) {
    return org;
  }

  // Create default organization
  const db = requireDatabase();
  let companyName = `${user.name || 'Enterprise'}'s Workspace`;
  const recruiter = await db.collection(COLLECTIONS.RECRUITERS).findOne({ user_id: user.id });
  if (recruiter?.company) {
    companyName = recruiter.company;
  }

  const baseSlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'org';
  const slug = `${baseSlug}-${randomUUID().slice(0, 4)}`;

  const defaultTier = PLAN_TIERS.GROWTH;
  const entitlements = PLAN_ENTITLEMENTS[defaultTier];

  const orgDoc = {
    name: companyName,
    slug,
    plan_tier: defaultTier,
    entitlements,
    governance: {
      evidence_retention_days: 30,
      events_retention_days: 90,
      auto_purge_enabled: false,
      anonymize_candidate_after_days: 180,
    },
    webhook_config: {
      url: null,
      secret: crypto.randomBytes(24).toString('hex'),
      events: ['interview.completed', 'alert.triggered', 'report.reviewed'],
      enabled: false,
    },
    members: [
      {
        user_id: user.id,
        role: MEMBER_ROLES.HR_ADMIN,
        name: user.name || 'Admin User',
        email: user.email || 'admin@company.com',
        added_at: new Date(),
      },
    ],
    created_by: user.id,
  };

  org = await createOrganization(orgDoc);

  await recordAuditLog({
    organization_id: org.organization_id,
    actor_id: user.id,
    actor_name: user.name,
    actor_role: user.role,
    action: AUDIT_ACTIONS.ORG_CREATED,
    target_type: 'organization',
    target_id: org.organization_id,
    details: { name: org.name, plan_tier: defaultTier },
  });

  return org;
}

/**
 * Updates organization profile and plan tier.
 */
export async function updateOrgProfile(orgId, updateSpec, actor) {
  const org = await findOrganizationById(orgId);
  if (!org) {
    throw new AppError(`Organization '${orgId}' not found`, 404);
  }

  const updates = {};
  if (updateSpec.name && typeof updateSpec.name === 'string') {
    updates.name = updateSpec.name.trim();
  }

  if (updateSpec.plan_tier && PLAN_TIERS[updateSpec.plan_tier]) {
    updates.plan_tier = updateSpec.plan_tier;
    updates.entitlements = PLAN_ENTITLEMENTS[updateSpec.plan_tier];
  }

  const updatedOrg = await updateOrganization(orgId, updates);

  await recordAuditLog({
    organization_id: org.organization_id,
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    action: updateSpec.plan_tier ? AUDIT_ACTIONS.PLAN_TIER_CHANGED : AUDIT_ACTIONS.ORG_UPDATED,
    target_type: 'organization',
    target_id: org.organization_id,
    details: updates,
  });

  return updatedOrg;
}

/**
 * Invites / adds a member to the organization roster.
 */
export async function inviteMember(orgId, memberData, actor) {
  const org = await findOrganizationById(orgId);
  if (!org) {
    throw new AppError(`Organization '${orgId}' not found`, 404);
  }

  const maxMembers = org.entitlements?.max_members || 25;
  if (org.members && org.members.length >= maxMembers) {
    throw new AppError(`Organization has reached its plan limit of ${maxMembers} members. Upgrade plan to add more.`, 409);
  }

  const { email, name, role = MEMBER_ROLES.INTERVIEWER } = memberData;
  if (!email || !name) {
    throw new AppError('Member email and name are required', 400);
  }

  const normalizedRole = MEMBER_ROLES[role] || MEMBER_ROLES.INTERVIEWER;

  // Check if member is already in the roster
  const existingMember = org.members?.find((m) => m.email.toLowerCase() === email.toLowerCase());
  if (existingMember) {
    throw new AppError(`User with email '${email}' is already a member of this organization`, 409);
  }

  const db = requireDatabase();
  const existingUser = await db.collection(COLLECTIONS.USERS).findOne({ email: email.toLowerCase() });
  const userId = existingUser ? existingUser._id : randomUUID();

  const newMember = {
    user_id: userId,
    email: email.toLowerCase(),
    name,
    role: normalizedRole,
  };

  const updatedOrg = await addMemberToOrganization(orgId, newMember);

  await recordAuditLog({
    organization_id: org.organization_id,
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    action: AUDIT_ACTIONS.MEMBER_INVITED,
    target_type: 'member',
    target_id: userId,
    details: { email, name, role: normalizedRole },
  });

  return {
    organization: updatedOrg,
    member: newMember,
  };
}

/**
 * Updates a member's role within the organization.
 */
export async function changeMemberRole(orgId, targetUserId, newRole, actor) {
  const org = await findOrganizationById(orgId);
  if (!org) {
    throw new AppError(`Organization '${orgId}' not found`, 404);
  }

  if (!MEMBER_ROLES[newRole]) {
    throw new AppError(`Invalid member role '${newRole}'. Allowed: ${Object.values(MEMBER_ROLES).join(', ')}`, 400);
  }

  const member = org.members?.find((m) => m.user_id === targetUserId);
  if (!member) {
    throw new AppError(`Member '${targetUserId}' not found in organization`, 404);
  }

  const updatedOrg = await updateMemberRole(orgId, targetUserId, newRole);

  await recordAuditLog({
    organization_id: org.organization_id,
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    action: AUDIT_ACTIONS.MEMBER_ROLE_UPDATED,
    target_type: 'member',
    target_id: targetUserId,
    details: { previousRole: member.role, newRole },
  });

  return updatedOrg;
}

/**
 * Removes a member from the organization.
 */
export async function removeMember(orgId, targetUserId, actor) {
  const org = await findOrganizationById(orgId);
  if (!org) {
    throw new AppError(`Organization '${orgId}' not found`, 404);
  }

  const member = org.members?.find((m) => m.user_id === targetUserId);
  if (!member) {
    throw new AppError(`Member '${targetUserId}' not found in organization`, 404);
  }

  // Prevent removing the sole HR_ADMIN
  const adminCount = org.members.filter((m) => m.role === MEMBER_ROLES.HR_ADMIN).length;
  if (member.role === MEMBER_ROLES.HR_ADMIN && adminCount <= 1) {
    throw new AppError('Cannot remove the sole HR Admin from the organization', 400);
  }

  const updatedOrg = await removeMemberFromOrganization(orgId, targetUserId);

  await recordAuditLog({
    organization_id: org.organization_id,
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    action: AUDIT_ACTIONS.MEMBER_REMOVED,
    target_type: 'member',
    target_id: targetUserId,
    details: { email: member.email, name: member.name },
  });

  return updatedOrg;
}

/**
 * Updates governance & webhook configurations.
 */
export async function updateGovernance(orgId, governanceSpec, actor) {
  const org = await findOrganizationById(orgId);
  if (!org) {
    throw new AppError(`Organization '${orgId}' not found`, 404);
  }

  const updates = {};
  if (governanceSpec.governance) {
    const gov = governanceSpec.governance;
    const maxAllowedRetention = org.entitlements?.max_retention_days || 90;

    const evidenceRetention = gov.evidence_retention_days !== undefined
      ? Math.min(maxAllowedRetention, Math.max(1, parseInt(gov.evidence_retention_days, 10)))
      : org.governance.evidence_retention_days;

    const eventsRetention = gov.events_retention_days !== undefined
      ? Math.min(maxAllowedRetention, Math.max(1, parseInt(gov.events_retention_days, 10)))
      : org.governance.events_retention_days;

    updates.governance = {
      ...org.governance,
      evidence_retention_days: evidenceRetention,
      events_retention_days: eventsRetention,
      auto_purge_enabled: gov.auto_purge_enabled !== undefined ? Boolean(gov.auto_purge_enabled) : org.governance.auto_purge_enabled,
      anonymize_candidate_after_days: gov.anonymize_candidate_after_days || org.governance.anonymize_candidate_after_days,
    };
  }

  if (governanceSpec.webhook_config) {
    const wh = governanceSpec.webhook_config;
    updates.webhook_config = {
      ...org.webhook_config,
      url: wh.url !== undefined ? wh.url : org.webhook_config.url,
      events: Array.isArray(wh.events) ? wh.events : org.webhook_config.events,
      enabled: wh.enabled !== undefined ? Boolean(wh.enabled) : org.webhook_config.enabled,
    };
  }

  const updatedOrg = await updateOrganization(orgId, updates);

  await recordAuditLog({
    organization_id: org.organization_id,
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    action: updates.webhook_config ? AUDIT_ACTIONS.WEBHOOK_CONFIGURED : AUDIT_ACTIONS.GOVERNANCE_UPDATED,
    target_type: 'governance',
    target_id: org.organization_id,
    details: updates,
  });

  return updatedOrg;
}

/**
 * Purges expired evidence and historical monitoring events according to the organization's retention policy.
 */
export async function purgeExpiredData(orgId, actor) {
  const org = await findOrganizationById(orgId);
  if (!org) {
    throw new AppError(`Organization '${orgId}' not found`, 404);
  }

  const db = requireDatabase();
  const now = new Date();
  const evidenceDays = org.governance?.evidence_retention_days || 30;
  const eventsDays = org.governance?.events_retention_days || 90;

  const evidenceCutoff = new Date(now.getTime() - evidenceDays * 24 * 3600 * 1000);
  const eventsCutoff = new Date(now.getTime() - eventsDays * 24 * 3600 * 1000);

  // 1. Purge expired evidence (where expires_at < now OR captured_at < evidenceCutoff)
  const evidenceFilter = {
    $or: [
      { expires_at: { $lt: now } },
      { captured_at: { $lt: evidenceCutoff } },
    ],
  };

  const evidenceResult = await db.collection(COLLECTIONS.EVIDENCE).deleteMany(evidenceFilter);

  // 2. Purge monitoring events older than eventsCutoff
  const eventsFilter = {
    created_at: { $lt: eventsCutoff },
  };

  const eventsResult = await db.collection(COLLECTIONS.MONITORING_EVENTS).deleteMany(eventsFilter);

  const purgeSummary = {
    purged_evidence_count: evidenceResult.deletedCount || 0,
    purged_events_count: eventsResult.deletedCount || 0,
    evidence_retention_days: evidenceDays,
    events_retention_days: eventsDays,
    purged_at: now.toISOString(),
  };

  await recordAuditLog({
    organization_id: org.organization_id,
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    action: AUDIT_ACTIONS.RETENTION_PURGE_TRIGGERED,
    target_type: 'evidence',
    target_id: org.organization_id,
    details: purgeSummary,
  });

  return purgeSummary;
}

/**
 * Computes an HMAC-SHA256 signature for a webhook payload string.
 */
export function signWebhookPayload(secret, payloadString) {
  return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
}

/**
 * Emits a test webhook payload and computes signature for integration verification.
 */
export async function testWebhook(orgId, actor) {
  const org = await findOrganizationById(orgId);
  if (!org) {
    throw new AppError(`Organization '${orgId}' not found`, 404);
  }

  const secret = org.webhook_config?.secret || 'default-secret';
  const testPayload = {
    event: 'interview.test_ping',
    timestamp: new Date().toISOString(),
    organization_id: org.organization_id,
    organization_name: org.name,
    triggered_by: actor.name,
  };

  const payloadString = JSON.stringify(testPayload);
  const signature = signWebhookPayload(secret, payloadString);

  await recordAuditLog({
    organization_id: org.organization_id,
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    action: AUDIT_ACTIONS.WEBHOOK_TEST_EMITTED,
    target_type: 'webhook',
    target_id: org.organization_id,
    details: { event: 'interview.test_ping', target_url: org.webhook_config?.url },
  });

  return {
    event: 'interview.test_ping',
    payload: testPayload,
    signature_header: `sha256=${signature}`,
    target_url: org.webhook_config?.url || null,
    enabled: Boolean(org.webhook_config?.enabled),
  };
}
