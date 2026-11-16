"""FastAPI route for Computer Vision frame analysis.

Endpoint: POST /analysis/frame

Receives a webcam frame submitted by the Node.js backend (never directly
from browsers) and returns a structured CVAnalysisResult.

Security notes:
- Raw frame data is never logged at any log level.
- Requests originate from the Node.js backend only (internal service-to-service).
- No authentication middleware is added in Phase 13 (internal network only);
  the backend is responsible for authorizing the candidate and session.

Phase 13 scope:
- Processes frames and returns CV observations.
- Does NOT persist results to MongoDB (Phase 15 responsibility).
- Does NOT classify behaviour as suspicious (Phase 14 responsibility).
- Does NOT generate alerts (Phase 16 responsibility).
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..services.computer_vision.engine import CVAnalysisEngine
from ..services.computer_vision.schemas import CVAnalysisResult

logger = logging.getLogger("ai-service.routes.analysis")

router = APIRouter(prefix="/analysis", tags=["computer-vision"])

# Shared engine instance (stateless — safe to share across requests)
_engine = CVAnalysisEngine()


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------


class FrameAnalysisRequest(BaseModel):
    """Incoming frame analysis request from the Node.js backend."""

    interview_id: str = Field(
        description="Interview session identifier. Used for logging and result association only."
    )
    sequence_number: int = Field(
        gt=0, description="Frame sequence number from the Phase 12 capture pipeline."
    )
    frame_timestamp: str = Field(
        description="ISO-8601 capture timestamp reported by the Phase 12 frame metadata."
    )
    frame_data: str = Field(
        description=(
            "Base64-encoded image data (optionally prefixed with a data URI). "
            "JPEG, WebP, or PNG only. Never logged."
        )
    )
    declared_format: Optional[str] = Field(
        default=None,
        description="MIME type reported by Phase 12 (e.g. 'image/jpeg').",
    )
    declared_width: Optional[int] = Field(
        default=None, gt=0, description="Pixel width reported by Phase 12."
    )
    declared_height: Optional[int] = Field(
        default=None, gt=0, description="Pixel height reported by Phase 12."
    )

    model_config = {"json_schema_extra": {"example": {
        "interview_id": "abc123",
        "sequence_number": 42,
        "frame_timestamp": "2026-11-07T07:00:00.000Z",
        "frame_data": "<base64-encoded-jpeg>",
        "declared_format": "image/jpeg",
        "declared_width": 640,
        "declared_height": 360,
    }}}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post(
    "/frame",
    response_model=CVAnalysisResult,
    summary="Analyse a webcam frame",
    description=(
        "Accepts a base64-encoded webcam frame from the Node.js backend, "
        "runs the Phase 13 Computer Vision pipeline, and returns a structured "
        "CVAnalysisResult with face detection observations and frame quality metrics. "
        "Raw image data is never logged or persisted."
    ),
)
async def analyse_frame(request: FrameAnalysisRequest) -> CVAnalysisResult:
    """Run the CV engine on a submitted webcam frame."""
    try:
        result = await _engine.analyse_frame(
            interview_id=request.interview_id,
            sequence_number=request.sequence_number,
            frame_timestamp=request.frame_timestamp,
            frame_data=request.frame_data,
            declared_format=request.declared_format,
            declared_width=request.declared_width,
            declared_height=request.declared_height,
        )
    except Exception as exc:
        logger.error(
            "Unexpected error in /analysis/frame for interview=%s seq=%d: %s",
            request.interview_id,
            request.sequence_number,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Internal CV analysis error")

    return result

