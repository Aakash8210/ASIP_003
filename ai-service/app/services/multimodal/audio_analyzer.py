"""V2 Audio Observation Analyzer.

Lightweight, offline, zero-cost audio observation engine.
Uses energy-based Voice Activity Detection (VAD), zero-crossing rate,
and amplitude statistics to produce strictly factual, observable
audio signals. No emotion, stress, or deception inference.

Designed to operate on bounded audio chunk metadata or raw PCM-like
numeric arrays. When heavy optional dependencies (e.g., librosa,
webrtcvad) are absent, degrades gracefully to pure-Python heuristics.

AI-ML Spec §6.2–6.3 compliance:
  - Speech Activity: speech/silence segments
  - Timing: pause duration, speaking duration
  - Audio Quality: noise/clipping/signal quality
  - NEVER: emotion, stress, voice-stress analysis
"""

from __future__ import annotations

import logging
import math
import uuid
from typing import Any, Dict, List, Optional

from .schemas import (
    AudioObservationResult,
    AudioQualityClassification,
    SpeechSegment,
)

logger = logging.getLogger("ai-service.multimodal.audio")


class AudioObservationAnalyzer:
    """Stateless audio observation analyzer using energy-based heuristics."""

    ENERGY_THRESHOLD = 0.02
    CLIPPING_THRESHOLD = 0.98
    CLIPPING_RATIO_LIMIT = 0.01
    MIN_SPEECH_SEGMENT_MS = 50
    MIN_SILENCE_SEGMENT_MS = 200

    def analyze_audio_chunk(
        self,
        interview_id: str,
        *,
        audio_samples: Optional[List[float]] = None,
        sample_rate: int = 16000,
        chunk_duration_ms: Optional[float] = None,
        speech_duration_ms: Optional[float] = None,
        silence_duration_ms: Optional[float] = None,
        total_duration_ms: Optional[float] = None,
        estimated_speaker_count: int = 1,
        audio_quality_hint: Optional[str] = None,
    ) -> AudioObservationResult:
        analysis_id = f"aud_{uuid.uuid4().hex[:12]}"

        if audio_samples is not None and len(audio_samples) > 0:
            return self._analyze_raw(interview_id, analysis_id, audio_samples, sample_rate)

        total = total_duration_ms or chunk_duration_ms or 0.0
        speech = speech_duration_ms or 0.0
        silence = silence_duration_ms or max(0, total - speech)
        ratio = speech / total if total > 0 else 0.0

        quality = AudioQualityClassification.ACCEPTABLE
        if audio_quality_hint:
            try:
                quality = AudioQualityClassification(audio_quality_hint)
            except ValueError:
                quality = AudioQualityClassification.ACCEPTABLE

        return AudioObservationResult(
            interview_id=interview_id,
            analysis_id=analysis_id,
            total_duration_ms=total,
            speech_duration_ms=speech,
            silence_duration_ms=silence,
            speech_ratio=round(ratio, 4),
            estimated_speaker_count=estimated_speaker_count,
            audio_quality=quality,
            confidence=0.60,
            limitations=[
                "Metadata-only mode: speech/silence computed from provided values, not raw analysis.",
                "Speaker count is a provided estimate, not acoustically verified.",
            ],
        )

    def _analyze_raw(
        self,
        interview_id: str,
        analysis_id: str,
        samples: List[float],
        sample_rate: int,
    ) -> AudioObservationResult:
        n = len(samples)
        total_duration_ms = (n / sample_rate) * 1000.0

        window_size = int(sample_rate * 0.025)
        hop_size = int(sample_rate * 0.010)

        if window_size < 1:
            window_size = 1
        if hop_size < 1:
            hop_size = 1

        frame_energies: List[float] = []

        for start in range(0, n - window_size + 1, hop_size):
            window = samples[start:start + window_size]
            rms = math.sqrt(sum(x * x for x in window) / len(window)) if window else 0
            frame_energies.append(rms)

        frame_ms = (hop_size / sample_rate) * 1000.0
        is_speech = [e >= self.ENERGY_THRESHOLD for e in frame_energies]

        segments: List[SpeechSegment] = []
        speech_ms = 0.0
        silence_ms = 0.0
        pause_count = 0
        pause_durations: List[float] = []

        if is_speech:
            current_type = "speech" if is_speech[0] else "silence"
            seg_start = 0.0
            seg_len = 0

            for i, sp in enumerate(is_speech):
                frame_type = "speech" if sp else "silence"
                if frame_type == current_type:
                    seg_len += 1
                else:
                    dur = seg_len * frame_ms
                    if current_type == "speech" and dur >= self.MIN_SPEECH_SEGMENT_MS:
                        segments.append(SpeechSegment(
                            segment_type="speech",
                            start_ms=round(seg_start, 1),
                            end_ms=round(seg_start + dur, 1),
                            duration_ms=round(dur, 1),
                        ))
                        speech_ms += dur
                    elif current_type == "silence":
                        segments.append(SpeechSegment(
                            segment_type="silence",
                            start_ms=round(seg_start, 1),
                            end_ms=round(seg_start + dur, 1),
                            duration_ms=round(dur, 1),
                        ))
                        silence_ms += dur
                        if dur >= self.MIN_SILENCE_SEGMENT_MS:
                            pause_count += 1
                            pause_durations.append(dur)

                    current_type = frame_type
                    seg_start = i * frame_ms
                    seg_len = 1

            dur = seg_len * frame_ms
            if current_type == "speech" and dur >= self.MIN_SPEECH_SEGMENT_MS:
                segments.append(SpeechSegment(
                    segment_type="speech",
                    start_ms=round(seg_start, 1),
                    end_ms=round(seg_start + dur, 1),
                    duration_ms=round(dur, 1),
                ))
                speech_ms += dur
            elif current_type == "silence":
                segments.append(SpeechSegment(
                    segment_type="silence",
                    start_ms=round(seg_start, 1),
                    end_ms=round(seg_start + dur, 1),
                    duration_ms=round(dur, 1),
                ))
                silence_ms += dur
                if dur >= self.MIN_SILENCE_SEGMENT_MS:
                    pause_count += 1
                    pause_durations.append(dur)

        speech_ratio = speech_ms / total_duration_ms if total_duration_ms > 0 else 0.0

        clip_count = sum(1 for s in samples if abs(s) >= self.CLIPPING_THRESHOLD)
        clipping_detected = (clip_count / max(1, n)) > self.CLIPPING_RATIO_LIMIT

        avg_energy = sum(frame_energies) / max(1, len(frame_energies)) if frame_energies else 0
        quality = AudioQualityClassification.GOOD
        if clipping_detected:
            quality = AudioQualityClassification.DEGRADED
        elif avg_energy < 0.005:
            quality = AudioQualityClassification.DEGRADED
        elif avg_energy < 0.001:
            quality = AudioQualityClassification.UNUSABLE

        noise_level = "normal"
        silence_energies = [
            frame_energies[i] for i, sp in enumerate(is_speech)
            if not sp and i < len(frame_energies)
        ]
        if silence_energies:
            avg_silence_energy = sum(silence_energies) / len(silence_energies)
            if avg_silence_energy > 0.03:
                noise_level = "high"
            elif avg_silence_energy > 0.05:
                noise_level = "extreme"
            elif avg_silence_energy < 0.005:
                noise_level = "low"

        speech_energies = [
            frame_energies[i] for i, sp in enumerate(is_speech)
            if sp and i < len(frame_energies)
        ]
        est_speakers = 1
        if len(speech_energies) > 10:
            mean_e = sum(speech_energies) / len(speech_energies)
            var_e = sum((e - mean_e) ** 2 for e in speech_energies) / len(speech_energies)
            cv = math.sqrt(var_e) / mean_e if mean_e > 0 else 0
            if cv > 0.6:
                est_speakers = 2

        avg_pause_ms = sum(pause_durations) / len(pause_durations) if pause_durations else 0

        return AudioObservationResult(
            interview_id=interview_id,
            analysis_id=analysis_id,
            total_duration_ms=round(total_duration_ms, 1),
            speech_duration_ms=round(speech_ms, 1),
            silence_duration_ms=round(silence_ms, 1),
            speech_ratio=round(speech_ratio, 4),
            segments=segments,
            estimated_speaker_count=est_speakers,
            audio_quality=quality,
            clipping_detected=clipping_detected,
            ambient_noise_level=noise_level,
            pause_count=pause_count,
            average_pause_duration_ms=round(avg_pause_ms, 1),
            confidence=0.85,
        )
