"""Sign up / sign in: emailed one-time codes and Google ID tokens."""
import logging
from datetime import timedelta, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import Settings
from ..addresses import canonical_email, is_usable
from ..database import get_db, utcnow
from ..deps import Auth, client_ip, current_auth, get_limiter, get_settings
from ..emailer import EmailError, send_otp_email
from ..errors import ApiError
from ..models import AuthSession, OtpCode, User
from ..schemas import AuthOut, GoogleIn, OtpRequestIn, OtpVerifyIn, UserOut
from ..security import RateLimiter, hash_otp, make_token, new_otp, new_session_id, otp_matches

log = logging.getLogger("iris.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, name=u.name, org=u.org or "", google=bool(u.google_sub), created=u.created_at.replace(tzinfo=timezone.utc))


def open_session(db: Session, settings: Settings, user: User, request: Request) -> AuthOut:
    expires = utcnow() + timedelta(days=settings.session_days)
    sid = new_session_id()
    db.add(
        AuthSession(
            id=sid,
            user_id=user.id,
            expires_at=expires,
            user_agent=(request.headers.get("user-agent") or "")[:200],
        )
    )
    user.last_login_at = utcnow()
    db.commit()
    return AuthOut(token=make_token(settings.secret_key, user.id, sid, expires), expires_at=expires, user=user_out(user))


def verify_google_token(credential: str, client_id: str) -> dict:
    """Validate a Google ID token (signature, expiry, issuer, audience). Replaced in tests."""
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    return id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)


# --------------------------------------------------------------------------- email codes
@router.post("/otp/request")
def request_code(
    body: OtpRequestIn,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    limiter: RateLimiter = Depends(get_limiter),
):
    if not limiter.allow(f"otp-req:{client_ip(request)}", settings.otp_ip_per_hour, 3600):
        raise ApiError(429, "Too many requests from this network. Try again later.")

    domains = settings.domain_list
    if domains and body.email.rsplit("@", 1)[1] not in domains:
        shown = " or ".join("@" + d for d in domains)
        raise ApiError(400, "Enter a Gmail address, for example name@gmail.com." if "gmail.com" in domains
                       else f"Use an address ending in {shown}.")

    exists = db.scalar(select(User.id).where(User.email == body.email)) is not None
    if body.purpose == "signup":
        if not body.name:
            raise ApiError(400, "Enter your full name.")
        if exists:
            raise ApiError(409, "An account already exists for this address. Use Sign in instead.")
    elif not exists:
        raise ApiError(404, "No account found for this address. Use Sign up to create one.")

    now = utcnow()
    last = db.scalar(select(func.max(OtpCode.created_at)).where(OtpCode.email == body.email))
    if last and (now - last).total_seconds() < settings.otp_resend_seconds:
        wait = int(settings.otp_resend_seconds - (now - last).total_seconds()) + 1
        raise ApiError(429, f"Wait {wait} seconds before requesting another code.",
                       headers={"Retry-After": str(wait)}, retry_after=wait)
    recent = db.scalar(
        select(func.count()).select_from(OtpCode).where(
            OtpCode.email == body.email, OtpCode.created_at > now - timedelta(hours=1)
        )
    )
    if recent >= settings.otp_max_per_hour:
        raise ApiError(429, "Too many codes requested for this address. Try again in an hour.")

    # housekeeping, then retire any earlier unused codes for this address
    db.execute(delete(OtpCode).where(OtpCode.created_at < now - timedelta(days=1)))
    db.execute(update(OtpCode).where(OtpCode.email == body.email, OtpCode.consumed.is_(False)).values(consumed=True))

    code = new_otp()
    row = OtpCode(
        email=body.email,
        purpose=body.purpose,
        code_hash=hash_otp(settings.secret_key, body.email, body.purpose, code),
        name=body.name,
        created_at=now,
        expires_at=now + timedelta(seconds=settings.otp_ttl_seconds),
    )
    db.add(row)
    db.commit()

    try:
        send_otp_email(settings, body.email, code, body.purpose, body.name)
    except EmailError as exc:
        log.error("Could not send verification email: %s", exc)
        db.delete(row)
        db.commit()
        raise ApiError(502, "We could not send the email. Try again in a moment.")

    out = {"sent": True, "expires_in": settings.otp_ttl_seconds, "resend_in": settings.otp_resend_seconds}
    if settings.debug_return_otp:
        out["dev_code"] = code
    return out


