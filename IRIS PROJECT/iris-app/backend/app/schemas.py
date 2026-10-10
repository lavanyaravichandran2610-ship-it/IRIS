"""Request and response shapes."""
import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from .addresses import canonical_email, is_usable

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,189}\.[^@\s.]{2,}$")


def _email(v: str) -> str:
    v = (v or "").strip().lower()
    if len(v) > 254 or not EMAIL_RE.match(v):
        raise ValueError("Enter a valid email address.")
    v = canonical_email(v)
    if not is_usable(v):
        raise ValueError("Enter a valid email address.")
    return v


class OtpRequestIn(BaseModel):
    email: str
    purpose: Literal["signup", "signin"]
    name: str = ""

    _norm = field_validator("email")(_email)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join((v or "").split())
        if len(v) > 120:
            raise ValueError("Name is too long (120 characters at most).")
        return v


class OtpVerifyIn(BaseModel):
    email: str
    purpose: Literal["signup", "signin"]
    code: str

    _norm = field_validator("email")(_email)

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        v = (v or "").strip()
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("Enter all 6 digits.")
        return v


class GoogleIn(BaseModel):
    credential: str = Field(min_length=20, max_length=4096)


class ProfileIn(BaseModel):
    name: str | None = None
    org: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = " ".join(v.split())
        if not v:
            raise ValueError("Name cannot be empty.")
        if len(v) > 120:
            raise ValueError("Name is too long (120 characters at most).")
        return v

    @field_validator("org")
    @classmethod
    def _org(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = " ".join(v.split())
        if len(v) > 160:
            raise ValueError("Institution is too long (160 characters at most).")
        return v


class StateIn(BaseModel):
    state: dict[str, Any]
    base_rev: int = Field(ge=0)


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    org: str
    google: bool
    created: datetime


class AuthOut(BaseModel):
    token: str
    expires_at: datetime
    user: UserOut
