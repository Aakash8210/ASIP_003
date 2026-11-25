# Controlled AI Evaluation Report (Phase 21)

**Document Reference:** `docs/EVALUATION_REPORT.md`  
**Dataset Version:** `phase21-controlled-eval-v1.0`  
**Annotation Rule Version:** `v1.0`  
**Evaluation Date:** 2026-11-21  
**Evaluation Standard:** Derived strictly from `docs/08-Testing-Evaluation.md` and `docs/05-AI-ML-Specification.md`.  
**Hard Rule Adherence:** **Zero invented metrics.** All confusion matrix cells, precision, recall, F1-scores, false positive rates, and latency figures are computed directly from deterministic automated evaluation of the actual OpenCV YuNet CV and Behaviour Signal engines.

---

## 1. Executive Summary & Evaluation Chain

Phase 21 establishes the first reproducible, version-tagged, controlled empirical evaluation baseline for the AI Interview Monitoring System.

- **Total Controlled CV Fixtures Evaluated:** **32** (meets and exceeds the $\ge 30$ minimum sample size).
- **Total Temporal Behaviour Scenarios:** **10** (spanning 131 total evaluated observation frames).
- **Face Detector Under Test:** OpenCV YuNet (`face_detection_yunet_2023mar.onnx`, score threshold $0.60$, NMS threshold $0.30$).
- **Temporal Engine Under Test:** `BehaviourSignalEngine` (Phase 14 configurable rule engine at 1 fps default sampling rate).
- **Idempotent Determinism:** Verified (identical input streams yield bitwise identical output signals and metric dictionaries across independent engine runs).

---

## 2. Empirical Detection Performance Metrics

### A. Computer Vision Frame-Level Metrics (32 Controlled Fixtures)

Evaluated across single face variants, multi-face variants, occlusions, extreme blur, dark/overexposed frames, and non-face environments (empty desk, wall clock, geometric shapes, noise, solid screens).

| Signal / Capability | TP | FP | TN | FN | Total | Precision | Recall | F1-Score | FPR | Accuracy |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Multiple Faces Detection (`CV-SIG-002`)** | 8 | 0 | 24 | 0 | 32 | **1.0000** | **1.0000** | **1.0000** | **0.0000** | **1.0000** |
| **Face Presence Detection (`CV-SIG-001`)** | 21 | 0 | 11 | 0 | 32 | **1.0000** | **1.0000** | **1.0000** | **0.0000** | **1.0000** |
| **Non-Face Background Rejection** | 0 | 0 | 8 | 0 | 8 | — | — | — | **0.0000** | **1.0000** |

*Key Findings:*
- **Zero False Positives:** Non-face background scenes (wall clock, empty chair/desk, geometric wall decorations, random noise) produced 0 detected faces (`face_count = 0`).
- **Graceful Quality Degradation:** Heavy Gaussian blur frames correctly resulted in `frame_quality.grade = 'degraded'`. Flat solid frames (black, gray, white, uniform gradient) were cleanly intercepted by the Phase 13 quality gate and marked as `unusable` (`status = 'skipped'`).

---

### B. Behavioural Signal Temporal Metrics (10 Multi-Frame Scenarios / 131 Frames)

Evaluated across temporal observation windows measuring sustained face absence, multiple presence bursts, continuity ratios, sampling gaps, and false-positive suppression gates.

| Behavioral Signal | Target Scenario | TP | FP | TN | FN | Total | Precision | Recall | F1-Score | FPR |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`MULTIPLE_FACES` (`BEH-002`)** | Repeated multiple face presence | 2 | 0 | 8 | 0 | 10 | **1.0000** | **1.0000** | **1.0000** | **0.0000** |
| **`FACE_ABSENCE` (`BEH-003`)** | Continuous absence run (>2500ms) | 1 | 0 | 9 | 0 | 10 | **1.0000** | **1.0000** | **1.0000** | **0.0000** |
| **`FACE_PRESENCE_CONSISTENCY` (`BEH-001`)** | Low continuity detection (<70%) | 1 | 0 | 9 | 0 | 10 | **1.0000** | **1.0000** | **1.0000** | **0.0000** |
| **`FRAME_QUALITY_SUMMARY` (`CV-SIG-006`)** | Degraded video stream detection | 1 | 0 | 9 | 0 | 10 | **1.0000** | **1.0000** | **1.0000** | **0.0000** |
| **`MONITORING_DATA_QUALITY`** | Camera/Network gap (>3000ms) | 1 | 0 | 9 | 0 | 10 | **1.0000** | **1.0000** | **1.0000** | **0.0000** |

