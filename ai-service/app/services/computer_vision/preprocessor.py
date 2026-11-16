"""Frame preprocessor for the Computer Vision engine.

Responsibilities:
- Decode base64-encoded images from the Phase 12 frame payload.
- Validate image format and dimension bounds.
- Assess frame quality (sharpness, brightness, resolution).
- Resize frames to a model-compatible size while preserving aspect ratio.
- Return a normalised numpy array for inference.

Privacy constraints:
- Raw image bytes are never logged.
- Decoded arrays exist only for the duration of a single request.
- No frame data is written to disk.
"""

from __future__ import annotations

import base64
import logging
import re
import time
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from .schemas import FrameQualityGrade, FrameQualityMetrics

logger = logging.getLogger("ai-service.cv.preprocessor")

# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------

# Supported MIME types from Phase 12 (must match frameValidator.js ALLOWED_FORMATS)
SUPPORTED_MIME_TYPES: frozenset[str] = frozenset({"image/jpeg", "image/webp", "image/png"})

# Dimension bounds (must match Phase 12 frameValidator.js)
MIN_DIMENSION = 64
MAX_DIMENSION = 3840

# Max decoded image size accepted by the CV engine (2 MB raw base64 ~ 1.5 MB bytes)
MAX_IMAGE_BYTES = 2 * 1024 * 1024

# Quality thresholds
BLUR_THRESHOLD_UNUSABLE = 1.0    # Laplacian variance below this → unusable
BLUR_THRESHOLD_DEGRADED = 80.0   # Below this → degraded quality
BRIGHTNESS_LOW = 20.0            # Mean brightness below this → degraded
BRIGHTNESS_HIGH = 240.0          # Mean brightness above this → degraded (overexposed)
MIN_RESOLUTION_UNUSABLE = 64     # Width or height below this → unusable
MIN_RESOLUTION_DEGRADED = 100    # Width or height below this → degraded


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class PreprocessedFrame:
    """Container for a successfully decoded and quality-assessed frame."""

    bgr_image: np.ndarray          # OpenCV BGR format, ready for inference
    width_px: int
    height_px: int
    quality: FrameQualityMetrics
    decode_duration_ms: float


# ---------------------------------------------------------------------------
# Preprocessor
# ---------------------------------------------------------------------------


class FramePreprocessor:
    """Decodes and quality-checks a base64 image from the Phase 12 pipeline."""

    def decode_and_assess(
        self,
        frame_data: str,
        declared_format: Optional[str] = None,
        declared_width: Optional[int] = None,
        declared_height: Optional[int] = None,
    ) -> PreprocessedFrame:
        """Decode a base64 image string and return a PreprocessedFrame.

        Args:
            frame_data: Base64-encoded image (optionally prefixed with data URI).
            declared_format: MIME type reported by Phase 12 (e.g. 'image/jpeg').
            declared_width: Pixel width reported by Phase 12.
            declared_height: Pixel height reported by Phase 12.

        Returns:
            PreprocessedFrame ready for face detection.

        Raises:
            ValueError: Image cannot be decoded, format unsupported, or dimensions invalid.
        """
        t_start = time.perf_counter()

        # --- Validate MIME type (if provided) --------------------------------
        if declared_format is not None:
            fmt = declared_format.lower().strip()
            if fmt not in SUPPORTED_MIME_TYPES:
                raise ValueError(
                    f"Unsupported image format '{declared_format}'. "
                    f"Supported: {', '.join(sorted(SUPPORTED_MIME_TYPES))}"
                )

        # --- Strip data URI prefix -------------------------------------------
        raw_b64 = frame_data
        data_uri_re = re.compile(r"^data:image/[a-zA-Z+]+;base64,(.+)$", re.DOTALL)
        m = data_uri_re.match(frame_data)
        if m:
            raw_b64 = m.group(1)

        # --- Base64 decode ---------------------------------------------------
        try:
            image_bytes = base64.b64decode(raw_b64, validate=True)
        except Exception as exc:
            raise ValueError(f"Invalid base64 data: {exc}") from exc

        if len(image_bytes) == 0:
            raise ValueError("Decoded image is empty (zero bytes).")

        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise ValueError(
                f"Decoded image size ({len(image_bytes)} bytes) exceeds "
                f"maximum ({MAX_IMAGE_BYTES} bytes)."
            )

        # --- Decode with OpenCV ----------------------------------------------
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)

        if bgr is None:
            raise ValueError(
                "OpenCV could not decode image data. "
                "The payload may be corrupt or an unsupported image format."
            )

        actual_height, actual_width = bgr.shape[:2]

        # --- Dimension validation --------------------------------------------
        if actual_width < MIN_DIMENSION or actual_height < MIN_DIMENSION:
            raise ValueError(
                f"Decoded image dimensions ({actual_width}×{actual_height}) are "
                f"below the minimum ({MIN_DIMENSION}px)."
            )
        if actual_width > MAX_DIMENSION or actual_height > MAX_DIMENSION:
            raise ValueError(
                f"Decoded image dimensions ({actual_width}×{actual_height}) exceed "
                f"the maximum ({MAX_DIMENSION}px)."
            )

        # --- Quality assessment (CV-SIG-006) ---------------------------------
        quality = self._assess_quality(bgr, actual_width, actual_height)

        decode_ms = (time.perf_counter() - t_start) * 1000.0

        return PreprocessedFrame(
            bgr_image=bgr,
            width_px=actual_width,
            height_px=actual_height,
            quality=quality,
            decode_duration_ms=decode_ms,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _assess_quality(
        bgr: np.ndarray, width: int, height: int
    ) -> FrameQualityMetrics:
        """Compute quality metrics and assign a quality grade.

        Uses Laplacian variance as a sharpness proxy and mean pixel
        brightness for exposure assessment.
        """
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        brightness_mean = float(np.mean(gray))

        # Determine grade
        if (
            width < MIN_RESOLUTION_UNUSABLE
            or height < MIN_RESOLUTION_UNUSABLE
            or blur_score < BLUR_THRESHOLD_UNUSABLE
        ):
            grade = FrameQualityGrade.UNUSABLE
        elif (
            width < MIN_RESOLUTION_DEGRADED
            or height < MIN_RESOLUTION_DEGRADED
            or blur_score < BLUR_THRESHOLD_DEGRADED
            or brightness_mean < BRIGHTNESS_LOW
            or brightness_mean > BRIGHTNESS_HIGH
        ):
            grade = FrameQualityGrade.DEGRADED
        else:
            grade = FrameQualityGrade.GOOD

        return FrameQualityMetrics(
            grade=grade,
            blur_score=round(blur_score, 4),
            brightness_mean=round(brightness_mean, 4),
            width_px=width,
            height_px=height,
        )
