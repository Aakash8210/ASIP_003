"""FastAPI routes for Phase 14 Observable Behaviour Signal Extraction.

Endpoints:
- POST   /analysis/behaviour            -> Analyze a batch of CV observations (and optionally track session)
- GET    /analysis/behaviour/{id}       -> Retrieve current behaviour analysis for an active session
- DELETE /analysis/behaviour/{id}       -> Evict session state from in-memory tracker
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..services.computer_vision.schemas import CVAnalysisResult
from ..services.behaviour.engine import get_behaviour_engine
from ..services.behaviour.schemas import BehaviourAnalysisResult

logger = logging.getLogger("ai-service.routes.behaviour")

router = APIRouter(prefix="/analysis/behaviour", tags=["behaviour-analysis"])


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------


class BehaviourBatchRequest(BaseModel):
    """Batch behaviour analysis request payload."""

    interview_id: str = Field(
        description="Interview session identifier to associate observations."
    )
    observations: list[CVAnalysisResult] = Field(
        default_factory=list,
        description="List of Phase 13 CVAnalysisResult frame observations.",
    )
    track_session: bool = Field(
        default=True,
        description="Whether to accumulate observations into session history.",
    )


class SessionClearedResponse(BaseModel):
    """Response payload when session state is cleared."""

    status: str = Field(default="ok")
    interview_id: str
    message: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=BehaviourAnalysisResult,
    summary="Extract behavioural signals from CV observations",
    description=(
        "Consumes a list of Phase 13 CVAnalysisResult frame observations and extracts "
        "normalized, explainable behavioural signals (face absence, multiple faces, "
        "presence consistency, frame quality summary, monitoring data quality)."
    ),
)
async def analyze_behaviour(request: BehaviourBatchRequest) -> BehaviourAnalysisResult:
    """Run Phase 14 behaviour signal engine on submitted observations."""
    engine = get_behaviour_engine()

    try:
        if request.track_session:
            result = engine.process_and_track(request.interview_id, request.observations)
        else:
            result = engine.analyze_observations(request.interview_id, request.observations)
    except Exception as exc:
        logger.error(
            "Unexpected error in /analysis/behaviour for interview=%s: %s",
            request.interview_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Internal behaviour analysis error")

    return result


@router.get(
    "/{interview_id}",
    response_model=BehaviourAnalysisResult,
    summary="Get current behaviour signals for an active interview session",
    description="Analyzes the current accumulated observation window for an active interview session.",
)
async def get_session_behaviour(interview_id: str) -> BehaviourAnalysisResult:
    """Retrieve temporal behaviour signals for the accumulated session."""
    engine = get_behaviour_engine()
    return engine.analyze_session(interview_id)


@router.delete(
    "/{interview_id}",
    response_model=SessionClearedResponse,
    summary="Clear behaviour session history",
    description="Purges in-memory temporal observation state for an interview session.",
)
async def clear_session_behaviour(interview_id: str) -> SessionClearedResponse:
    """Purge in-memory state for an interview session."""
    engine = get_behaviour_engine()
    existed = engine.tracker.clear_session(interview_id)
    msg = "Session state purged successfully." if existed else "Session was not active or already purged."
    return SessionClearedResponse(
        status="ok",
        interview_id=interview_id,
        message=msg,
    )
