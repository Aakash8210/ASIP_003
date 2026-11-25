"""V2 Transcript / NLP Observation Analyzer.

Lightweight, local-only, zero-cost text analysis engine.
Uses pure-Python token statistics, filler-word detection,
and token-overlap topic relevance — no paid API calls,
no heavy transformer models.

AI-ML Spec §8.2–8.3 compliance:
  - Text Statistics: length, token count, sentence length distribution
  - Filler/Pause Cadence: keyword-list based filler detection
  - Topic Relevance: token overlap / Jaccard similarity with prompt
  - NEVER: "AI-generated text" verdict, deception claim, emotion inference
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Set

from .schemas import (
    TranscriptNLPResult,
    TranscriptSegment,
)

logger = logging.getLogger("ai-service.multimodal.transcript")

FILLER_WORDS: Set[str] = {
    "um", "uh", "er", "ah", "like", "you know", "i mean",
    "basically", "actually", "literally", "right", "so",
    "well", "hmm", "okay", "ok",
}

SENTENCE_SPLIT = re.compile(r'[.!?]+')


class TranscriptNLPAnalyzer:
    """Stateless transcript/NLP analyzer using lexical heuristics."""

    def analyze_transcript(
        self,
        interview_id: str,
        *,
        transcript_text: Optional[str] = None,
        segments: Optional[List[Dict[str, Any]]] = None,
        prompt_text: Optional[str] = None,
        language: Optional[str] = None,
    ) -> TranscriptNLPResult:
        analysis_id = f"nlp_{uuid.uuid4().hex[:12]}"

        parsed_segments: List[TranscriptSegment] = []
        if segments:
            for seg in segments:
                parsed_segments.append(TranscriptSegment(
                    text=seg.get("text", ""),
                    start_ms=seg.get("start_ms"),
                    end_ms=seg.get("end_ms"),
                    confidence=seg.get("confidence", 0.8),
                    speaker_label=seg.get("speaker_label"),
                ))

        full_text = transcript_text or ""
        if not full_text and parsed_segments:
            full_text = " ".join(s.text for s in parsed_segments if s.text)

        full_text = full_text.strip()
        if not full_text:
            return TranscriptNLPResult(
                interview_id=interview_id,
                analysis_id=analysis_id,
                confidence=0.0,
                limitations=["Empty transcript — no text to analyze."],
            )

        words = self._tokenize(full_text)
        word_count = len(words)
        unique_words = set(w.lower() for w in words)
        unique_count = len(unique_words)

        sentences = [s.strip() for s in SENTENCE_SPLIT.split(full_text) if s.strip()]
        sentence_count = max(1, len(sentences))
        avg_sentence_len = word_count / sentence_count

        vocab_richness = unique_count / max(1, word_count)

        lower_text = full_text.lower()
        filler_count = 0
        fillers_found: List[str] = []
        for filler in FILLER_WORDS:
            count = lower_text.count(filler)
            if count > 0:
                filler_count += count
                fillers_found.append(filler)

        filler_ratio = filler_count / max(1, word_count)

        topic_score: Optional[float] = None
        echo_ratio: Optional[float] = None
        if prompt_text and prompt_text.strip():
            prompt_tokens = set(w.lower() for w in self._tokenize(prompt_text))
            response_tokens = set(w.lower() for w in words)
            if prompt_tokens and response_tokens:
                intersection = prompt_tokens & response_tokens
                union = prompt_tokens | response_tokens
                topic_score = len(intersection) / max(1, len(union))
                echo_ratio = len(intersection) / max(1, len(response_tokens))

        trans_conf = 0.8
        if parsed_segments:
            confs = [s.confidence for s in parsed_segments if s.confidence is not None]
            if confs:
                trans_conf = sum(confs) / len(confs)

        return TranscriptNLPResult(
            interview_id=interview_id,
            analysis_id=analysis_id,
            segments=parsed_segments,
            full_text=full_text[:5000],
            language_detected=language,
            transcription_confidence=round(trans_conf, 3),
            word_count=word_count,
            sentence_count=sentence_count,
            unique_word_count=unique_count,
            average_sentence_length=round(avg_sentence_len, 1),
            vocabulary_richness=round(vocab_richness, 4),
            filler_word_count=filler_count,
            filler_ratio=round(filler_ratio, 4),
            filler_words_found=fillers_found,
            topic_relevance_score=round(topic_score, 4) if topic_score is not None else None,
            prompt_echo_ratio=round(echo_ratio, 4) if echo_ratio is not None else None,
            confidence=0.75,
        )

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        return re.findall(r'\b\w+\b', text)

