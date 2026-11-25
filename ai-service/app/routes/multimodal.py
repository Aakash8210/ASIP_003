"""FastAPI routes for V2 Multimodal Integrity Intelligence.

Endpoints:
  - POST /analysis/audio
  - POST /analysis/transcript
  - POST /analysis/multimodal

Ethics & Privacy Mandate:
  - Explicit consent required (consent_acknowledged=True).
  - Strictly observable signals; no emotion, stress, or deception claims.
  - No raw audio retention in responses.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.multimodal.audio_analyzer import AudioObservationAnalyzer
from ..services.multimodal.fusion_engine import MultimodalFusionEngine
from ..services.multimodal.schemas import (
    AudioObservationResult,
    MultimodalFusionResult,
    TranscriptNLPResult,
)
from ..services.multimodal.transcript_analyzer import TranscriptNLPAnalyzer

logger = logging.getLogger("ai-service.routes.multimodal")

router = APIRouter(prefix="/analysis", tags=["multimodal-v2"])

_audio_analyzer = AudioObservationAnalyzer()
_transcript_analyzer = TranscriptNLPAnalyzer()
_fusion_engine = MultimodalFusionEngine()


class AudioAnalysisRequest(BaseModel):
    interview_id: str = Field(description="Interview identifier")
    consent_acknowledged: bool = Field(
        default=False,
        description="Explicit user consent for audio telemetry processing"
    )
    audio_samples: Optional[List[float]] = Field(
        default=None,
        description="Raw PCM audio samples normalized to [-1.0, 1.0]"
    )
    sample_rate: int = Field(default=16000, ge=8000, le=48000)
    chunk_duration_ms: Optional[float] = Field(default=None, ge=0)
    speech_duration_ms: Optional[float] = Field(default=None, ge=0)
    silence_duration_ms: Optional[float] = Field(default=None, ge=0)
    total_duration_ms: Optional[float] = Field(default=None, ge=0)
    estimated_speaker_count: int = Field(default=1, ge=0)
    audio_quality_hint: Optional[str] = None


class TranscriptAnalysisRequest(BaseModel):
    interview_id: str = Field(description="Interview identifier")
    consent_acknowledged: bool = Field(
        default=False,
        description="Explicit user consent for transcript telemetry processing"
    )
    transcript_text: Optional[str] = Field(default=None, max_length=10000)
    segments: Optional[List[Dict[str, Any]]] = None
    prompt_text: Optional[str] = Field(default=None, max_length=2000)
    language: Optional[str] = Field(default=None, max_length=10)


class MultimodalFusionRequest(BaseModel):
    interview_id: str = Field(description="Interview identifier")
    consent_acknowledged: bool = Field(
        default=False,
        description="Explicit user consent for multimodal processing"
    )
    visual_signals: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Visual signals from V1 Behaviour Engine"
    )
    audio_result: Optional[AudioObservationResult] = None
    transcript_result: Optional[TranscriptNLPResult] = None


@router.post("/audio", response_model=AudioObservationResult)
async def analyze_audio(request: AudioAnalysisRequest) -> AudioObservationResult:
    if not request.consent_acknowledged:
        raise HTTPException(
            status_code=400,
            detail="Explicit consent required for audio telemetry processing (consent_acknowledged must be True)"
        )

    try:
        result = _audio_analyzer.analyze_audio_chunk(
            interview_id=request.interview_id,
            audio_samples=request.audio_samples,
            sample_rate=request.sample_rate,
            chunk_duration_ms=request.chunk_duration_ms,
            speech_duration_ms=request.speech_duration_ms,
            silence_duration_ms=request.silence_duration_ms,
            total_duration_ms=request.total_duration_ms,
            estimated_speaker_count=request.estimated_speaker_count,
            audio_quality_hint=request.audio_quality_hint,
        )
        return result
    except Exception as exc:
        logger.error("Audio analysis failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Audio analysis error: {str(exc)}")


@router.post("/transcript", response_model=TranscriptNLPResult)
async def analyze_transcript(request: TranscriptAnalysisRequest) -> TranscriptNLPResult:
    if not request.consent_acknowledged:
        raise HTTPException(
            status_code=400,
            detail="Explicit consent required for transcript telemetry processing (consent_acknowledged must be True)"
        )

    try:
        result = _transcript_analyzer.analyze_transcript(
            interview_id=request.interview_id,
            transcript_text=request.transcript_text,
            segments=request.segments,
            prompt_text=request.prompt_text,
            language=request.language,
        )
        return result
    except Exception as exc:
        logger.error("Transcript analysis failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Transcript analysis error: {str(exc)}")


@router.post("/multimodal", response_model=MultimodalFusionResult)
async def analyze_multimodal(request: MultimodalFusionRequest) -> MultimodalFusionResult:
    if not request.consent_acknowledged:
        raise HTTPException(
            status_code=400,
            detail="Explicit consent required for multimodal processing (consent_acknowledged must be True)"
        )

    try:
        result = _fusion_engine.fuse(
            interview_id=request.interview_id,
            visual_signals=request.visual_signals,
            audio_result=request.audio_result,
            transcript_result=request.transcript_result,
        )
        return result
    except Exception as exc:
        logger.error("Multimodal fusion failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Multimodal fusion error: {str(exc)}")

