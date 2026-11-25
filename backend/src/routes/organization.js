import { Router } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, authorize } from '../auth/middleware.js';
import {
  getOrCreateUserOrganization,
  updateOrgProfile,
  inviteMember,
  changeMemberRole,
  removeMember,
  updateGovernance,
  purgeExpiredData,
  testWebhook,
} from '../organizations/organizationService.js';
import { findAuditLogsByOrg } from '../organizations/organizationRepository.js';

export const organizationRouter = Router();

/**
 * GET /api/organization
 * Retrieves the current authenticated HR user's organization profile & plan entitlements.
 *
 * RBAC: HR only. Candidates get 403.
 */
organizationRouter.get(
  '/',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const org = await getOrCreateUserOrganization(req.user);
    res.status(200).json({
      status: 'ok',
      organization: org,
    });
  })
);

/**
 * PATCH /api/organization
 * Updates organization profile name or subscription plan tier.
 *
 * RBAC: HR only.
 */
organizationRouter.patch(
  '/',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const org = await getOrCreateUserOrganization(req.user);
    const updated = await updateOrgProfile(org._id, req.body, req.user);
    res.status(200).json({
      status: 'ok',
      organization: updated,
    });
  })
);

/**
 * GET /api/organization/members
 * Lists members of the organization roster.
 *
 * RBAC: HR only.
 */
organizationRouter.get(
  '/members',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const org = await getOrCreateUserOrganization(req.user);
    res.status(200).json({
      status: 'ok',
      members: org.members || [],
      total_members: org.members?.length || 0,
      max_members: org.entitlements?.max_members || 25,
    });
  })
);

/**
 * POST /api/organization/members
 * Invites a new team member to the organization roster.
 *
 * RBAC: HR only.
 */
organizationRouter.post(
  '/members',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const org = await getOrCreateUserOrganization(req.user);
    const result = await inviteMember(org._id, req.body, req.user);
    res.status(201).json({
      status: 'ok',
      ...result,
    });
  })
);

/**
 * PATCH /api/organization/members/:userId
 * Updates a member's role within the organization.
 *
 * RBAC: HR only.
 */
organizationRouter.patch(
  '/members/:userId',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const org = await getOrCreateUserOrganization(req.user);
    const updated = await changeMemberRole(org._id, req.params.userId, req.body.role, req.user);
    res.status(200).json({
      status: 'ok',
      organization: updated,
    });
  })
);

/**
 * DELETE /api/organization/members/:userId
 * Removes a member from the organization roster.
 *
 * RBAC: HR only.
 */
organizationRouter.delete(
  '/members/:userId',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const org = await getOrCreateUserOrganization(req.user);
    const updated = await removeMember(org._id, req.params.userId, req.user);
    res.status(200).json({
      status: 'ok',
      organization: updated,
    });
  })
);

/**
 * GET /api/organization/governance
 * Retrieves organization data retention policies and webhook configurations.
 *
 * RBAC: HR only.
 */
organizationRouter.get(
  '/governance',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const org = await getOrCreateUserOrganization(req.user);
    res.status(200).json({
      status: 'ok',
      governance: org.governance,
      webhook_config: org.webhook_config,
      entitlements: org.entitlements,
    });
  })
);

/**
 * PATCH /api/organization/governance
 * Updates data retention policies or webhook configurations.
 *
 * RBAC: HR only.
 */
organizationRouter.patch(
  '/governance',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const org = await getOrCreateUserOrganization(req.user);
    const updated = await updateGovernance(org._id, req.body, req.user);
    res.status(200).json({
      status: 'ok',
      governance: updated.governance,
      webhook_config: updated.webhook_config,
    });
  })
);

/**
 * POST /api/organization/governance/purge-expired
 * Manually executes data retention purge of expired evidence and historical events.
 *
 * RBAC: HR only.
 */
organizationRouter.post(
  '/governance/purge-expired',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const org = await getOrCreateUserOrganization(req.user);
    const purgeSummary = await purgeExpiredData(org._id, req.user);
    res.status(200).json({
      status: 'ok',
      ...purgeSummary,
    });
  })
);

/**
 * GET /api/organization/audit-log
 * Retrieves enterprise audit log records with pagination and filters.
 *
 * RBAC: HR only.
 */
organizationRouter.get(
  '/audit-log',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const org = await getOrCreateUserOrganization(req.user);
    const result = await findAuditLogsByOrg(org.organization_id, req.query);
    res.status(200).json({
      status: 'ok',
      ...result,
    });
  })
);

/**
 * POST /api/organization/webhooks/test
 * Emits a signed test webhook event for integration verification.
 *
 * RBAC: HR only.
 */
organizationRouter.post(
  '/webhooks/test',
  authenticate,
  authorize('hr'),
  asyncHandler(async (req, res) => {
    const org = await getOrCreateUserOrganization(req.user);
    const result = await testWebhook(org._id, req.user);
    res.status(200).json({
      status: 'ok',
      ...result,
    });
  })
);
