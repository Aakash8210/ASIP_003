/**
 * Constants for the Interview Report system (Phase 19, PRD-FR-010, Database Spec §13).
 */

export const REVIEW_STATUSES = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  REVIEWED: 'REVIEWED',
  FLAGGED_FOR_FOLLOWUP: 'FLAGGED_FOR_FOLLOWUP',
};

export const SUPPORTED_REVIEW_STATUSES = Object.values(REVIEW_STATUSES);

export const REPORT_EVENT_SEVERITIES = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
};
