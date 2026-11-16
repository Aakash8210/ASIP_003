"""Specialized behavioural signal analyzers for Phase 14.

Consumes Phase 13 CVAnalysisResult observations and produces normalized,
explainable BehaviourSignal instances according to AI/ML Specification v1.0.

Principles:
- Strict neutral language: factual statements of visual observations only.
- No inference of intent, deception, attention, or dishonesty.
- Single-frame blips are suppressed via configurable temporal thresholds.
- Monitoring data reliability is evaluated before qualifying signal confidence.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from ..computer_vision.schemas import CVAnalysisResult, FrameQualityGrade
from .config import BehaviourConfig, DEFAULT_CONFIG
from .schemas import (
    BehaviourSignal,
    ConsistencyClassification,
    FaceAbsenceMetrics,
    FrameQualitySummaryMetrics,
    MonitoringQuality,
    MonitoringReliability,
    MultipleFacesMetrics,
    PresenceConsistencyMetrics,
    QualityClassification,
    SignalReliability,
    SignalStatus,
    SignalType,
)

logger = logging.getLogger("ai-service.behaviour.analyzers")


def _parse_iso_timestamp(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        # Standardize 'Z' to '+00:00' for Python fromisoformat
        clean = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(clean)
    except Exception:
        return None


def _calculate_duration_ms(
    start_ts: Optional[str],
    end_ts: Optional[str],
    observation_count: int = 1,
    nominal_interval_ms: float = 1000.0,
) -> float:
    t1 = _parse_iso_timestamp(start_ts)
    t2 = _parse_iso_timestamp(end_ts)
    if t1 and t2:
        diff = (t2 - t1).total_seconds() * 1000.0
        if diff >= 0:
            # If start and end are identical (or single observation), nominal interval applies
            return round(diff if diff > 0 else nominal_interval_ms, 2)
    return round(float(observation_count) * nominal_interval_ms, 2)


# ===========================================================================
# 1. Monitoring Data Quality Analyzer
# ===========================================================================


class MonitoringQualityAnalyzer:
    """Evaluates the continuity, completeness, and validity of the frame stream."""

    def __init__(self, config: BehaviourConfig = DEFAULT_CONFIG) -> None:
        self._config = config

    def analyze(self, raw_observations: list[CVAnalysisResult]) -> MonitoringQuality:
        total = len(raw_observations)
        if total == 0:
            return MonitoringQuality(
                status=MonitoringReliability.INSUFFICIENT_DATA,
                total_observations=0,
                explanation="No observations received for evaluation.",
            )

        # Check raw ordering: duplicate sequence numbers and out-of-order submissions
        seen_sequences: set[int] = set()
        duplicates = 0
        out_of_order = 0
        last_seq: Optional[int] = None
        last_dt: Optional[datetime] = None

        for obs in raw_observations:
            seq = obs.sequence_number
            if seq in seen_sequences:
                duplicates += 1
            else:
                seen_sequences.add(seq)

            if last_seq is not None and seq < last_seq:
                out_of_order += 1
            last_seq = seq

            cur_dt = _parse_iso_timestamp(obs.frame_timestamp)
            if last_dt is not None and cur_dt is not None and cur_dt < last_dt:
                out_of_order += 1
            if cur_dt is not None:
                last_dt = cur_dt

        # Work on sorted observations for gap and range calculations
        sorted_obs = sorted(raw_observations, key=lambda x: (x.sequence_number, x.frame_timestamp))
        seq_start = sorted_obs[0].sequence_number
        seq_end = sorted_obs[-1].sequence_number

        expected_count = seq_end - seq_start + 1 if seq_end >= seq_start else total
        unique_sequences = len(seen_sequences)
        missing_count = max(0, expected_count - unique_sequences)

        # Count sampling gaps (> threshold ms between consecutive sorted observations)
        sampling_gaps = 0
        invalid_count = 0

        for i in range(len(sorted_obs)):
            if sorted_obs[i].status.value == "error":
                invalid_count += 1
            if i > 0:
                t_prev = _parse_iso_timestamp(sorted_obs[i - 1].frame_timestamp)
                t_curr = _parse_iso_timestamp(sorted_obs[i].frame_timestamp)
                if t_prev and t_curr:
                    delta_ms = (t_curr - t_prev).total_seconds() * 1000.0
                    if delta_ms > self._config.sampling_gap_threshold_ms:
                        sampling_gaps += 1

        # Determine reliability status
        if total < self._config.min_observations_for_monitoring_quality:
            status = MonitoringReliability.INSUFFICIENT_DATA
            explanation = (
                f"Received {total} observations, which is below the minimum "
                f"({self._config.min_observations_for_monitoring_quality}) for reliable analysis."
            )
        elif missing_count == 0 and duplicates == 0 and out_of_order == 0 and sampling_gaps == 0 and invalid_count == 0:
            status = MonitoringReliability.SUFFICIENT
            explanation = (
                f"Monitoring data stream is continuous and complete across {total} observations "
                f"(sequences {seq_start} to {seq_end})."
            )
        elif missing_count <= 2 and duplicates == 0 and sampling_gaps <= 1 and invalid_count <= 1:
            status = MonitoringReliability.DEGRADED
            explanation = (
                f"Monitoring stream has minor irregularities ({missing_count} missing sequences, "
                f"{sampling_gaps} sampling gaps) across {total} observations."
            )
        else:
            status = MonitoringReliability.UNRELIABLE
            explanation = (
                f"Monitoring stream continuity is degraded with {missing_count} missing sequences, "
                f"{duplicates} duplicates, {out_of_order} out-of-order frames, and {sampling_gaps} gaps."
            )

        return MonitoringQuality(
            status=status,
            total_observations=total,
            sequence_range_start=seq_start,
            sequence_range_end=seq_end,
            missing_sequence_count=missing_count,
            duplicate_observation_count=duplicates,
            out_of_order_count=out_of_order,
            sampling_gap_count=sampling_gaps,
            invalid_observation_count=invalid_count,
            explanation=explanation,
        )


# ===========================================================================
# 2. Face Absence Analyzer (BEH-003)
# ===========================================================================


class FaceAbsenceAnalyzer:
    """Extracts continuous face absence signals from sequential observations."""

    def __init__(self, config: BehaviourConfig = DEFAULT_CONFIG) -> None:
        self._config = config

    def analyze(
        self,
        sorted_observations: list[CVAnalysisResult],
        data_quality: MonitoringQuality,
    ) -> list[BehaviourSignal]:
        total = len(sorted_observations)
        reliability = self._map_reliability(data_quality.status)

        if total < self._config.min_absence_observations:
            return [
                BehaviourSignal(
                    signal_type=SignalType.FACE_ABSENCE,
                    status=SignalStatus.INSUFFICIENT_DATA,
                    observation_count=0,
                    total_evaluated_observations=total,
                    reliability=reliability,
                    explanation=(
                        f"Insufficient observations ({total}) to evaluate continuous face absence "
                        f"(minimum {self._config.min_absence_observations} required)."
                    ),
                )
            ]

        # Identify contiguous runs of face absence
        # An absent observation is one where status == 'ok' (or skipped) and face_detected == False
        absence_runs: list[list[CVAnalysisResult]] = []
        current_run: list[CVAnalysisResult] = []

        for obs in sorted_observations:
            # Skip error frames from breaking or extending runs arbitrarily
            if obs.status.value == "error":
                continue

            if obs.face_detected is False:
                current_run.append(obs)
            else:
                if current_run:
                    absence_runs.append(current_run)
                    current_run = []

        if current_run:
            absence_runs.append(current_run)

        # Filter runs that meet the absence thresholds
        observed_signals: list[BehaviourSignal] = []

        for run in absence_runs:
            count = len(run)
            start_ts = run[0].frame_timestamp
            end_ts = run[-1].frame_timestamp
            duration_ms = _calculate_duration_ms(start_ts, end_ts, observation_count=count)

            # Check if threshold is met by count or duration
            if count >= self._config.min_absence_observations or duration_ms >= self._config.min_absence_duration_ms:
                is_ongoing = (run[-1] == sorted_observations[-1])

                # Check for gaps within this absence run
                run_gaps = 0
                for j in range(1, len(run)):
                    t_prev = _parse_iso_timestamp(run[j - 1].frame_timestamp)
                    t_curr = _parse_iso_timestamp(run[j].frame_timestamp)
                    if t_prev and t_curr:
                        if (t_curr - t_prev).total_seconds() * 1000.0 > self._config.sampling_gap_threshold_ms:
                            run_gaps += 1

                signal_rel = SignalReliability.DEGRADED if run_gaps > 0 else reliability

                metrics = FaceAbsenceMetrics(
                    consecutive_absent_frames=count,
                    absence_start_sequence=run[0].sequence_number,
                    absence_end_sequence=run[-1].sequence_number,
                    is_ongoing=is_ongoing,
                    sampling_gaps_within_run=run_gaps,
                )

                duration_s = duration_ms / 1000.0
                ongoing_note = " (ongoing)" if is_ongoing else ""
                explanation = (
                    f"No face was detected across {count} consecutive observations "
                    f"({duration_s:.1f}s total duration){ongoing_note}."
                )

                observed_signals.append(
                    BehaviourSignal(
                        signal_type=SignalType.FACE_ABSENCE,
                        status=SignalStatus.OBSERVED,
                        start_timestamp=start_ts,
                        end_timestamp=end_ts,
                        duration_ms=duration_ms,
                        observation_count=count,
                        total_evaluated_observations=total,
                        reliability=signal_rel,
                        metrics=metrics.model_dump(),
                        explanation=explanation,
                    )
                )

        if observed_signals:
            return observed_signals

        # If no absence run met the threshold, report NOT_OBSERVED
        return [
            BehaviourSignal(
                signal_type=SignalType.FACE_ABSENCE,
                status=SignalStatus.NOT_OBSERVED,
                observation_count=0,
                total_evaluated_observations=total,
                reliability=reliability,
                explanation=(
                    f"No continuous face absence meeting the threshold of "
                    f"{self._config.min_absence_observations} consecutive frames was observed."
                ),
            )
        ]

    @staticmethod
    def _map_reliability(status: MonitoringReliability) -> SignalReliability:
        if status == MonitoringReliability.SUFFICIENT:
            return SignalReliability.SUFFICIENT
        if status == MonitoringReliability.DEGRADED:
            return SignalReliability.DEGRADED
        return SignalReliability.UNRELIABLE


# ===========================================================================
# 3. Multiple Face Presence Analyzer (BEH-002)
# ===========================================================================


class MultipleFacesAnalyzer:
    """Extracts multiple face occurrence signals from sequential observations."""

    def __init__(self, config: BehaviourConfig = DEFAULT_CONFIG) -> None:
        self._config = config

    def analyze(
        self,
        sorted_observations: list[CVAnalysisResult],
        data_quality: MonitoringQuality,
    ) -> list[BehaviourSignal]:
        total = len(sorted_observations)
        reliability = FaceAbsenceAnalyzer._map_reliability(data_quality.status)

        if total < self._config.min_multiple_faces_observations:
            return [
                BehaviourSignal(
                    signal_type=SignalType.MULTIPLE_FACES,
                    status=SignalStatus.INSUFFICIENT_DATA,
                    observation_count=0,
                    total_evaluated_observations=total,
                    reliability=reliability,
                    explanation=(
                        f"Insufficient observations ({total}) to evaluate multiple face presence "
                        f"(minimum {self._config.min_multiple_faces_observations} required)."
                    ),
                )
            ]

        # Collect observations exhibiting multiple faces
        mf_observations = [
            obs for obs in sorted_observations
            if obs.multiple_faces_detected is True or (obs.face_count is not None and obs.face_count > 1)
        ]

        count = len(mf_observations)

        if count >= self._config.min_multiple_faces_observations:
            start_ts = mf_observations[0].frame_timestamp
            end_ts = mf_observations[-1].frame_timestamp
            duration_ms = _calculate_duration_ms(start_ts, end_ts, observation_count=count)
            max_faces = max((o.face_count or 0) for o in mf_observations)
            ratio = round(count / total, 4)

            metrics = MultipleFacesMetrics(
                multiple_faces_frames_count=count,
                max_faces_observed=max_faces,
                start_sequence=mf_observations[0].sequence_number,
                end_sequence=mf_observations[-1].sequence_number,
                occurrence_ratio=ratio,
            )

            explanation = (
                f"Multiple faces were detected in {count} observations within the evaluated window "
                f"(maximum observed face count: {max_faces}, occurrence ratio: {ratio * 100:.1f}%)."
            )

            return [
                BehaviourSignal(
                    signal_type=SignalType.MULTIPLE_FACES,
                    status=SignalStatus.OBSERVED,
                    start_timestamp=start_ts,
                    end_timestamp=end_ts,
                    duration_ms=duration_ms,
                    observation_count=count,
                    total_evaluated_observations=total,
                    reliability=reliability,
                    metrics=metrics.model_dump(),
                    explanation=explanation,
                )
            ]

        if count == 1:
            # Isolated single frame: recorded as not observed (below temporal threshold)
            return [
                BehaviourSignal(
                    signal_type=SignalType.MULTIPLE_FACES,
                    status=SignalStatus.NOT_OBSERVED,
                    observation_count=1,
                    total_evaluated_observations=total,
                    reliability=reliability,
                    metrics={"isolated_single_frame": True, "count": 1},
                    explanation=(
                        "An isolated multiple-face observation was recorded in 1 frame, "
                        f"which is below the minimum threshold ({self._config.min_multiple_faces_observations}) "
                        "required to constitute an established multiple-face signal."
                    ),
                )
            ]

        return [
            BehaviourSignal(
                signal_type=SignalType.MULTIPLE_FACES,
                status=SignalStatus.NOT_OBSERVED,
                observation_count=0,
                total_evaluated_observations=total,
                reliability=reliability,
                explanation="No multiple face occurrences were detected in the evaluated window.",
            )
        ]


# ===========================================================================
# 4. Face Presence Consistency Analyzer (BEH-001)
# ===========================================================================


class FacePresenceConsistencyAnalyzer:
    """Evaluates face presence continuity ratio over an evaluated window."""

    def __init__(self, config: BehaviourConfig = DEFAULT_CONFIG) -> None:
        self._config = config

    def analyze(
        self,
        sorted_observations: list[CVAnalysisResult],
        data_quality: MonitoringQuality,
    ) -> BehaviourSignal:
        total = len(sorted_observations)
        reliability = FaceAbsenceAnalyzer._map_reliability(data_quality.status)

        # Count usable observations (exclude errors and unusable frames)
        usable = [
            o for o in sorted_observations
            if o.status.value != "error"
            and not (o.frame_quality and o.frame_quality.grade == FrameQualityGrade.UNUSABLE)
        ]
        usable_count = len(usable)

        if usable_count < self._config.min_observations_for_consistency:
            metrics = PresenceConsistencyMetrics(
                total_valid_observations=usable_count,
                detected_face_count=0,
                absent_face_count=0,
                presence_ratio=0.0,
                classification=ConsistencyClassification.INSUFFICIENT_DATA,
            )
            return BehaviourSignal(
                signal_type=SignalType.FACE_PRESENCE_CONSISTENCY,
                status=SignalStatus.INSUFFICIENT_DATA,
                observation_count=usable_count,
                total_evaluated_observations=total,
                reliability=SignalReliability.UNRELIABLE,
                metrics=metrics.model_dump(),
                explanation=(
                    f"Only {usable_count} usable observations were available, which is below the "
                    f"minimum of {self._config.min_observations_for_consistency} required for consistency calculation."
                ),
            )

        detected = sum(1 for o in usable if o.face_detected is True)
        absent = sum(1 for o in usable if o.face_detected is False)
        ratio = round(detected / usable_count, 4)

        if ratio >= self._config.high_presence_ratio_threshold:
            classification = ConsistencyClassification.HIGH
        elif ratio >= self._config.moderate_presence_ratio_threshold:
            classification = ConsistencyClassification.MODERATE
        else:
            classification = ConsistencyClassification.LOW

        metrics = PresenceConsistencyMetrics(
            total_valid_observations=usable_count,
            detected_face_count=detected,
            absent_face_count=absent,
            presence_ratio=ratio,
            classification=classification,
        )

        start_ts = usable[0].frame_timestamp if usable else None
        end_ts = usable[-1].frame_timestamp if usable else None
        duration_ms = _calculate_duration_ms(start_ts, end_ts, observation_count=usable_count)

        explanation = (
            f"Candidate face was present in {detected} of {usable_count} valid observations "
            f"({ratio * 100:.1f}% presence ratio, consistency: {classification.value})."
        )

        return BehaviourSignal(
            signal_type=SignalType.FACE_PRESENCE_CONSISTENCY,
            status=SignalStatus.OBSERVED,
            start_timestamp=start_ts,
            end_timestamp=end_ts,
            duration_ms=duration_ms,
            observation_count=detected,
            total_evaluated_observations=total,
            reliability=reliability,
            metrics=metrics.model_dump(),
            explanation=explanation,
        )


# ===========================================================================
# 5. Frame Quality Summary Analyzer (CV-SIG-006)
# ===========================================================================


class FrameQualitySummaryAnalyzer:
    """Analyzes frame quality trends and distribution over the time window."""

    def __init__(self, config: BehaviourConfig = DEFAULT_CONFIG) -> None:
        self._config = config

    def analyze(
        self,
        sorted_observations: list[CVAnalysisResult],
        data_quality: MonitoringQuality,
    ) -> BehaviourSignal:
        total = len(sorted_observations)
        reliability = FaceAbsenceAnalyzer._map_reliability(data_quality.status)

        if total == 0:
            return BehaviourSignal(
                signal_type=SignalType.FRAME_QUALITY_SUMMARY,
                status=SignalStatus.INSUFFICIENT_DATA,
                observation_count=0,
                total_evaluated_observations=0,
                reliability=SignalReliability.UNRELIABLE,
                explanation="No frames available for quality evaluation.",
            )

        good_cnt = 0
        degraded_cnt = 0
        unusable_cnt = 0
        blur_scores: list[float] = []
        brightness_vals: list[float] = []

        for o in sorted_observations:
            if o.frame_quality:
                fq = o.frame_quality
                blur_scores.append(fq.blur_score)
                brightness_vals.append(fq.brightness_mean)
                if fq.grade == FrameQualityGrade.GOOD:
                    good_cnt += 1
                elif fq.grade == FrameQualityGrade.DEGRADED:
                    degraded_cnt += 1
                elif fq.grade == FrameQualityGrade.UNUSABLE:
                    unusable_cnt += 1
            else:
                unusable_cnt += 1

        good_ratio = round(good_cnt / total, 4)
        deg_ratio = round(degraded_cnt / total, 4)
        unusable_ratio = round(unusable_cnt / total, 4)

        avg_blur = round(sum(blur_scores) / len(blur_scores), 2) if blur_scores else 0.0
        avg_bright = round(sum(brightness_vals) / len(brightness_vals), 2) if brightness_vals else 0.0

        if total < self._config.min_observations_for_consistency:
            classification = QualityClassification.INSUFFICIENT_DATA
        elif unusable_ratio >= 0.50:
            classification = QualityClassification.CRITICAL_UNUSABLE
        elif deg_ratio >= 0.40 or unusable_ratio >= 0.10:
            classification = QualityClassification.DEGRADED
        elif unusable_ratio == 0 and deg_ratio <= 0.10:
            classification = QualityClassification.EXCELLENT
        else:
            classification = QualityClassification.ACCEPTABLE

        metrics = FrameQualitySummaryMetrics(
            total_frames=total,
            good_frames_count=good_cnt,
            degraded_frames_count=degraded_cnt,
            unusable_frames_count=unusable_cnt,
            good_ratio=good_ratio,
            degraded_ratio=deg_ratio,
            unusable_ratio=unusable_ratio,
            average_blur_score=avg_blur,
            average_brightness=avg_bright,
            classification=classification,
        )

        start_ts = sorted_observations[0].frame_timestamp
        end_ts = sorted_observations[-1].frame_timestamp
        duration_ms = _calculate_duration_ms(start_ts, end_ts, observation_count=total)

        explanation = (
            f"Frame quality overall is {classification.value} across {total} frames "
            f"({good_ratio * 100:.1f}% good, {deg_ratio * 100:.1f}% degraded, "
            f"{unusable_ratio * 100:.1f}% unusable; avg blur: {avg_blur}, avg brightness: {avg_bright})."
        )

        return BehaviourSignal(
            signal_type=SignalType.FRAME_QUALITY_SUMMARY,
            status=SignalStatus.OBSERVED,
            start_timestamp=start_ts,
            end_timestamp=end_ts,
            duration_ms=duration_ms,
            observation_count=good_cnt,
            total_evaluated_observations=total,
            reliability=reliability,
            metrics=metrics.model_dump(),
            explanation=explanation,
        )

