"""Shared request dependencies."""
from dataclasses import dataclass

import jwt
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .config import Settings
from .database import get_db, utcnow
from .errors import ApiError
from .models import AuthSession, User
from .security import RateLimiter, decode_token


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_limiter(request: Request) -> RateLimiter:
    return request.app.state.limiter


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@dataclass
class Auth:
    user: User
    session: AuthSession


def _unauthorised(message: str = "Please sign in to continue.") -> ApiError:
    return ApiError(401, message, headers={"WWW-Authenticate": "Bearer"})


def current_auth(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Auth:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthorised()
    try:
        claims = decode_token(settings.secret_key, token.strip())
    except jwt.ExpiredSignatureError:
        raise _unauthorised("Your session has expired. Sign in again.")
    except jwt.PyJWTError:
        raise _unauthorised()
    sess = db.get(AuthSession, claims["jti"])
    if not sess or sess.revoked or sess.expires_at <= utcnow() or str(sess.user_id) != claims["sub"]:
        raise _unauthorised("Your session has ended. Sign in again.")
    user = db.get(User, sess.user_id)
    if not user:
        raise _unauthorised()
    return Auth(user=user, session=sess)
