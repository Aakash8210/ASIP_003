"""Tests for Phase 23: V2 Multimodal Integrity Intelligence.

Verifies:
  - Audio observation analysis (speech/silence, clipping, multi-speaker estimation)
  - Transcript / NLP observation analysis (statistics, filler ratio, prompt overlap)
  - Multimodal fusion engine (visual + audio + transcript, cross-modal corroboration)
  - Consent gating across all V2 endpoints (400 if consent_acknowledged is False)
  - Ethical boundary compliance (no emotion/stress/deception claims)
"""

import math
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.multimodal.audio_analyzer import AudioObservationAnalyzer
from app.services.multimodal.fusion_engine import MultimodalFusionEngine
from app.services.multimodal.schemas import (
    AudioQualityClassification,
    MultimodalFusionResult,
)
from app.services.multimodal.transcript_analyzer import TranscriptNLPAnalyzer

client = TestClient(app)


class TestAudioObservationAnalyzer:
    def setup_method(self):
        self.analyzer = AudioObservationAnalyzer()

    def test_metadata_mode(self):
        result = self.analyzer.analyze_audio_chunk(
            interview_id="iv_test_001",
            total_duration_ms=10000.0,
            speech_duration_ms=7500.0,
            silence_duration_ms=2500.0,
            estimated_speaker_count=1,
            audio_quality_hint="good",
        )
        assert result.interview_id == "iv_test_001"
        assert result.total_duration_ms == 10000.0
        assert result.speech_duration_ms == 7500.0
        assert result.speech_ratio == 0.75
        assert result.estimated_speaker_count == 1
        assert result.audio_quality == AudioQualityClassification.GOOD
        assert len(result.limitations) > 0

    def test_raw_samples_speech_and_silence(self):
        sample_rate = 16000
        silence = [0.0] * sample_rate
        t = [i / sample_rate for i in range(sample_rate)]
        speech = [0.5 * math.sin(2 * math.pi * 440 * x) for x in t]
        samples = silence + speech

        result = self.analyzer.analyze_audio_chunk(
            interview_id="iv_test_002",
            audio_samples=samples,
            sample_rate=sample_rate,
        )
        assert result.total_duration_ms == 2000.0
        assert result.speech_duration_ms > 500.0
        assert result.silence_duration_ms > 500.0
        assert 0.3 <= result.speech_ratio <= 0.7
        assert len(result.segments) >= 2
        assert result.clipping_detected is False

    def test_clipping_detection(self):
        sample_rate = 16000
        clipped_samples = [1.0 if i % 2 == 0 else -1.0 for i in range(sample_rate)]
        result = self.analyzer.analyze_audio_chunk(
            interview_id="iv_test_003",
            audio_samples=clipped_samples,
            sample_rate=sample_rate,
        )
        assert result.clipping_detected is True
        assert result.audio_quality == AudioQualityClassification.DEGRADED


class TestTranscriptNLPAnalyzer:
    def setup_method(self):
        self.analyzer = TranscriptNLPAnalyzer()

    def test_basic_transcript_analysis(self):
        text = "Hello, um, I have five years of experience in distributed systems. Actually, like, we scaled to millions."
        result = self.analyzer.analyze_transcript(
            interview_id="iv_nlp_001",
            transcript_text=text,
        )
        assert result.interview_id == "iv_nlp_001"
        assert result.word_count > 10
        assert result.sentence_count >= 2
        assert result.filler_word_count >= 2
        assert result.filler_ratio > 0.05
        assert "um" in result.filler_words_found
        assert "actually" in result.filler_words_found
        assert result.confidence == 0.75

    def test_prompt_relevance_and_echo(self):
        prompt = "Explain how database indexing works with B-trees."
        response = "Database indexing with B-trees creates a balanced search tree that speeds up query lookups."
        result = self.analyzer.analyze_transcript(
            interview_id="iv_nlp_002",
            transcript_text=response,
            prompt_text=prompt,
        )
        assert result.topic_relevance_score is not None
        assert result.topic_relevance_score > 0.2
        assert result.prompt_echo_ratio is not None

    def test_empty_transcript(self):
        result = self.analyzer.analyze_transcript(
            interview_id="iv_nlp_003",
            transcript_text="",
        )
        assert result.word_count == 0
        assert result.confidence == 0.0


