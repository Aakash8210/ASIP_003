"""Pydantic schemas for the Computer Vision analysis output.

All fields follow the AI/ML Specification v1.0 output contract:
- Observations are objective visual measurements.
- No field should claim intent, deception, guilt, or cheating.
- Every result carries model/rule version metadata for auditability.

Phase 13 scope: CV-SIG-001 (face present), CV-SIG-002 (multiple faces),
CV-SIG-003 (face absence indicator), CV-SIG-006 (frame quality).

CV-SIG-004 (head orientation) and CV-SIG-005 (gaze direction) are
marked as Proposed in the specification and are deferred to a later phase.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class AnalysisStatus(str, Enum):
    """Overall processing outcome for a single frame analysis."""

    OK = "ok"
    """Frame was processed successfully; results are populated."""

    SKIPPED = "skipped"
    """Frame was discarded before inference (quality gate / unsupported format)."""

    ERROR = "error"
    """Inference or preprocessing raised an unrecoverable error."""


class FrameQualityGrade(str, Enum):
    """Coarse quality assessment of the decoded frame (CV-SIG-006)."""

    GOOD = "good"
    """Frame is suitable for inference; image is adequately sharp and exposed."""

    DEGRADED = "degraded"
    """Frame may impair detection accuracy (blur / low resolution / exposure)."""

    UNUSABLE = "unusable"
    """Frame cannot be meaningfully processed (corrupt / extremely low quality)."""


# ---------------------------------------------------------------------------
# Sub-models
# ---------------------------------------------------------------------------


class BoundingBox(BaseModel):
    """Normalised face bounding box — coordinates are fractions of the frame."""

    x: float = Field(ge=0.0, le=1.0, description="Normalised left edge of the box.")
    y: float = Field(ge=0.0, le=1.0, description="Normalised top edge of the box.")
    width: float = Field(gt=0.0, le=1.0, description="Normalised width of the box.")
    height: float = Field(gt=0.0, le=1.0, description="Normalised height of the box.")

    @property
    def area(self) -> float:
        return self.width * self.height


class DetectedFace(BaseModel):
    """Observation for a single detected face in a frame.

    Raw model output is normalised into this structure.  No identity
    information is stored or inferred.
    """

    bounding_box: BoundingBox = Field(
        description="Normalised bounding-box relative to frame dimensions."
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Detector confidence score for this face detection (0–1).",
    )
    face_index: int = Field(
        ge=0,
        description="Zero-based index in this frame's detection list; not persistent across frames.",
    )


class FrameQualityMetrics(BaseModel):
    """Frame quality metrics computed before inference (CV-SIG-006).

    Used to qualify downstream confidence and decide whether to run inference.
    """

    grade: FrameQualityGrade = Field(description="Coarse quality assessment.")
    blur_score: float = Field(
        ge=0.0,
        description=(
            "Laplacian variance used as a sharpness proxy. "
            "Higher is sharper; below ~100 is considered blurry."
        ),
    )
    brightness_mean: float = Field(
        ge=0.0,
        le=255.0,
        description="Mean pixel brightness in the grayscale frame (0–255).",
    )
    width_px: int = Field(gt=0, description="Decoded frame width in pixels.")
    height_px: int = Field(gt=0, description="Decoded frame height in pixels.")


# ---------------------------------------------------------------------------
# Primary result schema
# ---------------------------------------------------------------------------


class CVAnalysisResult(BaseModel):
    """Structured Computer Vision observation for one webcam frame.

    This is the Phase 13 output contract consumed by downstream phases.
    It carries raw model outputs, normalised visual observations, and
    processing metadata — but never behavioural event classifications or
    integrity scores.

    Model/rule version fields (``detector_model``, ``schema_version``) are
    included for reproducibility and auditability per AI/ML Specification v1.0.
    """

    # --- Identity & provenance -----------------------------------------------
    analysis_id: str = Field(
        description="Unique identifier for this analysis result (not tied to candidate identity)."
    )
    interview_id: str = Field(
        description="Interview session this frame belongs to."
    )
    sequence_number: int = Field(
        gt=0, description="Frame sequence number from the Phase 12 capture pipeline."
    )
    frame_timestamp: str = Field(
        description="ISO-8601 capture timestamp from the Phase 12 frame metadata."
    )
    processed_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp when analysis was completed.",
    )

    # --- Status & versioning --------------------------------------------------
    status: AnalysisStatus = Field(description="Overall analysis outcome.")
    error_message: Optional[str] = Field(
        default=None,
        description="Human-readable error description when status is 'error'.",
    )
    schema_version: str = Field(
        default="1.0",
        description="CV output schema version for auditability.",
    )
    detector_model: str = Field(
        default="yunet-2023mar",
        description="Face detector model identifier and version.",
    )

    # --- Frame quality (CV-SIG-006) ------------------------------------------
    frame_quality: Optional[FrameQualityMetrics] = Field(
        default=None,
        description="Frame quality assessment; None when decoding failed.",
    )

    # --- Face detection (CV-SIG-001, CV-SIG-002, CV-SIG-003) ----------------
    face_detected: Optional[bool] = Field(
        default=None,
        description=(
            "CV-SIG-001: True when at least one face is detected above the "
            "confidence threshold. None when inference did not run."
        ),
    )
    face_count: Optional[int] = Field(
        default=None,
        ge=0,
        description=(
            "Total number of faces detected in this frame. "
            "None when inference did not run."
        ),
    )
    multiple_faces_detected: Optional[bool] = Field(
        default=None,
        description=(
            "CV-SIG-002: True when face_count > 1. "
            "None when inference did not run."
        ),
    )
    detected_faces: list[DetectedFace] = Field(
        default_factory=list,
        description="List of individual face observations with bounding boxes and confidence.",
    )

    # --- Processing metadata -------------------------------------------------
    inference_duration_ms: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Time spent on model inference in milliseconds.",
    )
    total_duration_ms: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Total analysis time including preprocessing in milliseconds.",
    )

