"""Controlled AI Evaluation Runner for Phase 21.

Executes deterministic, version-tagged ground-truth test scenarios covering
all supported MVP signals:
- Single face presence (BEH-001)
- Multiple faces (BEH-002)
- Face absence (BEH-003)
- Frame quality / blur / low-light degradation (CV-SIG-006 & monitoring data quality)
- Edge/negative cases (blank frames, occlusion/partial face, rapid state transitions, replay idempotency)

Hard Rule: NEVER INVENT METRICS. Every metric, confusion matrix cell, and
latency figure is computed directly from executing the actual CV and behaviour code.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.computer_vision.engine import CVAnalysisEngine
from app.services.computer_vision.face_detector import FaceDetectorRegistry, SCORE_THRESHOLD
from app.services.computer_vision.schemas import (
    AnalysisStatus,
    CVAnalysisResult,
    DetectedFace,
    BoundingBox,
    FrameQualityGrade,
    FrameQualityMetrics,
)
from app.services.behaviour.engine import BehaviourSignalEngine
from app.services.behaviour.schemas import SignalType, SignalStatus


def _safe_div(n: int, d: int) -> Optional[float]:
    return round(n / d, 4) if d > 0 else None


def _calc_metrics(tp: int, fp: int, tn: int, fn: int) -> Dict[str, Any]:
    prec = _safe_div(tp, tp + fp)
    rec = _safe_div(tp, tp + fn)
    f1 = round(2 * prec * rec / (prec + rec), 4) if (prec is not None and rec is not None and (prec + rec) > 0) else None
    fpr = _safe_div(fp, fp + tn)
    fnr = _safe_div(fn, fn + tp)
    acc = _safe_div(tp + tn, tp + fp + tn + fn)
    return {
        "true_positives": tp,
        "false_positives": fp,
        "true_negatives": tn,
        "false_negatives": fn,
        "total": tp + fp + tn + fn,
        "precision": prec,
        "recall": rec,
        "f1_score": f1,
        "false_positive_rate": fpr,
        "false_negative_rate": fnr,
        "accuracy": acc,
    }


def make_synthetic_cv_obs(
    seq: int,
    ts_sec: int,
    face_count: int = 1,
    grade: FrameQualityGrade = FrameQualityGrade.GOOD,
    blur: float = 150.0,
    brightness: float = 120.0,
) -> CVAnalysisResult:
    return CVAnalysisResult(
        analysis_id=f"cv_synth_{seq}",
        interview_id="eval-session",
        sequence_number=seq,
        frame_timestamp=f"2026-11-21T00:00:{ts_sec:02d}.000Z",
        status=AnalysisStatus.OK,
        frame_quality=FrameQualityMetrics(
            grade=grade,
            blur_score=blur,
            brightness_mean=brightness,
            width_px=640,
            height_px=360,
        ),
        face_detected=(face_count > 0),
        face_count=face_count,
        multiple_faces_detected=(face_count > 1),
        detected_faces=[
            DetectedFace(
                bounding_box=BoundingBox(
                    x=round(0.15 + (i * 0.35), 2),
                    y=0.25,
                    width=0.22,
                    height=0.32,
                ),
                confidence=0.92,
                face_index=i,
            )
            for i in range(face_count)
        ],
    )


async def run_evaluation(manifest_path: Path) -> Dict[str, Any]:
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    # 1. Initialize Engines
    FaceDetectorRegistry.initialise()
    cv_engine = CVAnalysisEngine()
    beh_engine = BehaviourSignalEngine()

    # ---------------------------------------------------------
    # PART 1: Computer Vision Fixture Evaluation
    # ---------------------------------------------------------
    cv_fixtures = manifest.get("cv_fixtures", [])
    cv_latencies_ms: List[float] = []
    cv_results: List[Dict[str, Any]] = []

    # Confusion matrix for Multiple Faces detection at frame level (CV-SIG-002)
    mf_tp = mf_fp = mf_tn = mf_fn = 0
    # Confusion matrix for Any Face detection at frame level (CV-SIG-001)
    face_tp = face_fp = face_tn = face_fn = 0

    for idx, item in enumerate(cv_fixtures, start=1):
        rel_path = item["file"]
        file_path = ROOT / rel_path
        if not file_path.exists():
            raise FileNotFoundError(f"Fixture file not found: {file_path}")

        img_bytes = file_path.read_bytes()
        b64_data = base64.b64encode(img_bytes).decode()

        t0 = time.perf_counter()
        cv_res = await cv_engine.analyse_frame(
            interview_id="phase21-eval",
            sequence_number=idx,
            frame_timestamp="2026-11-21T00:00:00.000Z",
            frame_data=b64_data,
        )
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        cv_latencies_ms.append(elapsed_ms)

        detected_faces = cv_res.face_count or 0
        pred_multiple = bool(cv_res.multiple_faces_detected)
        actual_multiple = bool(item["multiple_faces"])

        pred_face_present = bool(cv_res.face_detected)
        actual_face_present = (item["expected_faces"] > 0)

        # Multi-face confusion
        if pred_multiple and actual_multiple:
            mf_tp += 1
        elif pred_multiple and not actual_multiple:
            mf_fp += 1
        elif not pred_multiple and actual_multiple:
            mf_fn += 1
        else:
            mf_tn += 1

        # Single/any face confusion
        if pred_face_present and actual_face_present:
            face_tp += 1
        elif pred_face_present and not actual_face_present:
            face_fp += 1
        elif not pred_face_present and actual_face_present:
            face_fn += 1
        else:
            face_tn += 1

        cv_results.append({
            "id": item["id"],
            "category": item.get("category", "general"),
            "file": rel_path,
            "expected_faces": item["expected_faces"],
            "detected_faces": cv_res.face_count,
            "expected_multiple": actual_multiple,
            "detected_multiple": pred_multiple,
            "analysis_status": cv_res.status.value,
            "quality_grade": cv_res.frame_quality.grade.value if cv_res.frame_quality else "none",
            "latency_ms": elapsed_ms,
        })

    cv_mf_metrics = _calc_metrics(mf_tp, mf_fp, mf_tn, mf_fn)
    cv_face_metrics = _calc_metrics(face_tp, face_fp, face_tn, face_fn)

    # ---------------------------------------------------------
    # PART 2: Behaviour Analysis Temporal Scenarios Evaluation
    # ---------------------------------------------------------
    beh_scenarios = manifest.get("behaviour_scenarios", [])
    beh_latencies_ms: List[float] = []
    beh_scenario_results: List[Dict[str, Any]] = []

    # Confusion matrix for BEH-002 (MULTIPLE_FACES)
    b_mf_tp = b_mf_fp = b_mf_tn = b_mf_fn = 0
    # Confusion matrix for BEH-003 (FACE_ABSENCE)
    b_abs_tp = b_abs_fp = b_abs_tn = b_abs_fn = 0
    # Confusion matrix for BEH-001 (LOW_PRESENCE_ANOMALY)
    b_low_pres_tp = b_low_pres_fp = b_low_pres_tn = b_low_pres_fn = 0
    # Confusion matrix for CV-SIG-006 (DEGRADED_QUALITY_ANOMALY)
    b_deg_qual_tp = b_deg_qual_fp = b_deg_qual_tn = b_deg_qual_fn = 0
    # Confusion matrix for MONITORING_DATA_QUALITY (SAMPLING_GAP_ANOMALY)
    b_gap_tp = b_gap_fp = b_gap_tn = b_gap_fn = 0

    idempotency_verified = True

    for scenario in beh_scenarios:
        s_id = scenario["id"]
        obs_list: List[CVAnalysisResult] = []

        if s_id == "beh-01-continuous-presence":
            obs_list = [make_synthetic_cv_obs(i, i, face_count=1) for i in range(1, 11)]
        elif s_id == "beh-02-multiple-faces-burst":
            obs_list = [make_synthetic_cv_obs(i, i, face_count=(2 if 4 <= i <= 6 else 1)) for i in range(1, 11)]
        elif s_id == "beh-03-face-absence-run":
            # 4 consecutive absent frames (duration 4s > 2.5s) in a 14-frame window (10 present / 14 = 71.4% -> Moderate consistency)
            pattern_s3 = [1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1]
            obs_list = [make_synthetic_cv_obs(i, i, face_count=pattern_s3[i - 1]) for i in range(1, 15)]
        elif s_id == "beh-04-blink-suppression":
            # 1 single absent frame (blink) in middle (suppressed by min_absence_observations=3)
            obs_list = [make_synthetic_cv_obs(i, i, face_count=(0 if i == 5 else 1)) for i in range(1, 11)]
        elif s_id == "beh-05-transient-glitch-suppression":
            # 1 single multi-face artifact frame in middle (suppressed by min_multiple_faces_observations=2)
            obs_list = [make_synthetic_cv_obs(i, i, face_count=(2 if i == 5 else 1)) for i in range(1, 11)]
        elif s_id == "beh-06-quality-degradation":
            # 5 out of 10 frames degraded (degraded ratio 0.50 >= 0.40)
            obs_list = [
                make_synthetic_cv_obs(
                    i,
                    i,
                    face_count=1,
                    grade=(FrameQualityGrade.DEGRADED if i <= 5 else FrameQualityGrade.GOOD),
                    blur=(40.0 if i <= 5 else 150.0),
                )
                for i in range(1, 11)
            ]
        elif s_id == "beh-07-sampling-gap":
            # seq 1,2,3 at 1,2,3s, then seq 7,8 at 8,9s (gap of 5s > 3s threshold)
            obs_list = [
                make_synthetic_cv_obs(1, 1, 1),
                make_synthetic_cv_obs(2, 2, 1),
                make_synthetic_cv_obs(3, 3, 1),
                make_synthetic_cv_obs(7, 8, 1),
                make_synthetic_cv_obs(8, 9, 1),
            ]
        elif s_id == "beh-08-low-presence-continuity":
            # Interleaved pattern [1, 0, 0, 1, 0, 0, 1, 0, 1, 0]: 40% presence (low) without 3 consecutive absences
            pattern = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0]
            obs_list = [make_synthetic_cv_obs(i, i, face_count=pattern[i - 1]) for i in range(1, 11)]
        elif s_id == "beh-09-moderate-presence-continuity":
            # 8 present frames, 2 absent frames (80% in 70-89% moderate bracket)
            pattern = [1, 1, 0, 1, 1, 1, 0, 1, 1, 1]
            obs_list = [make_synthetic_cv_obs(i, i, face_count=pattern[i - 1]) for i in range(1, 11)]
        elif s_id == "beh-10-idempotent-replay":
            obs_list = [make_synthetic_cv_obs(i, i, face_count=(2 if 3 <= i <= 5 else 1)) for i in range(1, 11)]

        t0 = time.perf_counter()
        beh_res = beh_engine.analyze_observations(f"eval-{s_id}", obs_list)
        elapsed_beh_ms = round((time.perf_counter() - t0) * 1000, 2)
        beh_latencies_ms.append(elapsed_beh_ms)

        # Idempotency check for scenario 10
        if s_id == "beh-10-idempotent-replay":
            beh_res_repeat = beh_engine.analyze_observations(f"eval-{s_id}", obs_list)
            if [s.model_dump() for s in beh_res.signals] != [s.model_dump() for s in beh_res_repeat.signals]:
                idempotency_verified = False

        signals_map = {s.signal_type.value: s for s in beh_res.signals}

        # 1. Multi-Face signal evaluation (Target in beh-02, beh-10)
        obs_mf = signals_map.get("MULTIPLE_FACES")
        is_mf_observed = (obs_mf is not None and obs_mf.status.value == "observed")
        target_mf = (s_id in ["beh-02-multiple-faces-burst", "beh-10-idempotent-replay"])
        if is_mf_observed and target_mf:
            b_mf_tp += 1
        elif is_mf_observed and not target_mf:
            b_mf_fp += 1
        elif not is_mf_observed and target_mf:
            b_mf_fn += 1
        else:
            b_mf_tn += 1

        # 2. Face Absence signal evaluation (Target in beh-03)
        obs_abs = signals_map.get("FACE_ABSENCE")
        is_abs_observed = (obs_abs is not None and obs_abs.status.value == "observed")
        target_abs = (s_id == "beh-03-face-absence-run")
        if is_abs_observed and target_abs:
            b_abs_tp += 1
        elif is_abs_observed and not target_abs:
            b_abs_fp += 1
        elif not is_abs_observed and target_abs:
            b_abs_fn += 1
        else:
            b_abs_tn += 1

        # 3. Low Presence Continuity Anomaly evaluation (Target in beh-08)
        obs_pres = signals_map.get("FACE_PRESENCE_CONSISTENCY")
        pres_class = obs_pres.metrics.get("classification") if (obs_pres and obs_pres.metrics) else ""
        is_low_pres = (str(pres_class).lower() in ["low", "consistencyclassification.low"])
        target_low_pres = (s_id == "beh-08-low-presence-continuity")
        if is_low_pres and target_low_pres:
            b_low_pres_tp += 1
        elif is_low_pres and not target_low_pres:
            b_low_pres_fp += 1
        elif not is_low_pres and target_low_pres:
            b_low_pres_fn += 1
        else:
            b_low_pres_tn += 1

        # 4. Frame Quality Degradation Anomaly evaluation (Target in beh-06)
        obs_qual = signals_map.get("FRAME_QUALITY_SUMMARY")
        qual_class = obs_qual.metrics.get("classification") if (obs_qual and obs_qual.metrics) else ""
        is_deg_qual = (str(qual_class).lower() in ["degraded", "qualityclassification.degraded", "critical_unusable"])
        target_deg_qual = (s_id == "beh-06-quality-degradation")
        if is_deg_qual and target_deg_qual:
            b_deg_qual_tp += 1
        elif is_deg_qual and not target_deg_qual:
            b_deg_qual_fp += 1
        elif not is_deg_qual and target_deg_qual:
            b_deg_qual_fn += 1
        else:
            b_deg_qual_tn += 1

        # 5. Monitoring Data Quality Sampling Gap evaluation (Target in beh-07)
        obs_gap = beh_res.monitoring_quality
        is_gap_detected = (obs_gap.status.value in ["degraded", "unreliable"] or obs_gap.sampling_gap_count > 0 or obs_gap.missing_sequence_count > 0)
        target_gap = (s_id == "beh-07-sampling-gap")
        if is_gap_detected and target_gap:
            b_gap_tp += 1
        elif is_gap_detected and not target_gap:
            b_gap_fp += 1
        elif not is_gap_detected and target_gap:
            b_gap_fn += 1
        else:
            b_gap_tn += 1

        beh_scenario_results.append({
            "id": s_id,
            "name": scenario["name"],
            "signal_under_test": scenario["signal_under_test"],
            "frames_evaluated": len(obs_list),
            "signals_produced": {s.signal_type.value: {"status": s.status.value, "metrics": s.metrics} for s in beh_res.signals},
            "latency_ms": elapsed_beh_ms,
        })

    beh_mf_metrics = _calc_metrics(b_mf_tp, b_mf_fp, b_mf_tn, b_mf_fn)
    beh_abs_metrics = _calc_metrics(b_abs_tp, b_abs_fp, b_abs_tn, b_abs_fn)
    beh_low_pres_metrics = _calc_metrics(b_low_pres_tp, b_low_pres_fp, b_low_pres_tn, b_low_pres_fn)
    beh_deg_qual_metrics = _calc_metrics(b_deg_qual_tp, b_deg_qual_fp, b_deg_qual_tn, b_deg_qual_fn)
    beh_gap_metrics = _calc_metrics(b_gap_tp, b_gap_fp, b_gap_tn, b_gap_fn)

    # ---------------------------------------------------------
    # Final Structured Aggregation
    # ---------------------------------------------------------
    report_data = {
        "evaluation_timestamp": datetime.now(timezone.utc).isoformat(),
        "dataset_id": manifest["dataset_id"],
        "annotation_rule_version": manifest["annotation_rule_version"],
        "model_metadata": {
            "name": manifest["model"]["name"],
            "file": manifest["model"]["file"],
            "score_threshold": SCORE_THRESHOLD,
        },
        "publishable_evaluation": True,
        "sample_size": {
            "cv_fixtures_evaluated": len(cv_fixtures),
            "behaviour_scenarios_evaluated": len(beh_scenarios),
            "total_frames_evaluated": len(cv_fixtures) + sum(len(s.get("frames_evaluated", [])) if isinstance(s.get("frames_evaluated"), list) else s["frames_evaluated"] for s in beh_scenario_results),
            "meets_minimum_sample_size": len(cv_fixtures) >= manifest.get("minimum_publishable_examples", 30),
        },
        "metrics_summary": {
            "cv_multiple_faces": cv_mf_metrics,
            "cv_face_presence": cv_face_metrics,
            "behaviour_multiple_faces": beh_mf_metrics,
            "behaviour_face_absence": beh_abs_metrics,
            "behaviour_low_presence_continuity": beh_low_pres_metrics,
            "behaviour_degraded_frame_quality": beh_deg_qual_metrics,
            "behaviour_sampling_gaps": beh_gap_metrics,
            "idempotent_replay_verified": idempotency_verified,
        },
        "latency_benchmarks_ms": {
            "cv_frame_inference": {
                "min": min(cv_latencies_ms),
                "median": round(statistics.median(cv_latencies_ms), 2),
                "p95": round(statistics.quantiles(cv_latencies_ms, n=20)[18], 2),
                "max": max(cv_latencies_ms),
            },
            "behaviour_endpoint_batch": {
                "min": min(beh_latencies_ms),
                "median": round(statistics.median(beh_latencies_ms), 2),
                "p95": round(statistics.quantiles(beh_latencies_ms, n=20)[18], 2) if len(beh_latencies_ms) >= 20 else max(beh_latencies_ms),
                "max": max(beh_latencies_ms),
            },
        },
        "cv_fixtures_detail": cv_results,
        "behaviour_scenarios_detail": beh_scenario_results,
    }

    return report_data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=ROOT / "evaluation/phase21-controlled-eval-v1.0.json",
        help="Path to evaluation manifest JSON",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT.parent / "docs/evaluation/evaluation_results.json",
        help="Destination path for structured evaluation results JSON",
    )
    args = parser.parse_args()

    results = asyncio.run(run_evaluation(args.manifest))

    # Ensure parent output directory exists
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    # Print summary
    print("\n" + "=" * 78)
    print("CONTROLLED AI EVALUATION REPORT (Phase 21)")
    print("=" * 78)
    print(f"Dataset ID:                {results['dataset_id']}")
    print(f"Model / Threshold:         {results['model_metadata']['name']} (score_threshold={results['model_metadata']['score_threshold']})")
    print(f"CV Fixtures Evaluated:     {results['sample_size']['cv_fixtures_evaluated']} (meets >= 30: {results['sample_size']['meets_minimum_sample_size']})")
    print(f"Behaviour Scenarios:       {results['sample_size']['behaviour_scenarios_evaluated']}")
    print(f"Total Frames Evaluated:    {results['sample_size']['total_frames_evaluated']}")
    print(f"Idempotent Replay Match:   {results['metrics_summary']['idempotent_replay_verified']}")
    print("-" * 78)
    print("MEASURED DETECTION METRICS:")
    print("-" * 78)
    for name, m in results["metrics_summary"].items():
        if isinstance(m, dict) and "precision" in m:
            print(f"• {name:32} | TP={m['true_positives']} FP={m['false_positives']} TN={m['true_negatives']} FN={m['false_negatives']} | Prec={m['precision']} Rec={m['recall']} F1={m['f1_score']} FPR={m['false_positive_rate']}")
    print("-" * 78)
    print("MEASURED LATENCY BENCHMARKS (ms):")
    print(f"• CV Frame Inference:      Median={results['latency_benchmarks_ms']['cv_frame_inference']['median']}ms, P95={results['latency_benchmarks_ms']['cv_frame_inference']['p95']}ms, Max={results['latency_benchmarks_ms']['cv_frame_inference']['max']}ms")
    print(f"• Behaviour Analysis:      Median={results['latency_benchmarks_ms']['behaviour_endpoint_batch']['median']}ms, Max={results['latency_benchmarks_ms']['behaviour_endpoint_batch']['max']}ms")
    print("=" * 78)
    print(f"Results written to: {args.output}\n")


if __name__ == "__main__":
    main()
