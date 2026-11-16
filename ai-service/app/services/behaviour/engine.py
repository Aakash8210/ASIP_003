"""Temporal Behaviour Signal Engine for Phase 14.

Coordinates session state management, data ordering, and behavioral signal
extraction from Phase 13 CV observations.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Optional

from ..computer_vision.schemas import CVAnalysisResult
from .analyzers import (
    FaceAbsenceAnalyzer,
    FacePresenceConsistencyAnalyzer,
    FrameQualitySummaryAnalyzer,
    MonitoringQualityAnalyzer,
    MultipleFacesAnalyzer,
)
from .config import BehaviourConfig, DEFAULT_CONFIG
from .schemas import (
    BehaviourAnalysisResult,
    BehaviourSignal,
    MonitoringQuality,
    MonitoringReliability,
)

logger = logging.getLogger("ai-service.behaviour.engine")


class SessionBehaviourTracker:
    """Thread-safe, bounded in-memory observation tracker per interview session.

    Enforces session isolation and caps memory at `max_session_history`
    observations per session to prevent unbounded memory growth.
    """

    def __init__(self, config: BehaviourConfig = DEFAULT_CONFIG) -> None:
        self._config = config
        self._lock = threading.Lock()
        # interview_id -> deque of CVAnalysisResult
        self._sessions: dict[str, deque[CVAnalysisResult]] = {}
        # interview_id -> last_updated_epoch
        self._last_active: dict[str, float] = {}

    def record_observations(
        self, interview_id: str, new_obs: list[CVAnalysisResult]
    ) -> list[CVAnalysisResult]:
        """Append new observations to session history with deduplication and bounded limit."""
        with self._lock:
            if interview_id not in self._sessions:
                self._sessions[interview_id] = deque(maxlen=self._config.max_session_history)

            session_deque = self._sessions[interview_id]

            # Build set of already-seen sequence numbers in this session
            seen_seqs = {o.sequence_number for o in session_deque}

            for obs in new_obs:
                if obs.sequence_number not in seen_seqs:
                    session_deque.append(obs)
                    seen_seqs.add(obs.sequence_number)

            self._last_active[interview_id] = time.time()
            # Return current list sorted by sequence number
            return sorted(list(session_deque), key=lambda x: (x.sequence_number, x.frame_timestamp))

    def get_observations(self, interview_id: str) -> list[CVAnalysisResult]:
        """Return all current observations for the session sorted by sequence number."""
        with self._lock:
            session_deque = self._sessions.get(interview_id)
            if not session_deque:
                return []
            return sorted(list(session_deque), key=lambda x: (x.sequence_number, x.frame_timestamp))

    def clear_session(self, interview_id: str) -> bool:
        """Purge all in-memory state for an interview session."""
        with self._lock:
            existed = interview_id in self._sessions
            self._sessions.pop(interview_id, None)
            self._last_active.pop(interview_id, None)
            return existed

    def clear_all(self) -> None:
        """Purge all sessions (useful for tests or service restart)."""
        with self._lock:
            self._sessions.clear()
            self._last_active.clear()

    def get_active_session_count(self) -> int:
        with self._lock:
            return len(self._sessions)


class BehaviourSignalEngine:
    """Orchestrates temporal analysis across modular behavioural signal analyzers."""

    def __init__(self, config: BehaviourConfig = DEFAULT_CONFIG) -> None:
        self._config = config
        self._tracker = SessionBehaviourTracker(config)

        # Analyzers
        self._quality_analyzer = MonitoringQualityAnalyzer(config)
        self._absence_analyzer = FaceAbsenceAnalyzer(config)
        self._multiple_face_analyzer = MultipleFacesAnalyzer(config)
        self._consistency_analyzer = FacePresenceConsistencyAnalyzer(config)
        self._frame_quality_analyzer = FrameQualitySummaryAnalyzer(config)

    @property
    def tracker(self) -> SessionBehaviourTracker:
        return self._tracker

    def analyze_observations(
        self,
        interview_id: str,
        observations: list[CVAnalysisResult],
    ) -> BehaviourAnalysisResult:
        """Run temporal signal extraction on a provided list of CV observations.

        This pure analysis method does not mutate session state unless called
        via ``process_and_track``.
        """
        analysis_id = f"beh_{interview_id}_{uuid.uuid4().hex[:8]}"

        if not observations:
            return BehaviourAnalysisResult(
                analysis_id=analysis_id,
                interview_id=interview_id,
                status="insufficient_data",
                total_observations_evaluated=0,
                signals=[],
                monitoring_quality=MonitoringQuality(
                    status=MonitoringReliability.INSUFFICIENT_DATA,
                    total_observations=0,
                    explanation="No observations were provided for behaviour analysis.",
                ),
            )

        # 1. Evaluate monitoring stream quality on raw observations
        data_quality = self._quality_analyzer.analyze(observations)

        # 2. Sort observations for temporal calculations
        sorted_obs = sorted(observations, key=lambda x: (x.sequence_number, x.frame_timestamp))
        window_start = sorted_obs[0].frame_timestamp
        window_end = sorted_obs[-1].frame_timestamp

        # 3. Extract signals
        signals: list[BehaviourSignal] = []

        # A. Face Absence Signals (BEH-003)
        absence_signals = self._absence_analyzer.analyze(sorted_obs, data_quality)
        signals.extend(absence_signals)

        # B. Multiple Faces Signals (BEH-002)
        multiple_face_signals = self._multiple_face_analyzer.analyze(sorted_obs, data_quality)
        signals.extend(multiple_face_signals)

        # C. Face Presence Consistency Signal (BEH-001)
        consistency_signal = self._consistency_analyzer.analyze(sorted_obs, data_quality)
        signals.append(consistency_signal)

        # D. Frame Quality Summary Signal (CV-SIG-006)
        quality_signal = self._frame_quality_analyzer.analyze(sorted_obs, data_quality)
        signals.append(quality_signal)

        return BehaviourAnalysisResult(
            analysis_id=analysis_id,
            interview_id=interview_id,
            schema_version="1.0",
            status="ok",
            evaluated_window_start=window_start,
            evaluated_window_end=window_end,
            total_observations_evaluated=len(sorted_obs),
            signals=signals,
            monitoring_quality=data_quality,
        )

    def process_and_track(
        self,
        interview_id: str,
        new_observations: list[CVAnalysisResult],
    ) -> BehaviourAnalysisResult:
        """Record observations to session tracker, then analyze accumulated session window."""
        accumulated_obs = self._tracker.record_observations(interview_id, new_observations)
        return self.analyze_observations(interview_id, accumulated_obs)

    def analyze_session(self, interview_id: str) -> BehaviourAnalysisResult:
        """Analyze current accumulated observations for an interview session."""
        obs = self._tracker.get_observations(interview_id)
        return self.analyze_observations(interview_id, obs)


# Shared global engine singleton for the FastAPI process
_global_engine: Optional[BehaviourSignalEngine] = None
_engine_lock = threading.Lock()


def get_behaviour_engine() -> BehaviourSignalEngine:
    """Return the shared BehaviourSignalEngine singleton."""
    global _global_engine
    with _engine_lock:
        if _global_engine is None:
            _global_engine = BehaviourSignalEngine()
        return _global_engine

