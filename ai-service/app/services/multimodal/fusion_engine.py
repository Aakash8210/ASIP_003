"""V2 Multimodal Fusion Engine.

Combines visual (V1 BEH-* signals), audio observations, and transcript/NLP
observations into a calibrated, interpretable V2 signal summary.

Ethics mandate:
  - Fusion correlates observable signals — it does NOT infer intent or deception.
  - Cross-modal coherence is statistical correlation, not proof.
  - Every fusion output includes explicit limitations and model version tags.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from .schemas import (
    AudioObservationResult,
    ModalitySignalSummary,
    MultimodalFusionResult,
    TranscriptNLPResult,
)

logger = logging.getLogger("ai-service.multimodal.fusion")


class MultimodalFusionEngine:
    """Stateless multimodal fusion engine."""

    def fuse(
        self,
        interview_id: str,
        *,
        visual_signals: Optional[List[Dict[str, Any]]] = None,
        audio_result: Optional[AudioObservationResult] = None,
        transcript_result: Optional[TranscriptNLPResult] = None,
    ) -> MultimodalFusionResult:
        analysis_id = f"mm_{uuid.uuid4().hex[:12]}"

        modalities: List[ModalitySignalSummary] = []
        total_signals = 0
        corroborated = 0
        observations: List[str] = []

        visual_key_obs: List[str] = []
        visual_signal_count = 0
        visual_available = False
        visual_conf = 0.0

        if visual_signals:
            visual_available = True
            for sig in visual_signals:
                if sig.get("status") == "observed":
                    visual_signal_count += 1
                    sig_type = sig.get("signal_type", "unknown")
                    visual_key_obs.append(sig_type)
            visual_conf = 0.90 if visual_signal_count > 0 else 0.95
            total_signals += visual_signal_count

        modalities.append(ModalitySignalSummary(
            modality="visual",
            available=visual_available,
            signal_count=visual_signal_count,
            key_observations=visual_key_obs[:10],
            confidence=visual_conf,
        ))

        audio_key_obs: List[str] = []
        audio_signal_count = 0
        audio_available = False
        audio_conf = 0.0
        audio_activity: Dict[str, Any] = {}

        if audio_result:
            audio_available = True
            audio_conf = audio_result.confidence

            if audio_result.speech_ratio < 0.1 and audio_result.total_duration_ms > 5000:
                audio_signal_count += 1
                audio_key_obs.append("EXTENDED_SILENCE")
                observations.append("Extended silence detected in audio stream.")

            if audio_result.estimated_speaker_count > 1:
                audio_signal_count += 1
                audio_key_obs.append("MULTI_SPEAKER")
                observations.append(
                    f"Estimated {audio_result.estimated_speaker_count} speakers detected in audio."
                )

            if audio_result.audio_quality.value in ("degraded", "unusable"):
                audio_signal_count += 1
                audio_key_obs.append("AUDIO_QUALITY_ISSUE")
                observations.append(f"Audio quality: {audio_result.audio_quality.value}.")

            if audio_result.clipping_detected:
                audio_signal_count += 1
                audio_key_obs.append("AUDIO_CLIPPING")

            total_signals += audio_signal_count

            audio_activity = {
                "speech_ratio": audio_result.speech_ratio,
                "speech_duration_ms": audio_result.speech_duration_ms,
                "silence_duration_ms": audio_result.silence_duration_ms,
                "estimated_speakers": audio_result.estimated_speaker_count,
                "quality": audio_result.audio_quality.value,
                "pause_count": audio_result.pause_count,
                "status": "normal" if audio_signal_count == 0 else "attention",
                "label": "Audio activity within expected parameters"
                if audio_signal_count == 0
                else f"{audio_signal_count} audio observation(s) flagged for review",
            }

        modalities.append(ModalitySignalSummary(
            modality="audio",
            available=audio_available,
            signal_count=audio_signal_count,
            key_observations=audio_key_obs,
            confidence=audio_conf,
        ))

        transcript_key_obs: List[str] = []
        transcript_signal_count = 0
        transcript_available = False
        transcript_conf = 0.0
        transcript_quality: Dict[str, Any] = {}

        if transcript_result:
            transcript_available = True
            transcript_conf = transcript_result.confidence

            if transcript_result.filler_ratio > 0.15:
                transcript_signal_count += 1
                transcript_key_obs.append("HIGH_FILLER_RATIO")
                observations.append(
                    f"High filler word ratio ({transcript_result.filler_ratio:.1%}) in transcript."
                )

            if (
                transcript_result.topic_relevance_score is not None
                and transcript_result.topic_relevance_score < 0.05
                and transcript_result.word_count > 20
            ):
                transcript_signal_count += 1
                transcript_key_obs.append("LOW_TOPIC_RELEVANCE")
                observations.append("Transcript shows low topic overlap with the provided prompt.")

            if (
                transcript_result.prompt_echo_ratio is not None
                and transcript_result.prompt_echo_ratio > 0.6
                and transcript_result.word_count > 10
            ):
                transcript_signal_count += 1
                transcript_key_obs.append("HIGH_PROMPT_ECHO")
                observations.append("Response closely echoes the prompt text.")

            total_signals += transcript_signal_count

            transcript_quality = {
                "word_count": transcript_result.word_count,
                "sentence_count": transcript_result.sentence_count,
                "filler_ratio": transcript_result.filler_ratio,
                "vocabulary_richness": transcript_result.vocabulary_richness,
                "topic_relevance": transcript_result.topic_relevance_score,
                "transcription_confidence": transcript_result.transcription_confidence,
                "status": "normal" if transcript_signal_count == 0 else "attention",
                "label": "Transcript statistics within expected parameters"
                if transcript_signal_count == 0
                else f"{transcript_signal_count} transcript observation(s) flagged for review",
            }

        modalities.append(ModalitySignalSummary(
            modality="transcript",
            available=transcript_available,
            signal_count=transcript_signal_count,
            key_observations=transcript_key_obs,
            confidence=transcript_conf,
        ))

        cross_modal: Dict[str, Any] = {
            "status": "normal",
            "label": "No cross-modal anomalies detected",
            "corroborated_signals": [],
        }

        if "MULTIPLE_FACES" in visual_key_obs and "MULTI_SPEAKER" in audio_key_obs:
            corroborated += 1
            cross_modal["corroborated_signals"].append("visual_multi_face+audio_multi_speaker")
            cross_modal["status"] = "attention"
            cross_modal["label"] = "Multiple presence corroborated across visual and audio modalities"
            observations.append(
                "Cross-modal corroboration: multiple faces in video AND multiple speakers in audio."
            )

        if "FACE_ABSENCE" in visual_key_obs and "EXTENDED_SILENCE" in audio_key_obs:
            corroborated += 1
            cross_modal["corroborated_signals"].append("visual_absence+audio_silence")
            cross_modal["status"] = "attention"
            cross_modal["label"] = "Absence corroborated: no face in video AND silence in audio"
            observations.append(
                "Cross-modal corroboration: face absence in video AND extended silence in audio."
            )

        available_count = sum(1 for m in modalities if m.available)
        if total_signals == 0:
            summary = (
                f"V2 multimodal analysis across {available_count} modality/modalities: "
                "all observations within expected parameters. No signals flagged for review."
            )
        else:
            summary = (
                f"V2 multimodal analysis across {available_count} modality/modalities: "
                f"{total_signals} observation(s) flagged, "
                f"{corroborated} corroborated across modalities. "
                + " ".join(observations)
            )

        confs = [m.confidence for m in modalities if m.available and m.confidence > 0]
        overall_conf = sum(confs) / max(1, len(confs)) if confs else 0.5

        return MultimodalFusionResult(
            interview_id=interview_id,
            analysis_id=analysis_id,
            modalities=modalities,
            observation_summary=summary,
            total_signal_count=total_signals,
            corroborated_signal_count=corroborated,
            audio_activity=audio_activity,
            transcript_quality=transcript_quality,
            cross_modal_coherence=cross_modal,
            confidence=round(overall_conf, 3),
        )

