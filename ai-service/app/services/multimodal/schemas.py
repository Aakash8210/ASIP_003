"""V2 Multimodal Integrity Intelligence — Schemas.

Pydantic models for audio observation, transcript/NLP analysis,
and multimodal fusion results.

Ethics mandate (AI-ML Spec §6.3, §8.3):
  - No emotion/stress/deception inference.
  - All signals are factual, observable metadata only.
  - Confidence values tag model/rule version and known limitations.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Audio Observation Schemas
# ---------------------------------------------------------------------------

class AudioQualityClassification(str, Enum):
    GOOD = "good"
    ACCEPTABLE = "acceptable"
    DEGRADED = "degraded"
    UNUSABLE = "unusable"


class SpeechSegment(BaseModel):
    """A contiguous speech or silence segment."""
    segment_type: str = Field(description="'speech' or 'silence'")
    start_ms: float = Field(ge=0)
    end_ms: float = Field(ge=0)
    duration_ms: float = Field(ge=0)


class AudioObservationResult(BaseModel):
    """Result from audio chunk analysis — strictly observable signals."""
    interview_id: str
    analysis_id: str
    schema_version: str = "2.0"
    modality: str = "audio"

    # Speech activity
    total_duration_ms: float = Field(ge=0, description="Total audio chunk duration in ms")
    speech_duration_ms: float = Field(ge=0, description="Total speech detected duration")
    silence_duration_ms: float = Field(ge=0, description="Total silence duration")
    speech_ratio: float = Field(ge=0.0, le=1.0, description="Ratio of speech to total")
    segments: List[SpeechSegment] = Field(default_factory=list, description="Detected segments")

    # Multi-voice / turn indicators
    estimated_speaker_count: int = Field(ge=0, default=1, description="Estimated distinct speakers")
    speaker_overlap_ms: float = Field(ge=0, default=0, description="Duration of overlapping speech")

    # Audio quality
    audio_quality: AudioQualityClassification = AudioQualityClassification.ACCEPTABLE
    clipping_detected: bool = False
    ambient_noise_level: str = Field(default="normal", description="'low', 'normal', 'high', 'extreme'")
    signal_to_noise_ratio_db: Optional[float] = None

    # Cadence / rate
    estimated_speech_rate_wpm: Optional[float] = None
    pause_count: int = Field(ge=0, default=0)
    average_pause_duration_ms: float = Field(ge=0, default=0)

    confidence: float = Field(ge=0.0, le=1.0, default=0.85)
    model_version: str = "audio-observation-v1.0"
    limitations: List[str] = Field(
        default_factory=lambda: [
            "VAD is energy/zero-crossing heuristic — not a trained neural model.",
            "Speaker count is estimated from energy variance — not speaker diarization.",
        ]
    )


# ---------------------------------------------------------------------------
# Transcript / NLP Observation Schemas
# ---------------------------------------------------------------------------

class TranscriptSegment(BaseModel):
    """A timestamped transcript segment."""
    text: str
    start_ms: Optional[float] = None
    end_ms: Optional[float] = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.8)
    speaker_label: Optional[str] = None


class TranscriptNLPResult(BaseModel):
    """Result from transcript/NLP analysis — strictly observable text statistics."""
    interview_id: str
    analysis_id: str
    schema_version: str = "2.0"
    modality: str = "transcript"

    # Transcript content
    segments: List[TranscriptSegment] = Field(default_factory=list)
    full_text: str = ""
    language_detected: Optional[str] = None
    transcription_confidence: float = Field(ge=0.0, le=1.0, default=0.8)

    # Text statistics
    word_count: int = Field(ge=0, default=0)
    sentence_count: int = Field(ge=0, default=0)
    unique_word_count: int = Field(ge=0, default=0)
    average_sentence_length: float = Field(ge=0, default=0)
    vocabulary_richness: float = Field(ge=0.0, le=1.0, default=0.5)

    # Filler / pause cadence
    filler_word_count: int = Field(ge=0, default=0)
    filler_ratio: float = Field(ge=0.0, le=1.0, default=0)
    filler_words_found: List[str] = Field(default_factory=list)

    # Topic relevance (if prompt provided)
    topic_relevance_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    prompt_echo_ratio: Optional[float] = Field(default=None, ge=0.0, le=1.0)

    confidence: float = Field(ge=0.0, le=1.0, default=0.75)
    model_version: str = "nlp-observation-v1.0"
    limitations: List[str] = Field(
        default_factory=lambda: [
            "Text statistics are lexical only — no semantic understanding.",
            "Topic relevance uses token overlap, not deep semantic similarity.",
            "Filler detection is keyword-list based, not context-aware.",
        ]
    )


# ---------------------------------------------------------------------------
# Multimodal Fusion Schema
# ---------------------------------------------------------------------------

class ModalitySignalSummary(BaseModel):
    """Summary of a single modality's contribution to fusion."""
    modality: str  # "visual", "audio", "transcript"
    available: bool = False
    signal_count: int = Field(ge=0, default=0)
    key_observations: List[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)


class MultimodalFusionResult(BaseModel):
    """Calibrated multimodal integrity signal fusion — interpretable, non-punitive."""
    interview_id: str
    analysis_id: str
    schema_version: str = "2.0"
    modality: str = "multimodal"

    # Per-modality summaries
    modalities: List[ModalitySignalSummary] = Field(default_factory=list)

    # Fusion-level observations (factual, never accusatory)
    observation_summary: str = ""
    total_signal_count: int = Field(ge=0, default=0)
    corroborated_signal_count: int = Field(ge=0, default=0, description="Signals observed in 2+ modalities")

    # Interpretable integrity snapshot (matches V1 visual_consistency style)
    audio_activity: Dict[str, Any] = Field(default_factory=dict)
    transcript_quality: Dict[str, Any] = Field(default_factory=dict)
    cross_modal_coherence: Dict[str, Any] = Field(default_factory=dict)

    confidence: float = Field(ge=0.0, le=1.0, default=0.7)
    model_version: str = "multimodal-fusion-v1.0"
    limitations: List[str] = Field(
        default_factory=lambda: [
            "Fusion correlates observable signals — it does not infer intent or deception.",
            "Audio/transcript signals use lightweight heuristics, not production ASR.",
            "Cross-modal coherence is a statistical correlation, not proof of irregularity.",
        ]
    )

