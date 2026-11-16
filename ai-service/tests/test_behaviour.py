"""Phase 14 — Observable Behaviour Signal Extraction test suite.

Tests cover:
1. Face Absence Signal extraction (BEH-003): consecutive runs, thresholds, single-frame blip suppression, return to presence.
2. Multiple Face Presence Signal extraction (BEH-002): multi-frame occurrences, single-frame isolation, max face count.
3. Face Presence Consistency (BEH-001): ratio calculation, high/moderate/low/insufficient classifications.
4. Frame Quality Summary (CV-SIG-006): quality distribution, blur and brightness averages, classifications.
5. Monitoring Data Quality: continuity, sequence gaps, duplicates, out-of-order, sampling gaps, reliability ratings.
6. Session Tracker & State Management: session isolation, deduplication, bounded memory, state purging.
7. FastAPI Integration: POST /analysis/behaviour, GET session, DELETE session, OpenAPI verification.
8. Privacy and Neutrality Constraints: strict absence of cheating/fraud/suspicious assertions.

Run with:
    cd ai-service && ./venv/bin/pytest tests/test_behaviour.py -v
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.computer_vision.schemas import (
    AnalysisStatus,
    BoundingBox,
    CVAnalysisResult,
    DetectedFace,
    FrameQualityGrade,
    FrameQualityMetrics,
)
from app.services.behaviour.config import BehaviourConfig
from app.services.behaviour.engine import (
    BehaviourSignalEngine,
    SessionBehaviourTracker,
    get_behaviour_engine,
)
from app.services.behaviour.schemas import (
    BehaviourAnalysisResult,
    ConsistencyClassification,
    MonitoringReliability,
    QualityClassification,
    SignalReliability,
    SignalStatus,
    SignalType,
)


# ---------------------------------------------------------------------------
# Test Helpers: Observation Builders
# ---------------------------------------------------------------------------


def _make_obs(
    sequence_number: int,
    frame_timestamp: str,
    face_detected: bool = True,
    face_count: int = 1,
    multiple_faces: bool = False,
    grade: FrameQualityGrade = FrameQualityGrade.GOOD,
    blur_score: float = 120.0,
    brightness: float = 110.0,
    status: AnalysisStatus = AnalysisStatus.OK,
    interview_id: str = "test-session-001",
) -> CVAnalysisResult:
    """Construct a mock CVAnalysisResult for temporal behaviour tests."""
    faces = []
    if face_detected and face_count > 0:
        for idx in range(face_count):
            faces.append(
                DetectedFace(
                    bounding_box=BoundingBox(x=0.3 + idx * 0.2, y=0.3, width=0.2, height=0.3),
                    confidence=0.88,
                    face_index=idx,
                )
            )

    return CVAnalysisResult(
        analysis_id=f"cv_{interview_id}_{sequence_number}",
        interview_id=interview_id,
        sequence_number=sequence_number,
        frame_timestamp=frame_timestamp,
        status=status,
        frame_quality=FrameQualityMetrics(
            grade=grade,
            blur_score=blur_score,
            brightness_mean=brightness,
            width_px=640,
            height_px=360,
        ),
        face_detected=face_detected,
        face_count=face_count,
        multiple_faces_detected=multiple_faces or (face_count > 1),
        detected_faces=faces,
        inference_duration_ms=1.5,
        total_duration_ms=3.5,
    )


def _generate_timeline(
    count: int,
    base_time: Optional[datetime] = None,
    interval_seconds: float = 1.0,
    interview_id: str = "test-session-001",
    face_detected_pattern: Optional[list[bool]] = None,
    face_count_pattern: Optional[list[int]] = None,
    grade_pattern: Optional[list[FrameQualityGrade]] = None,
) -> list[CVAnalysisResult]:
    """Generate a clean synthetic temporal sequence of CV observations."""
    t0 = base_time or datetime(2026, 11, 7, 7, 0, 0, tzinfo=timezone.utc)
    results = []

    for i in range(count):
        ts = (t0 + timedelta(seconds=i * interval_seconds)).isoformat()
        face_det = face_detected_pattern[i % len(face_detected_pattern)] if face_detected_pattern else True
        f_count = face_count_pattern[i % len(face_count_pattern)] if face_count_pattern else (1 if face_det else 0)
        grade = grade_pattern[i % len(grade_pattern)] if grade_pattern else FrameQualityGrade.GOOD

        results.append(
            _make_obs(
                sequence_number=i + 1,
                frame_timestamp=ts,
                face_detected=face_det,
                face_count=f_count,
                grade=grade,
                interview_id=interview_id,
            )
        )

    return results


# ---------------------------------------------------------------------------
# 1. Face Absence Signal Tests (BEH-003)
# ---------------------------------------------------------------------------


class TestFaceAbsenceSignal:
    @pytest.fixture
    def engine(self) -> BehaviourSignalEngine:
        return BehaviourSignalEngine()

    def test_consecutive_absence_triggers_observed_signal(self, engine: BehaviourSignalEngine) -> None:
        """4 consecutive absent frames (threshold=3) must produce an OBSERVED FACE_ABSENCE signal."""
        # 2 present, 4 absent, 2 present
        pattern = [True, True, False, False, False, False, True, True]
        obs = _generate_timeline(len(pattern), face_detected_pattern=pattern)

        result = engine.analyze_observations("intv-absence-1", obs)
        signals = [s for s in result.signals if s.signal_type == SignalType.FACE_ABSENCE]
        assert len(signals) == 1

        absence = signals[0]
        assert absence.status == SignalStatus.OBSERVED
        assert absence.observation_count == 4
        assert absence.metrics["consecutive_absent_frames"] == 4
        assert absence.metrics["absence_start_sequence"] == 3
        assert absence.metrics["absence_end_sequence"] == 6
        assert absence.metrics["is_ongoing"] is False
        assert "4 consecutive observations" in absence.explanation

    def test_single_frame_blip_does_not_trigger_absence(self, engine: BehaviourSignalEngine) -> None:
        """An isolated 1-frame face loss (e.g. blink) must NOT trigger an observed signal."""
        # 3 present, 1 absent, 3 present
        pattern = [True, True, True, False, True, True, True]
        obs = _generate_timeline(len(pattern), face_detected_pattern=pattern)

        result = engine.analyze_observations("intv-absence-blip", obs)
        signals = [s for s in result.signals if s.signal_type == SignalType.FACE_ABSENCE]
        assert len(signals) == 1
        assert signals[0].status == SignalStatus.NOT_OBSERVED

    def test_face_returning_closes_absence_run(self, engine: BehaviourSignalEngine) -> None:
        """Face returning after an absence correctly completes the interval without leakage."""
        pattern = [True, False, False, False, True, True]
        obs = _generate_timeline(len(pattern), face_detected_pattern=pattern)

        result = engine.analyze_observations("intv-absence-return", obs)
        absence = [s for s in result.signals if s.signal_type == SignalType.FACE_ABSENCE][0]
        assert absence.status == SignalStatus.OBSERVED
        assert absence.observation_count == 3
        assert absence.metrics["is_ongoing"] is False

    def test_ongoing_absence_flagged(self, engine: BehaviourSignalEngine) -> None:
        """When the absence extends to the final frame in the batch, is_ongoing is True."""
        pattern = [True, True, False, False, False]
        obs = _generate_timeline(len(pattern), face_detected_pattern=pattern)

        result = engine.analyze_observations("intv-absence-ongoing", obs)
        absence = [s for s in result.signals if s.signal_type == SignalType.FACE_ABSENCE][0]
        assert absence.status == SignalStatus.OBSERVED
        assert absence.metrics["is_ongoing"] is True
        assert "(ongoing)" in absence.explanation

    def test_custom_absence_threshold_respected(self) -> None:
        """Configuring min_absence_observations=5 suppresses a 3-frame run."""
        custom_config = BehaviourConfig(min_absence_observations=5)
        custom_engine = BehaviourSignalEngine(config=custom_config)

        pattern = [True, False, False, False, True]  # 3 absent frames
        obs = _generate_timeline(len(pattern), face_detected_pattern=pattern)

        result = custom_engine.analyze_observations("intv-custom-cfg", obs)
        absence = [s for s in result.signals if s.signal_type == SignalType.FACE_ABSENCE][0]
        assert absence.status == SignalStatus.NOT_OBSERVED


# ---------------------------------------------------------------------------
# 2. Multiple Face Presence Signal Tests (BEH-002)
# ---------------------------------------------------------------------------


class TestMultipleFacesSignal:
    @pytest.fixture
    def engine(self) -> BehaviourSignalEngine:
        return BehaviourSignalEngine()

    def test_multiple_faces_triggers_observed_signal(self, engine: BehaviourSignalEngine) -> None:
        """Multiple observations with face_count > 1 trigger an OBSERVED MULTIPLE_FACES signal."""
        # 1 face, 2 faces, 2 faces, 3 faces, 1 face
        pattern = [1, 2, 2, 3, 1]
        obs = _generate_timeline(len(pattern), face_count_pattern=pattern)

        result = engine.analyze_observations("intv-mf-1", obs)
        mf_signals = [s for s in result.signals if s.signal_type == SignalType.MULTIPLE_FACES]
        assert len(mf_signals) == 1

        mf = mf_signals[0]
        assert mf.status == SignalStatus.OBSERVED
        assert mf.observation_count == 3
        assert mf.metrics["multiple_faces_frames_count"] == 3
        assert mf.metrics["max_faces_observed"] == 3
        assert mf.metrics["start_sequence"] == 2
        assert mf.metrics["end_sequence"] == 4
        assert "Multiple faces were detected in 3 observations" in mf.explanation

    def test_isolated_single_frame_multiple_faces_suppressed(self, engine: BehaviourSignalEngine) -> None:
        """An isolated single frame with multiple faces is NOT reported as an established signal."""
        # 1 face, 2 faces (isolated), 1 face, 1 face
        pattern = [1, 2, 1, 1, 1]
        obs = _generate_timeline(len(pattern), face_count_pattern=pattern)

        result = engine.analyze_observations("intv-mf-isolated", obs)
        mf = [s for s in result.signals if s.signal_type == SignalType.MULTIPLE_FACES][0]
        assert mf.status == SignalStatus.NOT_OBSERVED
        assert mf.metrics.get("isolated_single_frame") is True

    def test_zero_multiple_faces_reported_as_not_observed(self, engine: BehaviourSignalEngine) -> None:
        pattern = [1, 1, 1, 1, 1]
        obs = _generate_timeline(len(pattern), face_count_pattern=pattern)

        result = engine.analyze_observations("intv-mf-none", obs)
        mf = [s for s in result.signals if s.signal_type == SignalType.MULTIPLE_FACES][0]
        assert mf.status == SignalStatus.NOT_OBSERVED
        assert mf.observation_count == 0


# ---------------------------------------------------------------------------
# 3. Face Presence Consistency Tests (BEH-001)
# ---------------------------------------------------------------------------


class TestFacePresenceConsistency:
    @pytest.fixture
    def engine(self) -> BehaviourSignalEngine:
        return BehaviourSignalEngine()

    def test_high_consistency_classification(self, engine: BehaviourSignalEngine) -> None:
        """10 out of 10 frames with detected face yields HIGH consistency (ratio=1.0)."""
        obs = _generate_timeline(10, face_detected_pattern=[True])

        result = engine.analyze_observations("intv-consistency-high", obs)
        consistency = [s for s in result.signals if s.signal_type == SignalType.FACE_PRESENCE_CONSISTENCY][0]
        assert consistency.status == SignalStatus.OBSERVED
        assert consistency.metrics["presence_ratio"] == 1.0
        assert consistency.metrics["classification"] == ConsistencyClassification.HIGH
        assert "100.0% presence ratio" in consistency.explanation

    def test_moderate_consistency_classification(self, engine: BehaviourSignalEngine) -> None:
        """8 out of 10 frames yields MODERATE consistency (ratio=0.8)."""
        pattern = [True, True, True, True, False, True, True, True, False, True]
        obs = _generate_timeline(10, face_detected_pattern=pattern)

        result = engine.analyze_observations("intv-consistency-mod", obs)
        consistency = [s for s in result.signals if s.signal_type == SignalType.FACE_PRESENCE_CONSISTENCY][0]
        assert consistency.status == SignalStatus.OBSERVED
        assert consistency.metrics["presence_ratio"] == 0.8
        assert consistency.metrics["classification"] == ConsistencyClassification.MODERATE

    def test_low_consistency_classification(self, engine: BehaviourSignalEngine) -> None:
        """4 out of 10 frames yields LOW consistency (ratio=0.4)."""
        pattern = [True, False, True, False, False, True, False, False, True, False]
        obs = _generate_timeline(10, face_detected_pattern=pattern)

        result = engine.analyze_observations("intv-consistency-low", obs)
        consistency = [s for s in result.signals if s.signal_type == SignalType.FACE_PRESENCE_CONSISTENCY][0]
        assert consistency.status == SignalStatus.OBSERVED
        assert consistency.metrics["presence_ratio"] == 0.4
        assert consistency.metrics["classification"] == ConsistencyClassification.LOW

    def test_insufficient_data_consistency(self, engine: BehaviourSignalEngine) -> None:
        """Fewer than 5 observations yields INSUFFICIENT_DATA."""
        obs = _generate_timeline(3, face_detected_pattern=[True])

        result = engine.analyze_observations("intv-consistency-few", obs)
        consistency = [s for s in result.signals if s.signal_type == SignalType.FACE_PRESENCE_CONSISTENCY][0]
        assert consistency.status == SignalStatus.INSUFFICIENT_DATA
        assert consistency.metrics["classification"] == ConsistencyClassification.INSUFFICIENT_DATA


# ---------------------------------------------------------------------------
# 4. Frame Quality Summary Tests (CV-SIG-006)
# ---------------------------------------------------------------------------


class TestFrameQualitySummary:
    @pytest.fixture
    def engine(self) -> BehaviourSignalEngine:
        return BehaviourSignalEngine()

    def test_excellent_frame_quality(self, engine: BehaviourSignalEngine) -> None:
        obs = _generate_timeline(10, grade_pattern=[FrameQualityGrade.GOOD])

        result = engine.analyze_observations("intv-quality-good", obs)
        quality = [s for s in result.signals if s.signal_type == SignalType.FRAME_QUALITY_SUMMARY][0]
        assert quality.status == SignalStatus.OBSERVED
        assert quality.metrics["good_ratio"] == 1.0
        assert quality.metrics["classification"] == QualityClassification.EXCELLENT

    def test_degraded_frame_quality_detected(self, engine: BehaviourSignalEngine) -> None:
        """50% degraded frames yields DEGRADED classification."""
        pattern = [FrameQualityGrade.GOOD, FrameQualityGrade.DEGRADED] * 5
        obs = _generate_timeline(10, grade_pattern=pattern)

        result = engine.analyze_observations("intv-quality-deg", obs)
        quality = [s for s in result.signals if s.signal_type == SignalType.FRAME_QUALITY_SUMMARY][0]
        assert quality.metrics["degraded_ratio"] == 0.5
        assert quality.metrics["classification"] == QualityClassification.DEGRADED

    def test_critical_unusable_frame_quality(self, engine: BehaviourSignalEngine) -> None:
        """60% unusable frames yields CRITICAL_UNUSABLE classification."""
        pattern = [FrameQualityGrade.UNUSABLE] * 6 + [FrameQualityGrade.GOOD] * 4
        obs = _generate_timeline(10, grade_pattern=pattern)

        result = engine.analyze_observations("intv-quality-unus", obs)
        quality = [s for s in result.signals if s.signal_type == SignalType.FRAME_QUALITY_SUMMARY][0]
        assert quality.metrics["unusable_ratio"] == 0.6
        assert quality.metrics["classification"] == QualityClassification.CRITICAL_UNUSABLE


# ---------------------------------------------------------------------------
# 5. Monitoring Data Quality Tests
# ---------------------------------------------------------------------------


class TestMonitoringDataQuality:
    @pytest.fixture
    def engine(self) -> BehaviourSignalEngine:
        return BehaviourSignalEngine()

    def test_continuous_stream_rated_sufficient(self, engine: BehaviourSignalEngine) -> None:
        obs = _generate_timeline(10)
        result = engine.analyze_observations("intv-stream-good", obs)
        mq = result.monitoring_quality
        assert mq.status == MonitoringReliability.SUFFICIENT
        assert mq.missing_sequence_count == 0
        assert mq.duplicate_observation_count == 0
        assert mq.sampling_gap_count == 0

    def test_missing_sequences_detected(self, engine: BehaviourSignalEngine) -> None:
        """Sequences 1, 2, 5, 6 -> missing 2 frames (seq 3, 4)."""
        t0 = datetime(2026, 11, 7, 7, 0, 0, tzinfo=timezone.utc)
        obs = [
            _make_obs(1, t0.isoformat()),
            _make_obs(2, (t0 + timedelta(seconds=1)).isoformat()),
            _make_obs(5, (t0 + timedelta(seconds=2)).isoformat()),
            _make_obs(6, (t0 + timedelta(seconds=3)).isoformat()),
        ]
        result = engine.analyze_observations("intv-stream-gaps", obs)
        mq = result.monitoring_quality
        assert mq.missing_sequence_count == 2

    def test_duplicate_observations_detected(self, engine: BehaviourSignalEngine) -> None:
        """Sequence 2 repeated twice."""
        t0 = datetime(2026, 11, 7, 7, 0, 0, tzinfo=timezone.utc)
        obs = [
            _make_obs(1, t0.isoformat()),
            _make_obs(2, (t0 + timedelta(seconds=1)).isoformat()),
            _make_obs(2, (t0 + timedelta(seconds=1)).isoformat()),
            _make_obs(3, (t0 + timedelta(seconds=2)).isoformat()),
        ]
        result = engine.analyze_observations("intv-stream-dup", obs)
        mq = result.monitoring_quality
        assert mq.duplicate_observation_count == 1

    def test_out_of_order_sequences_detected(self, engine: BehaviourSignalEngine) -> None:
        """Sequence delivered 1, 3, 2, 4."""
        t0 = datetime(2026, 11, 7, 7, 0, 0, tzinfo=timezone.utc)
        obs = [
            _make_obs(1, t0.isoformat()),
            _make_obs(3, (t0 + timedelta(seconds=2)).isoformat()),
            _make_obs(2, (t0 + timedelta(seconds=1)).isoformat()),
            _make_obs(4, (t0 + timedelta(seconds=3)).isoformat()),
        ]
        result = engine.analyze_observations("intv-stream-ooo", obs)
        mq = result.monitoring_quality
        assert mq.out_of_order_count >= 1

    def test_sampling_gap_detected(self, engine: BehaviourSignalEngine) -> None:
        """Timestamp delta of 5 seconds (> threshold of 3 seconds)."""
        t0 = datetime(2026, 11, 7, 7, 0, 0, tzinfo=timezone.utc)
        obs = [
            _make_obs(1, t0.isoformat()),
            _make_obs(2, (t0 + timedelta(seconds=6)).isoformat()),  # 6 second gap
            _make_obs(3, (t0 + timedelta(seconds=7)).isoformat()),
        ]
        result = engine.analyze_observations("intv-stream-gap", obs)
        mq = result.monitoring_quality
        assert mq.sampling_gap_count == 1

    def test_empty_observations_handled_safely(self, engine: BehaviourSignalEngine) -> None:
        result = engine.analyze_observations("intv-empty", [])
        assert result.status == "insufficient_data"
        assert result.total_observations_evaluated == 0
        assert result.monitoring_quality.status == MonitoringReliability.INSUFFICIENT_DATA


# ---------------------------------------------------------------------------
# 6. Session Tracker & State Isolation Tests
# ---------------------------------------------------------------------------


class TestSessionBehaviourTracker:
    def test_session_isolation(self) -> None:
        """Observations from session A must never mix into session B."""
        tracker = SessionBehaviourTracker()
        obs_a = _generate_timeline(5, interview_id="session-A")
        obs_b = _generate_timeline(4, interview_id="session-B")

        tracker.record_observations("session-A", obs_a)
        tracker.record_observations("session-B", obs_b)

        assert len(tracker.get_observations("session-A")) == 5
        assert len(tracker.get_observations("session-B")) == 4
        assert all(o.interview_id == "session-A" for o in tracker.get_observations("session-A"))
        assert all(o.interview_id == "session-B" for o in tracker.get_observations("session-B"))

    def test_session_deduplication(self) -> None:
        """Submitting the same observation twice does not duplicate it in session state."""
        tracker = SessionBehaviourTracker()
        obs = _generate_timeline(3, interview_id="session-dup")

        tracker.record_observations("session-dup", obs)
        tracker.record_observations("session-dup", obs)  # Duplicate submission

        assert len(tracker.get_observations("session-dup")) == 3

    def test_session_purging(self) -> None:
        """clear_session properly removes session state."""
        tracker = SessionBehaviourTracker()
        obs = _generate_timeline(3, interview_id="session-purge")
        tracker.record_observations("session-purge", obs)

        assert tracker.clear_session("session-purge") is True
        assert len(tracker.get_observations("session-purge")) == 0
        assert tracker.clear_session("session-purge") is False

    def test_bounded_memory_growth(self) -> None:
        """Tracker deque respects max_session_history limit."""
        config = BehaviourConfig(max_session_history=10)
        tracker = SessionBehaviourTracker(config=config)
        obs = _generate_timeline(25, interview_id="session-bounded")

        tracker.record_observations("session-bounded", obs)
        # Bounded at 10 observations
        assert len(tracker.get_observations("session-bounded")) == 10
        # Earliest retained sequence should be 16 (25 - 10 + 1)
        assert tracker.get_observations("session-bounded")[0].sequence_number == 16


# ---------------------------------------------------------------------------
# 7. FastAPI Integration Tests (/analysis/behaviour)
# ---------------------------------------------------------------------------


class TestBehaviourRoutes:
    @pytest.fixture(autouse=True)
    def clean_tracker(self) -> None:
        engine = get_behaviour_engine()
        engine.tracker.clear_all()
        yield
        engine.tracker.clear_all()

    def test_post_behaviour_analysis_success(self) -> None:
        with TestClient(app) as client:
            obs = _generate_timeline(6, interview_id="route-test-1")
            payload = {
                "interview_id": "route-test-1",
                "observations": [o.model_dump(mode="json") for o in obs],
                "track_session": True,
            }
            resp = client.post("/analysis/behaviour", json=payload)
            assert resp.status_code == 200
            data = resp.json()

            assert data["interview_id"] == "route-test-1"
            assert data["status"] == "ok"
            assert data["total_observations_evaluated"] == 6
            assert len(data["signals"]) >= 4
            assert data["monitoring_quality"]["status"] == "sufficient"

    def test_get_session_behaviour_success(self) -> None:
        with TestClient(app) as client:
            obs = _generate_timeline(5, interview_id="route-session-get")
            payload = {
                "interview_id": "route-session-get",
                "observations": [o.model_dump(mode="json") for o in obs],
                "track_session": True,
            }
            client.post("/analysis/behaviour", json=payload)

            # Retrieve accumulated session behaviour
            resp = client.get("/analysis/behaviour/route-session-get")
            assert resp.status_code == 200
            data = resp.json()
            assert data["interview_id"] == "route-session-get"
            assert data["total_observations_evaluated"] == 5

    def test_delete_session_behaviour_clears_state(self) -> None:
        with TestClient(app) as client:
            obs = _generate_timeline(4, interview_id="route-session-del")
            payload = {
                "interview_id": "route-session-del",
                "observations": [o.model_dump(mode="json") for o in obs],
                "track_session": True,
            }
            client.post("/analysis/behaviour", json=payload)

            # Clear session
            del_resp = client.delete("/analysis/behaviour/route-session-del")
            assert del_resp.status_code == 200
            assert "purged" in del_resp.json()["message"]

            # Query cleared session -> returns insufficient_data (0 frames)
            get_resp = client.get("/analysis/behaviour/route-session-del")
            assert get_resp.status_code == 200
            assert get_resp.json()["status"] == "insufficient_data"

    def test_openapi_includes_behaviour_routes(self) -> None:
        with TestClient(app) as client:
            schema = client.get("/openapi.json").json()
            paths = set(schema["paths"].keys())
            assert "/analysis/behaviour" in paths
            assert "/analysis/behaviour/{interview_id}" in paths

    def test_ready_includes_behaviour_analysis_component(self) -> None:
        with TestClient(app) as client:
            resp = client.get("/ready")
            assert resp.status_code == 200
            assert "behaviour-analysis" in resp.json()["components_ready"]


# ---------------------------------------------------------------------------
# 8. Privacy & Neutrality Constraints (Section 8)
# ---------------------------------------------------------------------------


class TestPrivacyAndNeutrality:
    @pytest.fixture
    def engine(self) -> BehaviourSignalEngine:
        return BehaviourSignalEngine()

    def test_no_prohibited_judgment_words_in_outputs(self, engine: BehaviourSignalEngine) -> None:
        """Strict Section 8 check: outputs must never contain cheating, fraud, or guilt terms."""
        # Generate varied observations: absence + multiple faces + degraded frames
        pattern_face = [True, False, False, False, True, True]
        pattern_count = [1, 0, 0, 0, 2, 2]
        pattern_grade = [FrameQualityGrade.GOOD, FrameQualityGrade.DEGRADED] * 3

        obs = _generate_timeline(
            6,
            face_detected_pattern=pattern_face,
            face_count_pattern=pattern_count,
            grade_pattern=pattern_grade,
        )

        result = engine.analyze_observations("privacy-check-intv", obs)
        dump_str = result.model_dump_json().lower()

        prohibited_words = [
            "cheat",
            "fraud",
            "suspicious",
            "dishonest",
            "guilty",
            "deception",
            "malice",
            "unauthorized material",
            "disqualified",
        ]

        for word in prohibited_words:
            assert word not in dump_str, f"Ethical violation: prohibited term '{word}' found in output."

    def test_no_raw_image_data_retained(self, engine: BehaviourSignalEngine) -> None:
        """Result must contain only metadata and metrics, never raw pixel or base64 data."""
        obs = _generate_timeline(5)
        result = engine.analyze_observations("privacy-no-images", obs)
        d = result.model_dump()

        def _check_no_large_strings(obj: object, path: str = "") -> None:
            if isinstance(obj, dict):
                for k, v in obj.items():
                    _check_no_large_strings(v, f"{path}.{k}")
            elif isinstance(obj, list):
                for idx, v in enumerate(obj):
                    _check_no_large_strings(v, f"{path}[{idx}]")
            elif isinstance(obj, str) and len(obj) > 500:
                pytest.fail(f"Potential raw payload leak at {path}: length {len(obj)}")

        _check_no_large_strings(d)

