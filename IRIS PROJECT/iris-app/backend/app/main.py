"""IRIS API. Run with:  uvicorn app.main:create_app --factory"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import Settings
from .database import Base, make_engine, make_session_factory, utcnow
from .errors import register_error_handlers
from .routers import auth, me, state
from .security import RateLimiter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# What the website pages may load. The Google entries are the ones Google documents for "Sign in with Google".
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com/gsi/client",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "frame-src https://accounts.google.com/gsi/",
    "connect-src 'self' https://accounts.google.com/gsi/",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])
DOC_PATHS = ("/docs", "/redoc", "/openapi.json")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = (settings or Settings()).prepare()
    engine = make_engine(settings.database_url)
    session_factory = make_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        Base.metadata.create_all(engine)  # first run creates the tables
        yield
        engine.dispose()

    app = FastAPI(title="IRIS API", version="1.0.0", lifespan=lifespan, docs_url=None if settings.is_production else "/docs",
                  redoc_url=None, openapi_url=None if settings.is_production else "/openapi.json")
    app.state.settings = settings
    app.state.engine = engine
    app.state.SessionLocal = session_factory
    app.state.limiter = RateLimiter()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_list,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )
    register_error_handlers(app)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        path = request.url.path
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif not path.startswith(DOC_PATHS):
            # website files: always revalidate so a new deploy is picked up straight away
            response.headers.setdefault("Cache-Control", "no-cache")
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"  # needed by the Google popup
            if settings.csp_enabled:
                response.headers["Content-Security-Policy"] = CSP
        return response

    app.include_router(auth.router)
    app.include_router(me.router)
    app.include_router(state.router)

    @app.get("/api/health", tags=["meta"])
    def health():
        return {"status": "ok", "time": utcnow().isoformat() + "Z"}

    @app.get("/api/config", tags=["meta"])
    def public_config():
        """Public settings the frontend needs. Nothing here is secret."""
        return {
            "google_client_id": settings.google_client_id,
            "allowed_email_domains": settings.domain_list,
            "otp_ttl_seconds": settings.otp_ttl_seconds,
            "otp_resend_seconds": settings.otp_resend_seconds,
            "otp_max_attempts": settings.otp_max_attempts,
        }

    # The website itself, served from the same address as the API. Added last so /api/* routes win.
    site = settings.frontend_path
    if site:
        app.mount("/", StaticFiles(directory=site, html=True), name="website")
    return app