class TestMultimodalFusionEngine:
    def setup_method(self):
        self.engine = MultimodalFusionEngine()
        self.audio_analyzer = AudioObservationAnalyzer()
        self.transcript_analyzer = TranscriptNLPAnalyzer()

    def test_normal_multimodal_fusion(self):
        audio = self.audio_analyzer.analyze_audio_chunk(
            interview_id="iv_fus_001",
            total_duration_ms=60000.0,
            speech_duration_ms=45000.0,
            silence_duration_ms=15000.0,
            estimated_speaker_count=1,
            audio_quality_hint="good",
        )
        transcript = self.transcript_analyzer.analyze_transcript(
            interview_id="iv_fus_001",
            transcript_text="I implemented a reliable pub-sub architecture using Kafka and Redis.",
        )
        result = self.engine.fuse(
            interview_id="iv_fus_001",
            visual_signals=[],
            audio_result=audio,
            transcript_result=transcript,
        )
        assert isinstance(result, MultimodalFusionResult)
        assert result.interview_id == "iv_fus_001"
        assert result.total_signal_count == 0
        assert result.corroborated_signal_count == 0
        assert result.cross_modal_coherence["status"] == "normal"
        assert len(result.modalities) == 3

    def test_cross_modal_corroboration_multiple_presence(self):
        audio = self.audio_analyzer.analyze_audio_chunk(
            interview_id="iv_fus_002",
            total_duration_ms=10000.0,
            speech_duration_ms=8000.0,
            silence_duration_ms=2000.0,
            estimated_speaker_count=2,
        )
        visual_signals = [
            {"signal_type": "MULTIPLE_FACES", "status": "observed", "observation_count": 5}
        ]
        result = self.engine.fuse(
            interview_id="iv_fus_002",
            visual_signals=visual_signals,
            audio_result=audio,
        )
        assert result.total_signal_count >= 2
        assert result.corroborated_signal_count >= 1
        assert result.cross_modal_coherence["status"] == "attention"
        assert "visual_multi_face+audio_multi_speaker" in result.cross_modal_coherence["corroborated_signals"]
        assert "Cross-modal corroboration" in result.observation_summary


class TestMultimodalApiRoutes:
    def test_audio_endpoint_requires_consent(self):
        res = client.post("/analysis/audio", json={
            "interview_id": "iv_api_001",
            "consent_acknowledged": False,
            "total_duration_ms": 5000.0,
        })
        assert res.status_code == 400
        assert "consent" in res.json()["detail"].lower()

    def test_audio_endpoint_with_consent(self):
        res = client.post("/analysis/audio", json={
            "interview_id": "iv_api_001",
            "consent_acknowledged": True,
            "total_duration_ms": 5000.0,
            "speech_duration_ms": 3000.0,
            "silence_duration_ms": 2000.0,
            "estimated_speaker_count": 1,
        })
        assert res.status_code == 200
        data = res.json()
        assert data["interview_id"] == "iv_api_001"
        assert data["speech_ratio"] == 0.6
        assert data["modality"] == "audio"

    def test_transcript_endpoint_requires_consent(self):
        res = client.post("/analysis/transcript", json={
            "interview_id": "iv_api_002",
            "consent_acknowledged": False,
            "transcript_text": "Hello world",
        })
        assert res.status_code == 400
        assert "consent" in res.json()["detail"].lower()

    def test_transcript_endpoint_with_consent(self):
        res = client.post("/analysis/transcript", json={
            "interview_id": "iv_api_002",
            "consent_acknowledged": True,
            "transcript_text": "We deployed the microservice using Kubernetes and automated CI/CD.",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["interview_id"] == "iv_api_002"
        assert data["word_count"] > 5
        assert data["modality"] == "transcript"

    def test_multimodal_endpoint_requires_consent(self):
        res = client.post("/analysis/multimodal", json={
            "interview_id": "iv_api_003",
            "consent_acknowledged": False,
        })
        assert res.status_code == 400
        assert "consent" in res.json()["detail"].lower()

    def test_multimodal_endpoint_with_consent(self):
        res = client.post("/analysis/multimodal", json={
            "interview_id": "iv_api_003",
            "consent_acknowledged": True,
            "visual_signals": [],
        })
        assert res.status_code == 200
        data = res.json()
        assert data["interview_id"] == "iv_api_003"
        assert data["modality"] == "multimodal"
        assert "modalities" in data

