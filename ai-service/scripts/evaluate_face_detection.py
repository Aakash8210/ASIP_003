"""Run the Phase 21 controlled face-count evaluation manifest.

This command evaluates only the labels defined in the manifest.  It emits a
machine-readable confusion matrix and latency summary, but marks an
undersized or non-consented dataset as *not publishable*.  It must not be used
to claim model performance until a consented, versioned dataset meets the
minimum sample size stated in its manifest.

Run from ``ai-service``:
    venv/bin/python scripts/evaluate_face_detection.py
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.computer_vision.engine import CVAnalysisEngine  # noqa: E402
from app.services.computer_vision.face_detector import (  # noqa: E402
    SCORE_THRESHOLD,
    FaceDetectorRegistry,
)


def _safe_divide(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 6) if denominator else None


async def evaluate(manifest_path: Path) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text())
    examples = manifest["examples"]
    FaceDetectorRegistry.initialise()
    engine = CVAnalysisEngine()
    confusion = {"true_positive": 0, "false_positive": 0, "true_negative": 0, "false_negative": 0}
    latencies: list[float] = []
    example_results: list[dict[str, Any]] = []

    for sequence_number, example in enumerate(examples, start=1):
        image_path = ROOT / example["file"]
        started = perf_counter()
        result = await engine.analyse_frame(
            interview_id="phase21-evaluation",
            sequence_number=sequence_number,
            frame_timestamp=datetime.now(timezone.utc).isoformat(),
            frame_data=base64.b64encode(image_path.read_bytes()).decode(),
            declared_format="image/jpeg",
        )
        elapsed_ms = round((perf_counter() - started) * 1000, 2)
        predicted_positive = result.multiple_faces_detected
        actual_positive = example["multiple_faces_present"]
        if predicted_positive and actual_positive:
            confusion["true_positive"] += 1
        elif predicted_positive:
            confusion["false_positive"] += 1
        elif actual_positive:
            confusion["false_negative"] += 1
        else:
            confusion["true_negative"] += 1
        latencies.append(elapsed_ms)
        example_results.append({
            "id": example["id"],
            "expected_face_count": example["expected_face_count"],
            "detected_face_count": result.face_count,
            "multiple_faces_present": actual_positive,
            "multiple_faces_detected": predicted_positive,
            "analysis_status": result.status.value,
            "end_to_end_latency_ms": elapsed_ms,
        })

    tp, fp, tn, fn = (confusion[key] for key in ("true_positive", "false_positive", "true_negative", "false_negative"))
    precision = _safe_divide(tp, tp + fp)
    recall = _safe_divide(tp, tp + fn)
    f1 = round(2 * precision * recall / (precision + recall), 6) if precision is not None and recall is not None and precision + recall else None
    consented = all(item.get("consent_status", "").startswith("consented") for item in examples)
    publishable = len(examples) >= manifest["minimum_publishable_examples"] and consented

    return {
        "dataset_id": manifest["dataset_id"],
        "annotation_rule_version": manifest["annotation_rule_version"],
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "model": {**manifest["model"], "score_threshold": SCORE_THRESHOLD},
        "examples_evaluated": len(examples),
        "minimum_publishable_examples": manifest["minimum_publishable_examples"],
        "publishable": publishable,
        "publication_blockers": ([] if publishable else ["insufficient consented examples; do not claim these metrics as model performance"]),
        "confusion_matrix": confusion,
        "diagnostic_metrics": {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "false_positive_rate": _safe_divide(fp, fp + tn),
            "false_negative_rate": _safe_divide(fn, fn + tp),
        },
        "latency_ms": {"median": round(statistics.median(latencies), 2), "max": max(latencies)},
        "examples": example_results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=ROOT / "evaluation/phase21-face-count-v0.1.json")
    args = parser.parse_args()
    print(json.dumps(asyncio.run(evaluate(args.manifest)), indent=2))


if __name__ == "__main__":
    main()
