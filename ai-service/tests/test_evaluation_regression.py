"""Automated Regression Suite for Phase 21 Controlled AI Evaluation.

Locks in baseline thresholds, detection accuracy, precision/recall expectations,
and latency upper bounds across both Computer Vision and Behaviour Analysis engines.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
import pytest

from scripts.run_ai_evaluation import run_evaluation, ROOT

MANIFEST_PATH = ROOT / "evaluation/phase21-controlled-eval-v1.0.json"


@pytest.fixture(scope="module")
def eval_results():
    """Executes the full controlled evaluation runner once for the regression suite."""
    return asyncio.run(run_evaluation(MANIFEST_PATH))


def test_cv_dataset_minimum_sample_size(eval_results):
    """Asserts that the controlled evaluation dataset meets the required sample size (>=30)."""
    cv_count = eval_results["sample_size"]["cv_fixtures_evaluated"]
    assert cv_count >= 30, f"Expected at least 30 CV fixtures, got {cv_count}"
    assert eval_results["sample_size"]["meets_minimum_sample_size"] is True


def test_cv_multi_face_precision_recall_baseline(eval_results):
    """Locks multi-face detection precision and recall baselines on controlled fixtures."""
    mf = eval_results["metrics_summary"]["cv_multiple_faces"]
    assert mf["precision"] == 1.0, f"Multi-face precision degraded below 1.0: {mf['precision']}"
    assert mf["recall"] == 1.0, f"Multi-face recall degraded below 1.0: {mf['recall']}"
    assert mf["false_positives"] == 0, f"Expected 0 false positives for multiple faces, got {mf['false_positives']}"
    assert mf["false_negatives"] == 0, f"Expected 0 false negatives for multiple faces, got {mf['false_negatives']}"


def test_cv_zero_false_positives_on_non_face_scenes(eval_results):
    """Verifies that non-face scenes (empty desk, wall clock, shapes, noise) produce zero false face detections."""
    cv_details = eval_results["cv_fixtures_detail"]
    non_face_categories = [d for d in cv_details if d["category"] == "absence"]
    assert len(non_face_categories) >= 8

    for d in non_face_categories:
        detected = d["detected_faces"] or 0
        assert detected == 0, f"Fixture {d['id']} falsely detected {detected} face(s)"
        assert d["detected_multiple"] is False


def test_cv_extreme_blur_and_unusable_handling(eval_results):
    """Verifies that extreme blur degrades quality and flat solid frames are marked unusable/skipped."""
    cv_details = {d["id"]: d for d in eval_results["cv_fixtures_detail"]}

    # Extreme blur fixture
    assert "cv-10-single-heavy-blur" in cv_details
    assert cv_details["cv-10-single-heavy-blur"]["quality_grade"] == "degraded"

    # Solid flat frames skipped / unusable
    for fid in ["cv-25-absence-black", "cv-26-absence-gray", "cv-27-absence-white"]:
        assert cv_details[fid]["analysis_status"] == "skipped"
        assert cv_details[fid]["quality_grade"] == "unusable"


def test_behaviour_multiple_faces_precision_recall(eval_results):
    """Locks temporal multiple-faces signal (BEH-002) precision and recall."""
    b_mf = eval_results["metrics_summary"]["behaviour_multiple_faces"]
    assert b_mf["precision"] == 1.0, f"BEH-002 precision degraded: {b_mf['precision']}"
    assert b_mf["recall"] == 1.0, f"BEH-002 recall degraded: {b_mf['recall']}"
    assert b_mf["false_positives"] == 0


def test_behaviour_face_absence_precision_recall(eval_results):
    """Locks temporal face absence signal (BEH-003) precision and recall."""
    b_abs = eval_results["metrics_summary"]["behaviour_face_absence"]
    assert b_abs["precision"] == 1.0, f"BEH-003 precision degraded: {b_abs['precision']}"
    assert b_abs["recall"] == 1.0, f"BEH-003 recall degraded: {b_abs['recall']}"
    assert b_abs["false_positives"] == 0


def test_behaviour_blink_suppression_zero_false_alarms(eval_results):
    """Verifies that a single-frame blink does NOT trigger a face absence signal (0 false alarms)."""
    scenarios = {s["id"]: s for s in eval_results["behaviour_scenarios_detail"]}
    blink_s = scenarios["beh-04-blink-suppression"]
    abs_signal = blink_s["signals_produced"].get("FACE_ABSENCE")
    assert abs_signal is not None
    assert abs_signal["status"] == "not_observed", "Single-frame blink was incorrectly flagged as face absence"


def test_behaviour_multi_face_glitch_suppression_zero_false_alarms(eval_results):
    """Verifies that a single-frame multi-face artifact is suppressed by min_multiple_faces_observations=2."""
    scenarios = {s["id"]: s for s in eval_results["behaviour_scenarios_detail"]}
    glitch_s = scenarios["beh-05-transient-glitch-suppression"]
    mf_signal = glitch_s["signals_produced"].get("MULTIPLE_FACES")
    assert mf_signal is not None
    assert mf_signal["status"] == "not_observed", "Single-frame artifact was incorrectly flagged as multiple faces"


def test_behaviour_sampling_gap_detection(eval_results):
    """Verifies that temporal sampling gaps > 3000ms are correctly detected."""
    b_gap = eval_results["metrics_summary"]["behaviour_sampling_gaps"]
    assert b_gap["precision"] == 1.0
    assert b_gap["recall"] == 1.0


def test_behaviour_presence_continuity_classification(eval_results):
    """Verifies presence continuity classification brackets: high (>=90%), moderate (70-89%), low (<70%)."""
    scenarios = {s["id"]: s for s in eval_results["behaviour_scenarios_detail"]}

    high_s = scenarios["beh-01-continuous-presence"]["signals_produced"]["FACE_PRESENCE_CONSISTENCY"]
    assert str(high_s["metrics"]["classification"]).lower() in ["high", "consistencyclassification.high"]

    mod_s = scenarios["beh-09-moderate-presence-continuity"]["signals_produced"]["FACE_PRESENCE_CONSISTENCY"]
    assert str(mod_s["metrics"]["classification"]).lower() in ["moderate", "consistencyclassification.moderate"]

    low_s = scenarios["beh-08-low-presence-continuity"]["signals_produced"]["FACE_PRESENCE_CONSISTENCY"]
    assert str(low_s["metrics"]["classification"]).lower() in ["low", "consistencyclassification.low"]


def test_idempotent_replay_determinism(eval_results):
    """Verifies that re-evaluating observation streams produces deterministic, identical outputs."""
    assert eval_results["metrics_summary"]["idempotent_replay_verified"] is True


def test_latency_regression_bounds(eval_results):
    """Asserts that per-frame CV and behaviour analysis latencies remain safely within SLA bounds."""
    cv_lat = eval_results["latency_benchmarks_ms"]["cv_frame_inference"]
    beh_lat = eval_results["latency_benchmarks_ms"]["behaviour_endpoint_batch"]

    # At 1 fps, per-frame CV median must remain well below 50ms
    assert cv_lat["median"] < 50.0, f"CV median latency exceeded 50ms SLA: {cv_lat['median']}ms"
    assert cv_lat["max"] < 250.0, f"CV max latency exceeded 250ms threshold: {cv_lat['max']}ms"

    # In-memory behaviour signal extraction must be instantaneous (< 10ms)
    assert beh_lat["median"] < 10.0, f"Behaviour median latency exceeded 10ms SLA: {beh_lat['median']}ms"
