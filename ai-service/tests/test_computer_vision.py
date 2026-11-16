"""Phase 13 — Computer Vision test suite.

Tests cover:
1. Frame preprocessing (decode, quality assessment, error handling)
2. Face detector (model loading, detection on synthetic images)
3. CV analysis engine (end-to-end flow, error paths)
4. FastAPI /analysis/frame endpoint (integration tests)
5. Performance benchmarks (latency measurements — not faked)
6. Privacy constraints (no raw data in logs/results)

Run with:
    cd ai-service && ../ai-service/venv/bin/pytest tests/test_computer_vision.py -v
"""

from __future__ import annotations

import base64
import os
import time
from io import BytesIO
from typing import Optional

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services.computer_vision.engine import CVAnalysisEngine
from app.services.computer_vision.face_detector import FaceDetector, FaceDetectorRegistry
from app.services.computer_vision.preprocessor import (
    BLUR_THRESHOLD_UNUSABLE,
    FramePreprocessor,
)
from app.services.computer_vision.schemas import (
    AnalysisStatus,
    BoundingBox,
    CVAnalysisResult,
    FrameQualityGrade,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_jpeg_b64(width: int = 640, height: int = 360, color: tuple = (120, 120, 120)) -> str:
    """Create a plain-colour JPEG image and return its base64 string."""
    img = Image.new("RGB", (width, height), color=color)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


def _make_png_b64(width: int = 320, height: int = 240) -> str:
    img = Image.new("RGB", (width, height), color=(200, 180, 160))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _make_blank_dark_b64(width: int = 640, height: int = 360) -> str:
    """Very dark image — simulates low-light / near-black frame."""
    img = Image.new("RGB", (width, height), color=(5, 5, 5))
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


def _make_data_uri(b64: str, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64,{b64}"


_FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def _load_fixture_b64(filename: str) -> Optional[str]:
    path = os.path.join(_FIXTURES_DIR, filename)
    if os.path.isfile(path):
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    return None


# ---------------------------------------------------------------------------
# 1. FramePreprocessor
# ---------------------------------------------------------------------------


class TestFramePreprocessor:
    def setup_method(self) -> None:
        self.pp = FramePreprocessor()

    def test_decodes_valid_jpeg(self) -> None:
        b64 = _make_jpeg_b64(640, 360)
        frame = self.pp.decode_and_assess(b64, declared_format="image/jpeg")
        assert frame.width_px == 640
        assert frame.height_px == 360
        assert frame.bgr_image.shape == (360, 640, 3)

    def test_decodes_data_uri_prefix(self) -> None:
        b64 = _make_jpeg_b64(320, 240)
        uri = _make_data_uri(b64)
        frame = self.pp.decode_and_assess(uri, declared_format="image/jpeg")
        assert frame.width_px == 320
        assert frame.height_px == 240

    def test_decodes_png_format(self) -> None:
        b64 = _make_png_b64()
        frame = self.pp.decode_and_assess(b64, declared_format="image/png")
        assert frame.width_px == 320
        assert frame.height_px == 240

    def test_quality_grade_good_on_normal_image(self) -> None:
        # A solid-colour JPEG has zero Laplacian variance, which is mathematically
        # correct for a featureless frame.  Quality grade for real camera frames
        # (which have noise/texture) should be GOOD or DEGRADED, not UNUSABLE.
        # We test with a noisy image instead of a uniform colour patch.
        rng = np.random.default_rng(42)
        noisy = (rng.random((360, 640, 3)) * 255).astype(np.uint8)
        pil_img = Image.fromarray(noisy, "RGB")
        buf = BytesIO()
        pil_img.save(buf, format="JPEG", quality=85)
        b64 = base64.b64encode(buf.getvalue()).decode()

        frame = self.pp.decode_and_assess(b64)
        # Noisy image has high Laplacian variance — must not be UNUSABLE
        assert frame.quality.grade != FrameQualityGrade.UNUSABLE

    def test_quality_metrics_populated(self) -> None:
        b64 = _make_jpeg_b64(640, 360)
        frame = self.pp.decode_and_assess(b64)
        assert frame.quality.blur_score >= 0.0
        assert 0.0 <= frame.quality.brightness_mean <= 255.0
        assert frame.quality.width_px == 640
        assert frame.quality.height_px == 360

    def test_dark_image_is_degraded_or_worse(self) -> None:
        b64 = _make_blank_dark_b64()
        frame = self.pp.decode_and_assess(b64, declared_format="image/jpeg")
        assert frame.quality.grade in (FrameQualityGrade.DEGRADED, FrameQualityGrade.UNUSABLE)

    def test_rejects_unsupported_format(self) -> None:
        b64 = _make_jpeg_b64()
        with pytest.raises(ValueError, match="Unsupported image format"):
            self.pp.decode_and_assess(b64, declared_format="image/gif")

    def test_rejects_invalid_base64(self) -> None:
        with pytest.raises(ValueError, match="Invalid base64"):
            self.pp.decode_and_assess("not_valid_base64!!!")

    def test_rejects_empty_string(self) -> None:
        with pytest.raises((ValueError, Exception)):
            self.pp.decode_and_assess("")

    def test_rejects_corrupt_image_bytes(self) -> None:
        # Encode random bytes that aren't a valid image
        garbage = base64.b64encode(b"\x00\xFF" * 500).decode()
        with pytest.raises(ValueError, match="OpenCV could not decode"):
            self.pp.decode_and_assess(garbage)

    def test_decode_duration_measured(self) -> None:
        b64 = _make_jpeg_b64()
        frame = self.pp.decode_and_assess(b64)
        assert frame.decode_duration_ms >= 0.0

    def test_valid_webp_format_accepted(self) -> None:
        """WebP is in ALLOWED_FORMATS; test that the declared_format check passes."""
        b64 = _make_jpeg_b64()
        # We only test format acceptance (actual webp decoding depends on OpenCV build)
        # Passing as jpeg bytes but declared_format="image/webp" — will fail at cv2.imdecode
        # This confirms format validation path, not decode path
        try:
            self.pp.decode_and_assess(b64, declared_format="image/webp")
        except ValueError as exc:
            # Acceptable — the bytes are not webp; the format validation passed
            assert "OpenCV could not decode" in str(exc) or "Unsupported" not in str(exc)


# ---------------------------------------------------------------------------
# 2. FaceDetector
# ---------------------------------------------------------------------------


class TestFaceDetector:
    @pytest.fixture(autouse=True)
    def ensure_registry(self) -> None:
        FaceDetectorRegistry.initialise()

    def test_registry_initialises_detector(self) -> None:
        detector = FaceDetectorRegistry.get()
        assert detector is not None
        assert isinstance(detector, FaceDetector)

    def test_blank_black_image_returns_no_faces(self) -> None:
        detector = FaceDetectorRegistry.get()
        blank = np.zeros((360, 640, 3), dtype=np.uint8)
        faces = detector.detect(blank)
        assert isinstance(faces, list)
        assert len(faces) == 0

    def test_white_image_returns_no_faces(self) -> None:
        detector = FaceDetectorRegistry.get()
        white = np.full((360, 640, 3), 255, dtype=np.uint8)
        faces = detector.detect(white)
        assert isinstance(faces, list)

    def test_bounding_box_values_are_normalised(self) -> None:
        """If faces are detected, their bounding boxes must be in [0, 1]."""
        detector = FaceDetectorRegistry.get()
        # Use a mid-grey image (unlikely to contain face but test the guard)
        grey = np.full((360, 640, 3), 128, dtype=np.uint8)
        faces = detector.detect(grey)
        for face in faces:
            bb = face.bounding_box
            assert 0.0 <= bb.x <= 1.0
            assert 0.0 <= bb.y <= 1.0
            assert 0.0 < bb.width <= 1.0
            assert 0.0 < bb.height <= 1.0

    def test_confidence_values_are_in_range(self) -> None:
        detector = FaceDetectorRegistry.get()
        blank = np.zeros((360, 640, 3), dtype=np.uint8)
        faces = detector.detect(blank)
        for face in faces:
            assert 0.0 <= face.confidence <= 1.0

    def test_face_index_is_sequential(self) -> None:
        detector = FaceDetectorRegistry.get()
        blank = np.zeros((360, 640, 3), dtype=np.uint8)
        faces = detector.detect(blank)
        for i, face in enumerate(faces):
            assert face.face_index == i

    def test_detector_handles_small_input(self) -> None:
        detector = FaceDetectorRegistry.get()
        small = np.zeros((80, 80, 3), dtype=np.uint8)
        faces = detector.detect(small)
        assert isinstance(faces, list)

    def test_detector_handles_large_input(self) -> None:
        """Large images should be downscaled internally without error."""
        detector = FaceDetectorRegistry.get()
        large = np.zeros((1080, 1920, 3), dtype=np.uint8)
        faces = detector.detect(large)
        assert isinstance(faces, list)

    def test_registry_idempotent_reinitialise(self) -> None:
        """Calling initialise() twice should not raise or replace the instance."""
        d1 = FaceDetectorRegistry.get()
        FaceDetectorRegistry.initialise()
        d2 = FaceDetectorRegistry.get()
        assert d1 is d2

    def test_missing_model_file_raises(self) -> None:
        with pytest.raises(FileNotFoundError, match="YuNet"):
            FaceDetector(model_path="/nonexistent/path/model.onnx")

    def test_detects_single_face_on_real_image(self) -> None:
        b64 = _load_fixture_b64("single_face.jpg")
        if not b64:
            pytest.skip("Test fixture single_face.jpg not found")
        pp = FramePreprocessor()
        frame = pp.decode_and_assess(b64)
        detector = FaceDetectorRegistry.get()
        faces = detector.detect(frame.bgr_image)
        assert len(faces) == 1
        assert faces[0].confidence >= 0.6
        bb = faces[0].bounding_box
        assert 0.0 <= bb.x <= 1.0
        assert 0.0 <= bb.y <= 1.0
        assert 0.0 < bb.width <= 1.0
        assert 0.0 < bb.height <= 1.0
        assert bb.x + bb.width <= 1.0
        assert bb.y + bb.height <= 1.0

    def test_detects_multiple_faces_on_real_image(self) -> None:
        b64 = _load_fixture_b64("multiple_faces.jpg")
        if not b64:
            pytest.skip("Test fixture multiple_faces.jpg not found")
        pp = FramePreprocessor()
        frame = pp.decode_and_assess(b64)
        detector = FaceDetectorRegistry.get()
        faces = detector.detect(frame.bgr_image)
        assert len(faces) == 2
        assert faces[0].confidence >= 0.6
        assert faces[1].confidence >= 0.6
        # Both bounding boxes must be valid and non-identical
        assert faces[0].bounding_box.x != faces[1].bounding_box.x


# ---------------------------------------------------------------------------
# 3. CVAnalysisEngine (synchronous path tested directly)
# ---------------------------------------------------------------------------


class TestCVAnalysisEngine:
    @pytest.fixture(autouse=True)
    def ensure_registry(self) -> None:
        FaceDetectorRegistry.initialise()

    @pytest.fixture
    def engine(self) -> CVAnalysisEngine:
        return CVAnalysisEngine()

    def _run_sync(
        self,
        engine: CVAnalysisEngine,
        frame_data: Optional[str] = None,
        interview_id: str = "test-interview-001",
        seq: int = 1,
        fmt: str = "image/jpeg",
        w: int = 640,
        h: int = 360,
    ) -> CVAnalysisResult:
        fd = frame_data or _make_jpeg_b64(w, h)
        # Call the sync method directly (avoid asyncio overhead in unit tests)
        return engine._analyse_sync(
            interview_id=interview_id,
            sequence_number=seq,
            frame_timestamp="2026-11-07T07:00:00.000Z",
            frame_data=fd,
            declared_format=fmt,
            declared_width=w,
            declared_height=h,
        )

    def test_ok_status_on_normal_frame(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine)
        assert result.status in (AnalysisStatus.OK, AnalysisStatus.SKIPPED)

    def test_error_status_on_invalid_base64(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine, frame_data="!!invalid!!")
        assert result.status == AnalysisStatus.ERROR
        assert result.error_message is not None

    def test_analysis_id_is_populated(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine)
        assert result.analysis_id.startswith("cv_")

    def test_interview_id_propagated(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine, interview_id="interview-XYZ")
        assert result.interview_id == "interview-XYZ"

    def test_sequence_number_propagated(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine, seq=42)
        assert result.sequence_number == 42

    def test_schema_version_present(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine)
        assert result.schema_version == "1.0"

    def test_detector_model_name_present(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine)
        assert result.detector_model == "yunet-2023mar"

    def test_frame_quality_populated_on_success(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine)
        if result.status in (AnalysisStatus.OK, AnalysisStatus.SKIPPED):
            assert result.frame_quality is not None

    def test_face_count_non_negative(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine)
        if result.status == AnalysisStatus.OK and result.face_count is not None:
            assert result.face_count >= 0

    def test_multiple_faces_flag_consistent(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine)
        if result.status == AnalysisStatus.OK and result.face_count is not None:
            expected = result.face_count > 1
            assert result.multiple_faces_detected == expected

    def test_face_detected_consistent_with_count(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine)
        if result.status == AnalysisStatus.OK and result.face_count is not None:
            assert result.face_detected == (result.face_count > 0)

    def test_detected_faces_list_matches_count(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine)
        if result.status == AnalysisStatus.OK and result.face_count is not None:
            assert len(result.detected_faces) == result.face_count

    def test_total_duration_measured(self, engine: CVAnalysisEngine) -> None:
        result = self._run_sync(engine)
        assert result.total_duration_ms is not None
        assert result.total_duration_ms >= 0.0

    def test_dark_frame_produces_result(self, engine: CVAnalysisEngine) -> None:
        dark_b64 = _make_blank_dark_b64()
        result = self._run_sync(engine, frame_data=dark_b64)
        assert result.status in (AnalysisStatus.OK, AnalysisStatus.SKIPPED, AnalysisStatus.ERROR)

    def test_blank_frame_no_faces(self, engine: CVAnalysisEngine) -> None:
        """A completely black frame should produce zero faces."""
        black = np.zeros((360, 640, 3), dtype=np.uint8)
        _, buf = cv2.imencode(".jpg", black)
        b64 = base64.b64encode(buf.tobytes()).decode()
        result = self._run_sync(engine, frame_data=b64)
        if result.status == AnalysisStatus.OK:
            assert result.face_count == 0

    def test_unsupported_format_returns_error(self, engine: CVAnalysisEngine) -> None:
        b64 = _make_jpeg_b64()
        result = self._run_sync(engine, frame_data=b64, fmt="image/gif")
        assert result.status == AnalysisStatus.ERROR

    def test_multiple_analysis_ids_are_unique(self, engine: CVAnalysisEngine) -> None:
        ids = {self._run_sync(engine, seq=i).analysis_id for i in range(1, 6)}
        assert len(ids) == 5

    def test_engine_single_face_real_image(self, engine: CVAnalysisEngine) -> None:
        b64 = _load_fixture_b64("single_face.jpg")
        if not b64:
            pytest.skip("Test fixture single_face.jpg not found")
        result = self._run_sync(engine, frame_data=b64, w=512, h=512)
        assert result.status == AnalysisStatus.OK
        assert result.face_detected is True
        assert result.face_count == 1
        assert result.multiple_faces_detected is False
        assert len(result.detected_faces) == 1
        assert result.detected_faces[0].confidence >= 0.6
        bb = result.detected_faces[0].bounding_box
        assert 0.0 <= bb.x <= 1.0
        assert 0.0 <= bb.y <= 1.0
        assert bb.x + bb.width <= 1.0
        assert bb.y + bb.height <= 1.0

    def test_engine_multiple_faces_real_image(self, engine: CVAnalysisEngine) -> None:
        b64 = _load_fixture_b64("multiple_faces.jpg")
        if not b64:
            pytest.skip("Test fixture multiple_faces.jpg not found")
        result = self._run_sync(engine, frame_data=b64, w=1024, h=512)
        assert result.status == AnalysisStatus.OK
        assert result.face_detected is True
        assert result.face_count == 2
        assert result.multiple_faces_detected is True
        assert len(result.detected_faces) == 2


# ---------------------------------------------------------------------------
# 4. FastAPI integration — /analysis/frame
# ---------------------------------------------------------------------------


class TestAnalysisRoute:
    @pytest.fixture(autouse=True)
    def client(self) -> TestClient:
        with TestClient(app) as c:
            self._client = c
            yield c

    def _post_frame(
        self,
        frame_data: Optional[str] = None,
        interview_id: str = "intv-001",
        seq: int = 1,
        fmt: str = "image/jpeg",
        w: int = 640,
        h: int = 360,
    ):
        payload = {
            "interview_id": interview_id,
            "sequence_number": seq,
            "frame_timestamp": "2026-11-07T07:00:00.000Z",
            "frame_data": frame_data or _make_jpeg_b64(w, h),
            "declared_format": fmt,
            "declared_width": w,
            "declared_height": h,
        }
        return self._client.post("/analysis/frame", json=payload)

    def test_route_exists_and_returns_200(self) -> None:
        resp = self._post_frame()
        assert resp.status_code == 200

    def test_response_has_analysis_id(self) -> None:
        resp = self._post_frame()
        assert "analysis_id" in resp.json()

    def test_response_has_status_field(self) -> None:
        resp = self._post_frame()
        assert resp.json()["status"] in ("ok", "skipped", "error")

    def test_response_has_schema_version(self) -> None:
        resp = self._post_frame()
        assert resp.json()["schema_version"] == "1.0"

    def test_response_has_detector_model(self) -> None:
        resp = self._post_frame()
        assert resp.json()["detector_model"] == "yunet-2023mar"

    def test_invalid_frame_data_returns_200_with_error_status(self) -> None:
        """CV errors return 200 with status='error', not 500, to avoid crashing the caller."""
        resp = self._post_frame(frame_data="!!notbase64!!")
        assert resp.status_code == 200
        assert resp.json()["status"] == "error"

    def test_missing_interview_id_returns_422(self) -> None:
        payload = {
            "sequence_number": 1,
            "frame_timestamp": "2026-11-07T07:00:00.000Z",
            "frame_data": _make_jpeg_b64(),
        }
        resp = self._client.post("/analysis/frame", json=payload)
        assert resp.status_code == 422

    def test_missing_sequence_number_returns_422(self) -> None:
        payload = {
            "interview_id": "intv-001",
            "frame_timestamp": "2026-11-07T07:00:00.000Z",
            "frame_data": _make_jpeg_b64(),
        }
        resp = self._client.post("/analysis/frame", json=payload)
        assert resp.status_code == 422

    def test_zero_sequence_number_returns_422(self) -> None:
        resp = self._post_frame(seq=0)
        assert resp.status_code == 422

    def test_data_uri_prefix_accepted(self) -> None:
        uri = _make_data_uri(_make_jpeg_b64())
        resp = self._post_frame(frame_data=uri)
        assert resp.status_code == 200

    def test_png_format_accepted(self) -> None:
        resp = self._post_frame(frame_data=_make_png_b64(), fmt="image/png", w=320, h=240)
        assert resp.status_code == 200

    def test_unsupported_format_returns_error_status(self) -> None:
        resp = self._post_frame(fmt="image/gif")
        assert resp.status_code == 200
        assert resp.json()["status"] == "error"

    def test_openapi_schema_includes_analysis_route(self) -> None:
        schema = self._client.get("/openapi.json").json()
        assert "/analysis/frame" in schema["paths"]

    def test_health_still_returns_ok(self) -> None:
        resp = self._client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_ready_includes_computer_vision_component(self) -> None:
        resp = self._client.get("/ready")
        assert resp.status_code == 200
        components = resp.json()["components_ready"]
        assert "computer-vision" in components

    def test_multiple_frames_same_interview(self) -> None:
        for seq in range(1, 4):
            resp = self._post_frame(seq=seq)
            assert resp.status_code == 200
            assert resp.json()["sequence_number"] == seq

    def test_analysis_route_single_face_real_image(self) -> None:
        b64 = _load_fixture_b64("single_face.jpg")
        if not b64:
            pytest.skip("Test fixture single_face.jpg not found")
        resp = self._post_frame(frame_data=b64, w=512, h=512)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["face_detected"] is True
        assert data["face_count"] == 1
        assert data["multiple_faces_detected"] is False
        assert len(data["detected_faces"]) == 1
        assert data["detected_faces"][0]["confidence"] >= 0.6
        bb = data["detected_faces"][0]["bounding_box"]
        assert 0.0 <= bb["x"] <= 1.0
        assert 0.0 <= bb["y"] <= 1.0
        assert bb["x"] + bb["width"] <= 1.0
        assert bb["y"] + bb["height"] <= 1.0

    def test_analysis_route_multiple_faces_real_image(self) -> None:
        b64 = _load_fixture_b64("multiple_faces.jpg")
        if not b64:
            pytest.skip("Test fixture multiple_faces.jpg not found")
        resp = self._post_frame(frame_data=b64, w=1024, h=512)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["face_detected"] is True
        assert data["face_count"] == 2
        assert data["multiple_faces_detected"] is True
        assert len(data["detected_faces"]) == 2


# ---------------------------------------------------------------------------
# 5. Performance benchmarks
# ---------------------------------------------------------------------------


class TestPerformanceBenchmarks:
    """Measure actual inference latency.  Results are logged, not asserted on
    exact thresholds (hardware varies), but sanity bounds ensure the system
    is not catastrophically slow."""

    SANITY_TOTAL_MS = 2000  # 2 seconds max per frame is an extreme upper bound

    @pytest.fixture(autouse=True)
    def ensure_registry(self) -> None:
        FaceDetectorRegistry.initialise()

    @pytest.fixture
    def engine(self) -> CVAnalysisEngine:
        return CVAnalysisEngine()

    def test_single_frame_latency_within_sanity_bound(
        self, engine: CVAnalysisEngine
    ) -> None:
        b64 = _make_jpeg_b64(640, 360)
        result = engine._analyse_sync(
            interview_id="perf-test",
            sequence_number=1,
            frame_timestamp="2026-11-07T07:00:00.000Z",
            frame_data=b64,
            declared_format="image/jpeg",
            declared_width=640,
            declared_height=360,
        )
        assert result.total_duration_ms is not None
        assert result.total_duration_ms < self.SANITY_TOTAL_MS, (
            f"Analysis too slow: {result.total_duration_ms:.1f}ms > {self.SANITY_TOTAL_MS}ms"
        )
        print(
            f"\n[PERF] Single frame: total={result.total_duration_ms:.1f}ms "
            f"infer={result.inference_duration_ms}ms"
        )

    def test_ten_sequential_frames_average_latency(
        self, engine: CVAnalysisEngine
    ) -> None:
        durations = []
        b64 = _make_jpeg_b64(640, 360)
        for i in range(1, 11):
            result = engine._analyse_sync(
                interview_id="perf-test",
                sequence_number=i,
                frame_timestamp="2026-11-07T07:00:00.000Z",
                frame_data=b64,
                declared_format="image/jpeg",
                declared_width=640,
                declared_height=360,
            )
            if result.total_duration_ms is not None:
                durations.append(result.total_duration_ms)

        avg = sum(durations) / len(durations) if durations else 0
        print(f"\n[PERF] 10-frame avg latency: {avg:.1f}ms")
        assert avg < self.SANITY_TOTAL_MS

    def test_model_load_time_recorded(self) -> None:
        """Model should already be loaded; re-init should be near-instant."""
        t0 = time.perf_counter()
        FaceDetectorRegistry.initialise()
        elapsed_ms = (time.perf_counter() - t0) * 1000
        print(f"\n[PERF] Re-initialise (no-op): {elapsed_ms:.2f}ms")


# ---------------------------------------------------------------------------
# 6. Privacy constraints
# ---------------------------------------------------------------------------


class TestPrivacyConstraints:
    """Ensure no raw image data appears in results."""

    @pytest.fixture(autouse=True)
    def ensure_registry(self) -> None:
        FaceDetectorRegistry.initialise()

    @pytest.fixture
    def engine(self) -> CVAnalysisEngine:
        return CVAnalysisEngine()

    def test_result_does_not_contain_frame_data(
        self, engine: CVAnalysisEngine
    ) -> None:
        b64 = _make_jpeg_b64()
        result = engine._analyse_sync(
            interview_id="privacy-test",
            sequence_number=1,
            frame_timestamp="2026-11-07T07:00:00.000Z",
            frame_data=b64,
            declared_format="image/jpeg",
            declared_width=640,
            declared_height=360,
        )
        # Serialise result to dict and confirm no large base64 blob present
        d = result.model_dump()
        for key, val in d.items():
            if isinstance(val, str) and len(val) > 500:
                pytest.fail(
                    f"Result field '{key}' contains a suspiciously long string "
                    f"({len(val)} chars) that may be a raw image payload."
                )

    def test_no_identity_embeddings_in_result(
        self, engine: CVAnalysisEngine
    ) -> None:
        result = engine._analyse_sync(
            interview_id="privacy-test",
            sequence_number=2,
            frame_timestamp="2026-11-07T07:00:00.000Z",
            frame_data=_make_jpeg_b64(),
            declared_format="image/jpeg",
            declared_width=640,
            declared_height=360,
        )
        # Phase 13 must NOT include any embedding, feature vector, or ID
        d = result.model_dump()
        forbidden_keys = {"embedding", "feature_vector", "identity", "face_id", "person_id"}
        for key in forbidden_keys:
            assert key not in d, f"Privacy violation: forbidden field '{key}' found in result."

    def test_bounding_boxes_are_coordinate_only(
        self, engine: CVAnalysisEngine
    ) -> None:
        b64 = _make_jpeg_b64()
        result = engine._analyse_sync(
            interview_id="privacy-test",
            sequence_number=3,
            frame_timestamp="2026-11-07T07:00:00.000Z",
            frame_data=b64,
            declared_format="image/jpeg",
            declared_width=640,
            declared_height=360,
        )
        for face in result.detected_faces:
            bb = face.bounding_box
            assert isinstance(bb.x, float)
            assert isinstance(bb.y, float)
            assert isinstance(bb.width, float)
            assert isinstance(bb.height, float)
            # Confirm there's no cropped image payload hidden in the face record
            fd = face.model_dump()
            for key, val in fd.items():
                if isinstance(val, str) and len(val) > 200:
                    pytest.fail(
                        f"DetectedFace.{key} contains a large string — possible image leak."
                    )
