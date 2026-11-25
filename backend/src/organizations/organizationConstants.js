/**
 * Organization and Plan Tier Constants (Phase 24)
 */

export const PLAN_TIERS = {
  STARTER: 'STARTER',
  GROWTH: 'GROWTH',
  ENTERPRISE: 'ENTERPRISE',
};

export const MEMBER_ROLES = {
  HR_ADMIN: 'HR_ADMIN',
  RECRUITER: 'RECRUITER',
  INTERVIEWER: 'INTERVIEWER',
};

export const PLAN_ENTITLEMENTS = {
  [PLAN_TIERS.STARTER]: {
    max_members: 5,
    max_active_interviews: 20,
    v2_multimodal_enabled: false,
    webhooks_enabled: false,
    custom_retention_allowed: false,
    max_retention_days: 30,
    support_tier: 'community',
  },
  [PLAN_TIERS.GROWTH]: {
    max_members: 25,
    max_active_interviews: 100,
    v2_multimodal_enabled: true,
    webhooks_enabled: true,
    custom_retention_allowed: true,
    max_retention_days: 90,
    support_tier: 'standard',
  },
  [PLAN_TIERS.ENTERPRISE]: {
    max_members: 250,
    max_active_interviews: 1000,
    v2_multimodal_enabled: true,
    webhooks_enabled: true,
    custom_retention_allowed: true,
    max_retention_days: 365,
    support_tier: 'dedicated_sla',
  },
};

export const AUDIT_ACTIONS = {
  ORG_CREATED: 'ORG_CREATED',
  ORG_UPDATED: 'ORG_UPDATED',
  PLAN_TIER_CHANGED: 'PLAN_TIER_CHANGED',
  MEMBER_INVITED: 'MEMBER_INVITED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  MEMBER_ROLE_UPDATED: 'MEMBER_ROLE_UPDATED',
  GOVERNANCE_UPDATED: 'GOVERNANCE_UPDATED',
  RETENTION_PURGE_TRIGGERED: 'RETENTION_PURGE_TRIGGERED',
  WEBHOOK_CONFIGURED: 'WEBHOOK_CONFIGURED',
  WEBHOOK_TEST_EMITTED: 'WEBHOOK_TEST_EMITTED',
  REPORT_REVIEW_SIGNED: 'REPORT_REVIEW_SIGNED',
};
