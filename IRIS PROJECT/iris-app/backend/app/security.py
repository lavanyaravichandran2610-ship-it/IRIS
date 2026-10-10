"""Code hashing, session tokens and a small in-memory rate limiter."""
import hashlib
import hmac
import secrets
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone

import jwt

ALGORITHM = "HS256"


def new_otp() -> str:
    """A uniformly random 6-digit code."""
    return f"{secrets.randbelow(900_000) + 100_000}"


def hash_otp(secret: str, email: str, purpose: str, code: str) -> str:
    msg = f"{email}|{purpose}|{code}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def otp_matches(secret: str, email: str, purpose: str, code: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_otp(secret, email, purpose, code), stored_hash)


def new_session_id() -> str:
    return uuid.uuid4().hex


def make_token(secret: str, user_id: int, session_id: str, expires_at: datetime) -> str:
    exp = expires_at.replace(tzinfo=timezone.utc)
    payload = {"sub": str(user_id), "jti": session_id, "iat": datetime.now(timezone.utc), "exp": exp}
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def decode_token(secret: str, token: str) -> dict:
    return jwt.decode(
        token, secret, algorithms=[ALGORITHM], options={"require": ["exp", "sub", "jti"]}
    )


class RateLimiter:
    """Sliding-window limiter. In memory, so it applies per server process."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - window_seconds:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            if len(self._hits) > 20_000:  # keep memory bounded
                for k in [k for k, v in self._hits.items() if not v][:5_000]:
                    self._hits.pop(k, None)
            return True
