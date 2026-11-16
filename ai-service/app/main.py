"""FastAPI application composition for the AI service.

Phase 13 adds the Computer Vision analysis engine (AI-MOD-001) on top of the
Phase 4 service foundation.  The CV engine is loaded once during the
application lifespan and shared across requests.

Internal service boundary: browsers must not call this service directly.
The Node.js backend is the only authorised caller.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .core.config import get_settings
from .core.logging import configure_logging
from .routes import health as health_routes
from .routes import analysis as analysis_routes
from .routes import behaviour as behaviour_routes
from .services.computer_vision.face_detector import FaceDetectorRegistry

logger = logging.getLogger("ai-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info(
        "Starting %s v%s (environment=%s, port=%s)",
        settings.service_name,
        settings.version,
        settings.environment,
        settings.port,
    )
    # Phase 13: load the YuNet face detection model at startup so the first
    # request does not pay the initialisation cost.
    try:
        FaceDetectorRegistry.initialise(model_path=settings.cv_model_path)
        logger.info("Computer Vision engine ready (YuNet face detector loaded).")
    except Exception as exc:
        logger.error("Failed to initialise face detector: %s", exc)
        # Service starts in a degraded state; /ready will reflect this.
        # Analysis requests will return an error result, not crash the service.

    yield

    FaceDetectorRegistry.shutdown()
    logger.info("Shutting down %s", settings.service_name)


def register_exception_handlers(app: FastAPI) -> None:
    """Convert unhandled errors into JSON responses without stack traces."""

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled application error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    app = FastAPI(
        title="AI Interview Monitoring — AI Service",
        description=(
            "Independent Python/FastAPI AI service for the AI Interview Monitoring "
            "and Detection System. Phase 13: Computer Vision engine (YuNet face "
            "detector) integrated. Phase 14: Observable Behaviour Signal Extraction "
            "integrated. Analysis results are observable signals with confidence and "
            "context for human review; they do not assert intent, deception, or guilt."
        ),
        version=settings.version,
        lifespan=lifespan,
    )
    register_exception_handlers(app)
    app.include_router(health_routes.router)
    app.include_router(analysis_routes.router)
    app.include_router(behaviour_routes.router)
    return app


app = create_app()
