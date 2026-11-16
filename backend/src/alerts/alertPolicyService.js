import { ALERT_PRIORITIES, ALERT_TYPES } from './alertConstants.js';

/**
 * Phase 16: Alert Policy Service
 * Configurable, centralized alert policies and threshold evaluations.
 */

const DEFAULT_POLICIES = [
  {
    id: 'POL_FACE_ABSENCE',
    event_type: 'FACE_ABSENCE',
    enabled: true,
    priority: ALERT_PRIORITIES.HIGH,
    min_duration_ms: 3000,
    min_occurrence_count: 3,
    escalation_enabled: true,
    title: 'Face absence observed',
    message: 'No face was detected across the configured observation interval.',
    evaluate(event) {
      if (!this.enabled || event.event_type !== this.event_type) return false;
      const duration = typeof event.duration_ms === 'number' ? event.duration_ms : 0;
      const count = typeof event.occurrence_count === 'number' ? event.occurrence_count : 0;
      return (duration >= this.min_duration_ms || count >= this.min_occurrence_count) && event.severity === 'high';
    },
  },
  {
    id: 'POL_MULTIPLE_FACES',
    event_type: 'MULTIPLE_FACES',
    enabled: true,
    priority: ALERT_PRIORITIES.HIGH,
    min_occurrence_count: 2,
    escalation_enabled: true,
    title: 'Multiple faces detected',
    message: 'Multiple distinct faces were detected in repeated camera observations.',
    evaluate(event) {
      if (!this.enabled || event.event_type !== this.event_type) return false;
      const count = typeof event.occurrence_count === 'number' ? event.occurrence_count : 0;
      return count >= this.min_occurrence_count && event.severity === 'high';
    },
  },
  {
    id: 'POL_PRESENCE_CONSISTENCY_LOW',
    event_type: 'FACE_PRESENCE_CONSISTENCY',
    enabled: true,
    priority: ALERT_PRIORITIES.MEDIUM,
    escalation_enabled: false,
    title: 'Low face presence consistency',
    message: 'Face presence observed in less than 70% of camera sampling frames.',
    evaluate(event) {
      if (!this.enabled || event.event_type !== this.event_type) return false;
      return event.metrics?.classification === 'low' || (typeof event.metrics?.presence_ratio === 'number' && event.metrics.presence_ratio < 0.7);
    },
  },
  {
    id: 'POL_FRAME_QUALITY_DEGRADED',
    event_type: 'FRAME_QUALITY_SUMMARY',
    enabled: true,
    priority: ALERT_PRIORITIES.MEDIUM,
    escalation_enabled: false,
    title: 'Camera feed quality degraded',
    message: 'Camera lighting or image sharpness remained below the monitoring quality threshold.',
    evaluate(event) {
      if (!this.enabled || event.event_type !== this.event_type) return false;
      const classification = event.metrics?.classification;
      return classification === 'degraded' || classification === 'critical_unusable';
    },
    resolvePriority(event) {
      return event.metrics?.classification === 'critical_unusable' ? ALERT_PRIORITIES.HIGH : ALERT_PRIORITIES.MEDIUM;
    },
  },
  {
    id: 'POL_MONITORING_DATA_QUALITY',
    event_type: 'MONITORING_DATA_QUALITY',
    enabled: true,
    priority: ALERT_PRIORITIES.MEDIUM,
    escalation_enabled: false,
    title: 'Monitoring stream continuity degraded',
    message: 'Monitoring stream experienced sequence gaps or frame drops affecting data continuity.',
    evaluate(event) {
      if (!this.enabled || event.event_type !== this.event_type) return false;
      const reliability = (event.reliability || '').toUpperCase();
      return reliability === 'DEGRADED' || reliability === 'UNRELIABLE';
    },
    resolvePriority(event) {
      return (event.reliability || '').toUpperCase() === 'UNRELIABLE' ? ALERT_PRIORITIES.HIGH : ALERT_PRIORITIES.MEDIUM;
    },
  },
];

class AlertPolicyService {
  constructor(initialPolicies = DEFAULT_POLICIES) {
    this.policies = new Map();
    for (const policy of initialPolicies) {
      this.policies.set(policy.id, { ...policy });
    }
  }

  /**
   * Returns list of all registered policies.
   */
  getAllPolicies() {
    return Array.from(this.policies.values());
  }

  /**
   * Retrieves policy by identifier.
   */
  getPolicyById(policyId) {
    return this.policies.get(policyId) || null;
  }

  /**
   * Finds the active policy applicable to the event.
   */
  findApplicablePolicy(event) {
    if (!event || typeof event !== 'object' || !event.event_type) return null;
    for (const policy of this.policies.values()) {
      if (policy.event_type === event.event_type && policy.enabled) {
        return policy;
      }
    }
    return null;
  }

  /**
   * Evaluates an event against its matching policy.
   *
   * @param {object} event - Phase 15 monitoring event.
   * @returns {{ qualifies: boolean, policy: object|null, priority: string, title: string, message: string }}
   */
  evaluateEvent(event) {
    const policy = this.findApplicablePolicy(event);
    if (!policy) {
      return { qualifies: false, policy: null };
    }

    const qualifies = policy.evaluate(event);
    if (!qualifies) {
      return { qualifies: false, policy };
    }

    const priority = policy.resolvePriority ? policy.resolvePriority(event) : policy.priority;

    return {
      qualifies: true,
      policy,
      priority,
      title: policy.title,
      message: event.explanation || policy.message,
    };
  }

  /**
   * Updates policy thresholds or enabled state dynamically.
   */
  updatePolicy(policyId, updates = {}) {
    const existing = this.policies.get(policyId);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.policies.set(policyId, updated);
    return updated;
  }

  /**
   * Resets all policies back to defaults.
   */
  resetToDefaults() {
    this.policies.clear();
    for (const policy of DEFAULT_POLICIES) {
      this.policies.set(policy.id, { ...policy });
    }
  }
}

export const alertPolicyService = new AlertPolicyService();
export default alertPolicyService;

