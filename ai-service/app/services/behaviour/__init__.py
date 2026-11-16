"""Behavioural signal extraction package for the AI Interview Monitoring system.

Phase 14 — Observable Behaviour Signal Extraction

Responsible for:
- Temporal observation tracking across sequential webcam frames (Phase 13 CV outputs)
- Face Absence Signal extraction (BEH-003)
- Multiple Face Presence Signal extraction (BEH-002)
- Face Presence Consistency extraction (BEH-001)
- Frame Quality Trend & Summary extraction (CV-SIG-006)
- Monitoring Data Quality & Continuity assessment
- Bounded in-memory session tracking

Strict boundaries:
- Outputs are objective visual observations over time; they do NOT assert intent,
  cheating, dishonesty, or guilt.
- No facial recognition, identity matching, or emotion inference.
- No permanent database persistence (Phase 15 responsibility).
- No alerts or recruiter notifications (Phase 16 responsibility).
- No raw image data is stored or logged.
"""

from .engine import BehaviourSignalEngine, SessionBehaviourTracker
from .schemas import (
    BehaviourAnalysisResult,
    BehaviourSignal,
    ConsistencyClassification,
    MonitoringQuality,
    MonitoringReliability,
    SignalStatus,
    SignalType,
)

__all__ = [
    "BehaviourAnalysisResult",
    "BehaviourSignal",
    "BehaviourSignalEngine",
    "ConsistencyClassification",
    "MonitoringQuality",
    "MonitoringReliability",
    "SessionBehaviourTracker",
    "SignalStatus",
    "SignalType",
]

