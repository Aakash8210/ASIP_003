/**
 * Phase 17: Evidence System Constants
 *
 * Defines canonical evidence types, retention classes, default expiration,
 * and supported MIME types per Database Specification §12 and PRD-FR-008.
 */

export const EVIDENCE_TYPES = {
  OBSERVATION_CONTEXT: 'OBSERVATION_CONTEXT',
  QUALITY_TELEMETRY: 'QUALITY_TELEMETRY',
  KEYFRAME_SNAPSHOT: 'KEYFRAME_SNAPSHOT',
  METRICS_SUMMARY: 'METRICS_SUMMARY',
};

export const SUPPORTED_EVIDENCE_TYPES = Object.values(EVIDENCE_TYPES);

export const RETENTION_CLASSES = {
  STANDARD: 'STANDARD',     // Default 30-day retention
  EXTENDED: 'EXTENDED',     // 90-day retention for audit
  PERMANENT: 'PERMANENT',   // Indefinite retention for regulatory hold
};

export const SUPPORTED_RETENTION_CLASSES = Object.values(RETENTION_CLASSES);

// Default retention periods in milliseconds
export const RETENTION_PERIODS_MS = {
  [RETENTION_CLASSES.STANDARD]: 30 * 24 * 60 * 60 * 1000,   // 30 days
  [RETENTION_CLASSES.EXTENDED]: 90 * 24 * 60 * 60 * 1000,   // 90 days
  [RETENTION_CLASSES.PERMANENT]: null,                      // No expiration
};

// Default MIME types
export const EVIDENCE_MIME_TYPES = {
  JSON: 'application/json',
  JPEG: 'image/jpeg',
  WEBP: 'image/webp',
  PNG: 'image/png',
};