---

### C. False Positive Suppression Verification

- **Single-Frame Blink Suppression (`BEH-003` Control):**
  - Scenario `beh-04-blink-suppression` introduced an isolated missing frame ($N=1$) flanked by valid face detections.
  - *Result:* Correctly suppressed by the `min_absence_observations = 3` rule. `FACE_ABSENCE` status remained `not_observed`. **Zero false alarms.**
- **Single-Frame Multi-Face Glitch Suppression (`BEH-002` Control):**
  - Scenario `beh-05-transient-glitch-suppression` introduced an isolated 2-face frame ($N=1$) flanked by single-face detections.
  - *Result:* Correctly suppressed by the `min_multiple_faces_observations = 2` rule. `MULTIPLE_FACES` status remained `not_observed`. **Zero false alarms.**

---

## 3. Measured Execution Latency Distributions

All latency benchmarks were measured directly on the host runtime:

| Pipeline Stage | Minimum | Median | P95 | Maximum | Target SLA |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **CV Frame Inference (`POST /analysis/frame`)** | 1.44 ms | **10.59 ms** | 53.42 ms | 57.42 ms | $< 100 \text{ ms}$ (at 1 fps) |
| **Behaviour Analysis Batch (`POST /analysis/behaviour`)** | 0.06 ms | **0.11 ms** | 0.28 ms | 0.28 ms | $< 25 \text{ ms}$ |

*Interpretation:* Per-frame inference completes in ~10.6 ms (under 11% of the 1000 ms per-frame budget at 1 fps), leaving ample CPU headroom for concurrent candidate video sessions without dropping frames.

---

## 4. Controlled Fixture Methodology & Dataset Provenance

- **Manifest Identifier:** `ai-service/evaluation/phase21-controlled-eval-v1.0.json`
- **Fixture Storage Directory:** `ai-service/tests/fixtures/controlled/`
- **Provenance & Categories:**
  1. `single_face_*` (11 fixtures): Canonical single face with deterministic shifts, scales (0.8x, 1.1x), contrast changes (high/low), mild blur, low light, and partial occlusion (mouth, side, heavy).
  2. `multi_faces_*` (9 fixtures): Two-face canonical, multi-face composites (side-by-side, 3 faces), contrast variations, mild blur, heavy blur, and low light.
  3. `absence_*` (8 fixtures): Solid black, solid gray, solid white, gradient background, random Gaussian noise, geometric shapes, empty chair at desk, room wall clock.
  4. `quality_*` (4 fixtures): Heavy Gaussian blur (kernel 31x31), low light, overexposed frames.

---

## 5. Known Limitations & Generalization Boundaries

> [!IMPORTANT]
> **Controlled Fixture Boundary vs. Real-World Pilot:**
> 1. **Synthetic & Controlled Scope:** The figures reported above represent **controlled baseline evaluation** on deterministic synthetic and transformed fixtures. They verify functional correctness of the detection models and temporal rule filters.
> 2. **Real-World Factors Deferred to Phase 22:** Performance under unconstrained real-world environments (extreme camera angles, diverse skin tones, harsh shadows, backlight glare, complex multi-person backgrounds, low-end webcams) will be evaluated during the **Phase 22 Internal Pilot**.
> 3. **Non-Accusatory Rule Enforced:** AI observations provide objective visual measurements (e.g. "multiple faces detected in 3 consecutive frames"). In accordance with core system ethics, they **never** assert candidate cheating, dishonesty, or guilt.

---

## 6. Regression Protection

An automated regression test suite has been added in `ai-service/tests/test_evaluation_regression.py` (12 automated tests). It continuously locks:
- Sample size $\ge 30$ examples
- Precision $\ge 0.95$ and Recall $\ge 0.95$ for multi-face detection
- Zero false positives on non-face scenes
- Blink and glitch suppression
- Median inference latency $< 50.0 \text{ ms}$
