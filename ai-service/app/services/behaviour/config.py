"""Configurable thresholds and parameters for Phase 14 Behaviour Signal Extraction.

All thresholds have documented sensible defaults aligned with Phase 12's
1 fps (1000 ms) default sampling rate, but can be customized per deployment.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class BehaviourConfig:
    """Threshold configuration for temporal behaviour signal extraction."""

    # --- Face Absence (BEH-003) ---------------------------------------------
    # At 1 fps, 3 consecutive absent frames indicates ~3 seconds of absence.
    # An isolated single missing frame (e.g. blink or motion blur) is NOT flagged.
    min_absence_observations: int = 3
    min_absence_duration_ms: float = 2500.0

    # --- Multiple Faces (BEH-002) -------------------------------------------
    # At least 2 multiple-face observations are required to avoid flagging
    # transient single-frame false-positives (e.g. poster or brief background object).
    min_multiple_faces_observations: int = 2

    # --- Face Presence Consistency (BEH-001) --------------------------------
    # Minimum observations required before reporting a meaningful presence ratio.
    min_observations_for_consistency: int = 5
    high_presence_ratio_threshold: float = 0.90
    moderate_presence_ratio_threshold: float = 0.70

    # --- Monitoring Data Quality & Sampling Gaps ----------------------------
    # At 1000ms sampling, a gap > 3000ms (3 missed intervals) constitutes a network/sampling gap.
    sampling_gap_threshold_ms: float = 3000.0
    min_observations_for_monitoring_quality: int = 3

    # --- Memory & Session Lifecycle -----------------------------------------
    # Bounded in-memory window size per interview session.
    # 1000 frames @ 1 fps = ~16.6 minutes of rolling history.
    max_session_history: int = 1000

    # Sessions inactive for more than 1 hour are eligible for automatic eviction.
    session_idle_ttl_seconds: int = 3600


DEFAULT_CONFIG = BehaviourConfig()

