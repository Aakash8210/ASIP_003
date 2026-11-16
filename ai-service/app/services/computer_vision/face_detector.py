"""Face detector wrapper for the Computer Vision engine.

Uses OpenCV 5's built-in YuNet neural-network face detector
(opencv/opencv_zoo — face_detection_yunet_2023mar.onnx, ~227 KB).

Design decisions (documented in DECISION_LOG.md, DEC-035):
- YuNet is selected over Haar cascades (unavailable in OpenCV 5 headless),
  MediaPipe (heavy dependency), and cloud APIs (privacy/cost concerns).
- The model is loaded once at startup and shared across requests (thread-safe
  read-only inference context per FaceDetectorYN documentation).
- One FaceDetectorYN instance per thread to avoid setInputSize contention.
- Inference runs synchronously; async wrapping happens at the route layer
  via asyncio.to_thread().

Privacy constraints:
- No face images, crops, or embeddings are stored or transmitted.
- Detection output contains only bounding boxes and confidence scores.
- No identity matching or facial recognition is performed.

CV signal coverage in this module:
- CV-SIG-001: face_detected (bool)
- CV-SIG-002: multiple_faces_detected (bool, face_count > 1)
- CV-SIG-003: exposed via face_detected = False (absence)
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Optional

import cv2
import numpy as np

from .schemas import BoundingBox, DetectedFace

logger = logging.getLogger("ai-service.cv.face_detector")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Default model path relative to the ai-service root directory.
_DEFAULT_MODEL_PATH = os.path.join(
    os.path.dirname(__file__),  # .../app/services/computer_vision/
    "..",  # .../app/services/
    "..",  # .../app/
    "..",  # .../ai-service/
    "models",
    "face_detection_yunet_2023mar.onnx",
)

# Detection confidence threshold.  Detections below this value are discarded.
SCORE_THRESHOLD = 0.60

# Non-Maximum Suppression threshold.
NMS_THRESHOLD = 0.30

# Maximum number of raw detections kept before NMS (matches YuNet default).
TOP_K = 5000

# Maximum input size fed to the model (width, height).
# YuNet supports arbitrary input sizes; we cap at 640×480 for CPU efficiency.
MAX_INFERENCE_WIDTH = 640
MAX_INFERENCE_HEIGHT = 480


# ---------------------------------------------------------------------------
# Thread-local detector instances
# ---------------------------------------------------------------------------


class _ThreadLocalDetectors(threading.local):
    """Holds a per-thread FaceDetectorYN instance to avoid setInputSize races."""

    def __init__(self) -> None:
        super().__init__()
        self.detector: Optional[cv2.FaceDetectorYN] = None
        self.current_width: int = 0
        self.current_height: int = 0


_thread_local = _ThreadLocalDetectors()


# ---------------------------------------------------------------------------
# FaceDetector
# ---------------------------------------------------------------------------


class FaceDetector:
    """Thread-safe YuNet face detector.

    One instance of this class should be created at application startup
    (via ``FaceDetectorRegistry``) and reused for every request.
    """

    def __init__(self, model_path: Optional[str] = None) -> None:
        self._model_path = os.path.normpath(
            model_path or _DEFAULT_MODEL_PATH
        )
        self._validate_model_file()
        logger.info("FaceDetector initialised with model: %s", self._model_path)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(self, bgr_image: np.ndarray) -> list[DetectedFace]:
        """Run face detection on a decoded BGR frame.

        Args:
            bgr_image: OpenCV-style BGR image array (uint8, HWC).

        Returns:
            List of ``DetectedFace`` observations with normalised bounding boxes.
            Returns an empty list when no faces are found above the threshold.

        Raises:
            RuntimeError: Detector could not be initialised (model file missing
                          or corrupt), or inference raised an internal error.
        """
        h, w = bgr_image.shape[:2]

        # Resize to max inference dimensions while preserving aspect ratio
        infer_w, infer_h, resized = self._resize_for_inference(bgr_image, w, h)

        # Acquire or create a thread-local detector configured for this size
        detector = self._get_or_create_detector(infer_w, infer_h)

        # Run inference
        try:
            _retval, raw_faces = detector.detect(resized)
        except Exception as exc:
            raise RuntimeError(f"Face detection inference failed: {exc}") from exc

        if raw_faces is None:
            return []

        faces: list[DetectedFace] = []
        for idx, row in enumerate(raw_faces):
            # YuNet row: [x, y, w, h, right_eye_x, right_eye_y, left_eye_x,
            #             left_eye_y, nose_x, nose_y, right_mouth_x, right_mouth_y,
            #             left_mouth_x, left_mouth_y, score]
            x, y, fw, fh = float(row[0]), float(row[1]), float(row[2]), float(row[3])
            score = float(row[14]) if len(row) > 14 else float(row[-1])

            # Robust coordinate clamping to ensure bounding box stays within [0.0, 1.0]
            # even for faces partially occluded or crossing frame boundaries
            x1 = max(0.0, min(float(infer_w), x))
            y1 = max(0.0, min(float(infer_h), y))
            x2 = max(0.0, min(float(infer_w), x + fw))
            y2 = max(0.0, min(float(infer_h), y + fh))

            x_norm = max(0.0, min(1.0, x1 / infer_w))
            y_norm = max(0.0, min(1.0, y1 / infer_h))
            w_norm = max(0.001, min(1.0 - x_norm, (x2 - x1) / infer_w))
            h_norm = max(0.001, min(1.0 - y_norm, (y2 - y1) / infer_h))

            faces.append(
                DetectedFace(
                    bounding_box=BoundingBox(
                        x=round(x_norm, 6),
                        y=round(y_norm, 6),
                        width=round(w_norm, 6),
                        height=round(h_norm, 6),
                    ),
                    confidence=round(min(1.0, max(0.0, score)), 6),
                    face_index=idx,
                )
            )

        return faces

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _validate_model_file(self) -> None:
        if not os.path.isfile(self._model_path):
            raise FileNotFoundError(
                f"YuNet face detection model not found at: {self._model_path}. "
                "Run the model download step documented in DECISION_LOG.md DEC-035."
            )

    def _get_or_create_detector(self, width: int, height: int) -> cv2.FaceDetectorYN:
        """Return a thread-local FaceDetectorYN configured for the given size."""
        tl = _thread_local
        if tl.detector is None:
            tl.detector = cv2.FaceDetectorYN.create(
                self._model_path,
                "",
                (width, height),
                score_threshold=SCORE_THRESHOLD,
                nms_threshold=NMS_THRESHOLD,
                top_k=TOP_K,
            )
            tl.current_width = width
            tl.current_height = height
        elif tl.current_width != width or tl.current_height != height:
            tl.detector.setInputSize((width, height))
            tl.current_width = width
            tl.current_height = height
        return tl.detector

    @staticmethod
    def _resize_for_inference(
        bgr: np.ndarray, w: int, h: int
    ) -> tuple[int, int, np.ndarray]:
        """Resize frame to fit within MAX_INFERENCE bounds, preserving aspect ratio.

        Returns (target_width, target_height, resized_image).
        """
        if w <= MAX_INFERENCE_WIDTH and h <= MAX_INFERENCE_HEIGHT:
            return w, h, bgr

        scale = min(MAX_INFERENCE_WIDTH / w, MAX_INFERENCE_HEIGHT / h)
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))
        resized = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        return new_w, new_h, resized


# ---------------------------------------------------------------------------
# Registry — single shared instance per process
# ---------------------------------------------------------------------------


class FaceDetectorRegistry:
    """Manages the application-lifetime face detector singleton.

    Instantiated during FastAPI lifespan startup; disposed at shutdown.
    """

    _instance: Optional[FaceDetector] = None
    _lock = threading.Lock()

    @classmethod
    def initialise(cls, model_path: Optional[str] = None) -> None:
        """Load the model once.  Idempotent."""
        with cls._lock:
            if cls._instance is None:
                t0 = time.perf_counter()
                cls._instance = FaceDetector(model_path=model_path)
                elapsed = (time.perf_counter() - t0) * 1000
                logger.info("YuNet model loaded in %.1f ms", elapsed)

    @classmethod
    def get(cls) -> FaceDetector:
        """Return the shared detector.  Raises if not initialised."""
        if cls._instance is None:
            raise RuntimeError(
                "FaceDetectorRegistry has not been initialised. "
                "Call FaceDetectorRegistry.initialise() during app startup."
            )
        return cls._instance

    @classmethod
    def shutdown(cls) -> None:
        """Release the detector instance."""
        with cls._lock:
            cls._instance = None
            logger.info("FaceDetectorRegistry shut down.")

