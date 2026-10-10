"""Database engine and session helpers (SQLite for local use, PostgreSQL in production)."""
from collections.abc import Iterator
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    """Naive UTC timestamp. All columns store UTC without a timezone."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def normalise_url(url: str) -> str:
    """Accept the URL styles that hosting providers hand out and select the psycopg 3 driver."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def make_engine(url: str) -> Engine:
    url = normalise_url(url)
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})
    # pool_pre_ping and pool_recycle survive providers that close idle connections (Neon, Supabase)
    return create_engine(url, pool_pre_ping=True, pool_recycle=300)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db(request: Request) -> Iterator[Session]:
    db = request.app.state.SessionLocal()
    try:
        yield db
    finally:
        db.close()