@router.post("/otp/verify", response_model=AuthOut)
def verify_code(
    body: OtpVerifyIn,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    limiter: RateLimiter = Depends(get_limiter),
):
    if not limiter.allow(f"otp-verify:{client_ip(request)}", 60, 600):
        raise ApiError(429, "Too many attempts from this network. Try again later.")

    row = db.scalar(
        select(OtpCode)
        .where(OtpCode.email == body.email, OtpCode.purpose == body.purpose, OtpCode.consumed.is_(False))
        .order_by(OtpCode.created_at.desc())
        .limit(1)
    )
    if not row:
        raise ApiError(400, "No active code for this address. Request a new one.")
    if row.expires_at <= utcnow():
        row.consumed = True
        db.commit()
        raise ApiError(400, "This code has expired. Request a new one.")

    # Take one of the limited attempts. The conditional UPDATE is atomic, so parallel guesses cannot
    # get more than otp_max_attempts tries between them.
    took = db.execute(
        update(OtpCode)
        .where(OtpCode.id == row.id, OtpCode.consumed.is_(False), OtpCode.attempts < settings.otp_max_attempts)
        .values(attempts=OtpCode.attempts + 1)
    ).rowcount
    if took != 1:
        db.execute(update(OtpCode).where(OtpCode.id == row.id).values(consumed=True))
        db.commit()
        raise ApiError(400, "Too many wrong attempts. Request a new code.", attempts_left=0)
    db.refresh(row)

    if not otp_matches(settings.secret_key, body.email, body.purpose, body.code, row.code_hash):
        left = max(0, settings.otp_max_attempts - row.attempts)
        if left == 0:
            db.execute(update(OtpCode).where(OtpCode.id == row.id).values(consumed=True))
        db.commit()
        if left == 0:
            raise ApiError(400, "Too many wrong attempts. Request a new code.", attempts_left=0)
        raise ApiError(400, "That code is not correct.", attempts_left=left)

    # A correct code works once, even if two requests carry it at the same moment.
    used = db.execute(
        update(OtpCode).where(OtpCode.id == row.id, OtpCode.consumed.is_(False)).values(consumed=True)
    ).rowcount
    if used != 1:
        db.rollback()
        raise ApiError(400, "No active code for this address. Request a new one.")
    user = db.scalar(select(User).where(User.email == body.email))
    if body.purpose == "signup":
        if user:
            db.commit()
            raise ApiError(409, "An account already exists for this address. Use Sign in instead.")
        user = User(email=body.email, name=row.name or body.email.split("@")[0])
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise ApiError(409, "An account already exists for this address. Use Sign in instead.")
    elif not user:
        db.commit()
        raise ApiError(404, "No account found for this address. Use Sign up to create one.")
    return open_session(db, settings, user, request)


# --------------------------------------------------------------------------- Google
@router.post("/google", response_model=AuthOut)
def google_login(
    body: GoogleIn,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    limiter: RateLimiter = Depends(get_limiter),
):
    if not settings.google_client_id:
        raise ApiError(503, "Google sign-in is not set up on this server.")
    if not limiter.allow(f"google:{client_ip(request)}", 60, 600):
        raise ApiError(429, "Too many attempts from this network. Try again later.")
    try:
        claims = verify_google_token(body.credential, settings.google_client_id)
    except Exception as exc:
        log.info("Google token rejected: %s", exc)
        raise ApiError(401, "Google sign-in could not be verified. Try again.")

    email = canonical_email(str(claims.get("email", "")))
    sub = str(claims.get("sub", ""))
    if not is_usable(email) or not sub or claims.get("email_verified") is not True:
        raise ApiError(401, "Google did not confirm this email address.")

    user = db.scalar(select(User).where(User.google_sub == sub)) or db.scalar(select(User).where(User.email == email))
    if user:
        if not user.google_sub:
            user.google_sub = sub  # Google has verified this email, so link the accounts
        elif user.google_sub != sub:
            raise ApiError(409, "This email is linked to a different Google account.")
    else:
        name = " ".join(str(claims.get("name") or "").split())[:120] or email.split("@")[0]
        user = User(email=email, name=name, google_sub=sub)
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise ApiError(409, "Could not create the account. Try again.")
    return open_session(db, settings, user, request)


# --------------------------------------------------------------------------- sign out
@router.post("/logout", status_code=204)
def logout(auth: Auth = Depends(current_auth), db: Session = Depends(get_db)):
    auth.session.revoked = True
    db.merge(auth.session)
    db.commit()


@router.post("/logout-all")
def logout_all(auth: Auth = Depends(current_auth), db: Session = Depends(get_db)):
    res = db.execute(
        update(AuthSession).where(AuthSession.user_id == auth.user.id, AuthSession.revoked.is_(False)).values(revoked=True)
    )
    db.commit()
    return {"revoked": res.rowcount}
