"""Computer Vision analysis engine — orchestrates preprocessing and detection.

This module is the entry point for all CV analysis requests.  It wires
together the FramePreprocessor and FaceDetector, enforces the Phase 13
scope boundary, and returns a versioned CVAnalysisResult.

Async design:
- decode_and_assess() and face detection are CPU-bound.
- The public coroutine analyse_frame() offloads inference to a thread pool
  via asyncio.to_thread() so it does not block the FastAPI event loop.

Privacy:
- Frame bytes are never logged or stored.
- The result contains only bounding boxes, counts, and quality metrics.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from .face_detector import FaceDetectorRegistry
from .preprocessor import FramePreprocessor, FrameQualityGrade
from .schemas import AnalysisStatus, CVAnalysisResult, FrameQualityMetrics

logger = logging.getLogger("ai-service.cv.engine")


class CVAnalysisEngine:
    """Orchestrates frame preprocessing and face detection.

    Intended to be a lightweight stateless facade; it holds no mutable
    per-request state.  One instance can be shared across all requests.
    """

    def __init__(self) -> None:
        self._preprocessor = FramePreprocessor()

    # ------------------------------------------------------------------
    # Public async entry point
    # ------------------------------------------------------------------

    async def analyse_frame(
        self,
        interview_id: str,
        sequence_number: int,
        frame_timestamp: str,
        frame_data: str,
        declared_format: Optional[str] = None,
        declared_width: Optional[int] = None,
        declared_height: Optional[int] = None,
    ) -> CVAnalysisResult:
        """Analyse a single webcam frame and return a structured CV result.

        This coroutine runs synchronous CPU work in a thread pool so the
        event loop remains responsive.

        Args:
            interview_id: Interview session identifier (not candidate ID).
            sequence_number: Frame sequence number from Phase 12.
            frame_timestamp: ISO-8601 capture timestamp from Phase 12.
            frame_data: Base64-encoded image (optionally with data URI prefix).
            declared_format: MIME type reported by Phase 12.
            declared_width: Width reported by Phase 12 (pixels).
            declared_height: Height reported by Phase 12 (pixels).

        Returns:
            CVAnalysisResult with status, quality metrics, and face observations.
        """
        return await asyncio.to_thread(
            self._analyse_sync,
            interview_id,
            sequence_number,
            frame_timestamp,
            frame_data,
            declared_format,
            declared_width,
            declared_height,
        )

    # ------------------------------------------------------------------
    # Synchronous implementation (runs in thread pool)
    # ------------------------------------------------------------------

    def _analyse_sync(
        self,
        interview_id: str,
        sequence_number: int,
        frame_timestamp: str,
        frame_data: str,
        declared_format: Optional[str] = None,
        declared_width: Optional[int] = None,
        declared_height: Optional[int] = None,
    ) -> CVAnalysisResult:
        t_total_start = time.perf_counter()
        analysis_id = f"cv_{interview_id}_{sequence_number}_{uuid.uuid4().hex[:8]}"

        # --- Step 1: Preprocess / decode -----------------------------------
        try:
            frame = self._preprocessor.decode_and_assess(
                frame_data,
                declared_format=declared_format,
                declared_width=declared_width,
                declared_height=declared_height,
            )
        except ValueError as exc:
            logger.warning(
                "[%s] Frame preprocessing failed (seq=%d): %s",
                interview_id,
                sequence_number,
                exc,
            )
            return CVAnalysisResult(
                analysis_id=analysis_id,
                interview_id=interview_id,
                sequence_number=sequence_number,
                frame_timestamp=frame_timestamp,
                status=AnalysisStatus.ERROR,
                error_message=str(exc),
                total_duration_ms=round(
                    (time.perf_counter() - t_total_start) * 1000, 2
                ),
            )

        # --- Step 2: Quality gate -----------------------------------------
        if frame.quality.grade == FrameQualityGrade.UNUSABLE:
            logger.info(
                "[%s] Frame seq=%d skipped — quality grade: unusable "
                "(blur=%.1f, brightness=%.1f)",
                interview_id,
                sequence_number,
                frame.quality.blur_score,
                frame.quality.brightness_mean,
            )
            return CVAnalysisResult(
                analysis_id=analysis_id,
                interview_id=interview_id,
                sequence_number=sequence_number,
                frame_timestamp=frame_timestamp,
                status=AnalysisStatus.SKIPPED,
                frame_quality=frame.quality,
                total_duration_ms=round(
                    (time.perf_counter() - t_total_start) * 1000, 2
                ),
            )

        # --- Step 3: Face detection ----------------------------------------
        t_infer_start = time.perf_counter()
        try:
            detector = FaceDetectorRegistry.get()
            detected_faces = detector.detect(frame.bgr_image)
        except Exception as exc:
            logger.error(
                "[%s] Face detection failed (seq=%d): %s",
                interview_id,
                sequence_number,
                exc,
                exc_info=True,
            )
            return CVAnalysisResult(
                analysis_id=analysis_id,
                interview_id=interview_id,
                sequence_number=sequence_number,
                frame_timestamp=frame_timestamp,
                status=AnalysisStatus.ERROR,
                error_message=f"Face detection failed: {exc}",
                frame_quality=frame.quality,
                inference_duration_ms=round(
                    (time.perf_counter() - t_infer_start) * 1000, 2
                ),
                total_duration_ms=round(
                    (time.perf_counter() - t_total_start) * 1000, 2
                ),
            )

        inference_ms = round((time.perf_counter() - t_infer_start) * 1000, 2)
        total_ms = round((time.perf_counter() - t_total_start) * 1000, 2)

        face_count = len(detected_faces)
        face_detected = face_count > 0

        logger.debug(
            "[%s] seq=%d | faces=%d | quality=%s | infer=%.1fms | total=%.1fms",
            interview_id,
            sequence_number,
            face_count,
            frame.quality.grade.value,
            inference_ms,
            total_ms,
        )

        return CVAnalysisResult(
            analysis_id=analysis_id,
            interview_id=interview_id,
            sequence_number=sequence_number,
            frame_timestamp=frame_timestamp,
            status=AnalysisStatus.OK,
            frame_quality=frame.quality,
            face_detected=face_detected,
            face_count=face_count,
            multiple_faces_detected=face_count > 1,
            detected_faces=detected_faces,
            inference_duration_ms=inference_ms,
            total_duration_ms=total_ms,
        )
