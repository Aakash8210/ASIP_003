/**
 * Phase 16: Real-Time Alerts Constants
 */

export const ALERT_STATUSES = {
  NEW: 'NEW',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  DISMISSED: 'DISMISSED',
};

export const ALERT_PRIORITIES = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO',
};

export const ALERT_TYPES = {
  MONITORING_EVENT: 'MONITORING_EVENT',
  SYSTEM_ALERT: 'SYSTEM_ALERT',
};

export const SOCKET_ALERT_EVENTS = {
  NEW: 'monitoring-alert:new',
  UPDATED: 'monitoring-alert:updated',
  ACKNOWLEDGED: 'monitoring-alert:acknowledged',
  DISMISSED: 'monitoring-alert:dismissed',
  ESCALATED: 'monitoring-alert:escalated',
};

export const VALID_LIFECYCLE_TRANSITIONS = {
  [ALERT_STATUSES.NEW]: [ALERT_STATUSES.ACKNOWLEDGED, ALERT_STATUSES.DISMISSED],
  [ALERT_STATUSES.ACKNOWLEDGED]: [ALERT_STATUSES.DISMISSED],
  [ALERT_STATUSES.DISMISSED]: [], // Terminal state
};

