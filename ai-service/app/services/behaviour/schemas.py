"""Pydantic schemas for Phase 14 Observable Behaviour Signal Extraction.

All schemas follow the AI/ML Specification v1.0 (Section 9) contract:
- Signals are objective visual observations over time.
- No field asserts cheating, dishonesty, guilt, intent, or personality.
- Strict versioning (schema_version = '1.0') for reproducibility and auditability.
- Clear separation between observed signals, non-observed evaluations, and
  insufficient data conditions.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class SignalType(str, Enum):
    """Categorization of observable behavioural signals (Section 9.1)."""

    FACE_ABSENCE = "FACE_ABSENCE"
    """BEH-003: Continuous period where candidate face was absent across consecutive frames."""

    MULTIPLE_FACES = "MULTIPLE_FACES"
    """BEH-002: Repeated observation of more than one face within an interval."""

    FACE_PRESENCE_CONSISTENCY = "FACE_PRESENCE_CONSISTENCY"
    """BEH-001: Aggregated ratio and consistency of face presence across an evaluated window."""

    FRAME_QUALITY_SUMMARY = "FRAME_QUALITY_SUMMARY"
    """CV-SIG-006: Aggregated quality metrics (blur, brightness, unusable ratio) over time."""

    MONITORING_DATA_QUALITY = "MONITORING_DATA_QUALITY"
    """Data integrity assessment: gaps, out-of-order sequences, duplicates, and missing frames."""


class SignalStatus(str, Enum):
    """Outcome of temporal pattern evaluation."""

    OBSERVED = "observed"
    """The defined behavioural pattern was observed above the configured threshold."""

    NOT_OBSERVED = "not_observed"
    """Observations were evaluated, but the pattern was not observed or remained below threshold."""

    INSUFFICIENT_DATA = "insufficient_data"
    """Too few valid observations were available to make a reliable determination."""


class SignalReliability(str, Enum):
    """Confidence qualification of the signal based on monitoring data quality."""

    SUFFICIENT = "sufficient"
    """Data quality is adequate for reliable temporal observation."""

    DEGRADED = "degraded"
    """Minor gaps or degraded frames were present; signal should be reviewed with context."""

    UNRELIABLE = "unreliable"
    """Significant gaps, missing sequence numbers, or unusable frames affected analysis."""


class ConsistencyClassification(str, Enum):
    """Standardized classification of face presence continuity (BEH-001)."""

    HIGH = "high"
    """Face detected in >= 90% of valid observations."""

    MODERATE = "moderate"
    """Face detected in 70% to 89% of valid observations."""

    LOW = "low"
    """Face detected in < 70% of valid observations."""

    INSUFFICIENT_DATA = "insufficient_data"
    """Fewer than minimum required observations available for ratio calculation."""


class QualityClassification(str, Enum):
    """Standardized classification of frame quality over time (CV-SIG-006)."""

    EXCELLENT = "excellent"
    """Virtually all frames are good, zero unusable frames."""

    ACCEPTABLE = "acceptable"
    """Majority good frames, negligible unusable frames."""

    DEGRADED = "degraded"
    """Frequent blur, poor brightness, or noticeable unusable frames (> 10%)."""

    CRITICAL_UNUSABLE = "critical_unusable"
    """Over 50% of frames are unusable or corrupted."""

    INSUFFICIENT_DATA = "insufficient_data"
    """Fewer than minimum required observations available for evaluation."""


class MonitoringReliability(str, Enum):
    """Overall reliability status of the frame ingestion and capture stream."""

    SUFFICIENT = "sufficient"
    """Continuous stream without sequence loss or large gaps."""

    DEGRADED = "degraded"
    """Minor gaps or isolated missing frames present."""

    UNRELIABLE = "unreliable"
    """Severe packet loss, out-of-order delivery, or prolonged sampling gaps."""

    INSUFFICIENT_DATA = "insufficient_data"
    """Fewer than 3 observations received."""


# ---------------------------------------------------------------------------
# Specific Metrics Models
# ---------------------------------------------------------------------------


class FaceAbsenceMetrics(BaseModel):
    """Detailed metrics for an observed or evaluated face absence signal."""

    consecutive_absent_frames: int = Field(
        ge=0, description="Number of consecutive observations where face was not detected."
    )
    absence_start_sequence: Optional[int] = Field(
        default=None, description="Sequence number of the first absent frame in the run."
    )
    absence_end_sequence: Optional[int] = Field(
        default=None, description="Sequence number of the last absent frame in the run."
    )
    is_ongoing: bool = Field(
        default=False, description="True if the face absence run extends to the latest observation."
    )
    sampling_gaps_within_run: int = Field(
        default=0, description="Number of temporal gaps (> threshold) within the absence period."
    )


class MultipleFacesMetrics(BaseModel):
    """Detailed metrics for an observed multiple-faces signal."""

    multiple_faces_frames_count: int = Field(
        ge=0, description="Count of observations where face_count > 1."
    )
    max_faces_observed: int = Field(
        ge=0, description="Highest number of faces detected in any single frame in this interval."
    )
    start_sequence: Optional[int] = Field(
        default=None, description="Sequence number of the first multiple-face observation."
    )
    end_sequence: Optional[int] = Field(
        default=None, description="Sequence number of the last multiple-face observation."
    )
    occurrence_ratio: float = Field(
        ge=0.0, le=1.0, description="Ratio of multiple-face frames to total evaluated frames."
    )


class PresenceConsistencyMetrics(BaseModel):
    """Detailed metrics for face presence continuity over an evaluated window."""

    total_valid_observations: int = Field(
        ge=0, description="Number of usable observations evaluated."
    )
    detected_face_count: int = Field(
        ge=0, description="Number of observations with at least one face detected."
    )
    absent_face_count: int = Field(
        ge=0, description="Number of observations where face was not detected."
    )
    presence_ratio: float = Field(
        ge=0.0, le=1.0, description="detected_face_count / total_valid_observations."
    )
    classification: ConsistencyClassification = Field(
        description="Categorical presence classification (HIGH, MODERATE, LOW, INSUFFICIENT_DATA)."
    )


class FrameQualitySummaryMetrics(BaseModel):
    """Detailed metrics for frame quality over the evaluated time window."""

    total_frames: int = Field(ge=0, description="Total frames evaluated for quality.")
    good_frames_count: int = Field(ge=0, description="Count of good quality frames.")
    degraded_frames_count: int = Field(ge=0, description="Count of degraded frames.")
    unusable_frames_count: int = Field(ge=0, description="Count of unusable frames.")
    good_ratio: float = Field(ge=0.0, le=1.0, description="Ratio of good frames to total.")
    degraded_ratio: float = Field(ge=0.0, le=1.0, description="Ratio of degraded frames to total.")
    unusable_ratio: float = Field(ge=0.0, le=1.0, description="Ratio of unusable frames to total.")
    average_blur_score: float = Field(
        ge=0.0, description="Mean Laplacian sharpness score across evaluated frames."
    )
    average_brightness: float = Field(
        ge=0.0, le=255.0, description="Mean grayscale brightness (0-255) across evaluated frames."
    )
    classification: QualityClassification = Field(
        description="Overall frame quality classification."
    )


# ---------------------------------------------------------------------------
# Monitoring Quality & Behaviour Signal Models
# ---------------------------------------------------------------------------


class MonitoringQuality(BaseModel):
    """Assessment of capture stream continuity and data reliability."""

    status: MonitoringReliability = Field(
        description="Overall stream reliability (SUFFICIENT, DEGRADED, UNRELIABLE, INSUFFICIENT_DATA)."
    )
    total_observations: int = Field(
        ge=0, description="Total observations received for this evaluation."
    )
    sequence_range_start: Optional[int] = Field(
        default=None, description="Lowest sequence number evaluated."
    )
    sequence_range_end: Optional[int] = Field(
        default=None, description="Highest sequence number evaluated."
    )
    missing_sequence_count: int = Field(
        default=0, ge=0, description="Count of missing frame sequence numbers."
    )
    duplicate_observation_count: int = Field(
        default=0, ge=0, description="Count of duplicate sequence numbers received."
    )
    out_of_order_count: int = Field(
        default=0, ge=0, description="Count of observations received out of sequence order."
    )
    sampling_gap_count: int = Field(
        default=0, ge=0, description="Count of timestamps with excessive gap (> threshold)."
    )
    invalid_observation_count: int = Field(
        default=0, ge=0, description="Count of observations marked with status='error'."
    )
    explanation: str = Field(
        description="Factual, objective description of monitoring data continuity."
    )


class BehaviourSignal(BaseModel):
    """A normalized, explainable behavioural observation across multiple frames.

    Strict boundary: Describes what was visually observed over time, never inferring
    the candidate's motives, cheating, or intent.
    """

    signal_type: SignalType = Field(description="Signal identifier (e.g. FACE_ABSENCE).")
    status: SignalStatus = Field(description="Evaluation status (observed, not_observed, insufficient_data).")
    start_timestamp: Optional[str] = Field(
        default=None, description="ISO-8601 start timestamp of the observed interval."
    )
    end_timestamp: Optional[str] = Field(
        default=None, description="ISO-8601 end timestamp of the observed interval."
    )
    duration_ms: Optional[float] = Field(
        default=None, ge=0.0, description="Duration of the interval in milliseconds."
    )
    observation_count: int = Field(
        ge=0, description="Number of observations exhibiting this pattern."
    )
    total_evaluated_observations: int = Field(
        ge=0, description="Total observations in the evaluated context window."
    )
    reliability: SignalReliability = Field(
        description="Reliability qualification derived from data continuity."
    )
    metrics: dict[str, Any] = Field(
        default_factory=dict, description="Signal-specific quantifiable metrics."
    )
    explanation: str = Field(
        description="Neutral, objective human-readable explanation of what was visually observed."
    )


class BehaviourAnalysisResult(BaseModel):
    """Primary output schema for Phase 14 Behaviour Signal Extraction.

    Consumes sequential Phase 13 CV observations and produces normalized,
    explainable temporal signals.
    """

    analysis_id: str = Field(
        description="Unique identifier for this temporal analysis execution."
    )
    interview_id: str = Field(
        description="Interview session this analysis belongs to."
    )
    processed_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp when behaviour analysis completed.",
    )
    schema_version: str = Field(
        default="1.0", description="Schema contract version for auditability."
    )
    status: str = Field(
        default="ok", description="Overall execution status ('ok', 'insufficient_data', 'error')."
    )
    evaluated_window_start: Optional[str] = Field(
        default=None, description="Timestamp of the earliest observation in the window."
    )
    evaluated_window_end: Optional[str] = Field(
        default=None, description="Timestamp of the latest observation in the window."
    )
    total_observations_evaluated: int = Field(
        ge=0, description="Total number of observations processed in this analysis."
    )
    signals: list[BehaviourSignal] = Field(
        default_factory=list, description="Extracted observable behavioural signals."
    )
    monitoring_quality: MonitoringQuality = Field(
        description="Monitoring stream continuity and data quality evaluation."
    )

