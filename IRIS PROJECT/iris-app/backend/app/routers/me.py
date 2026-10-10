"""The signed-in user's own account."""
from fastapi import APIRouter, Depends
from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import Auth, current_auth
from ..models import OtpCode
from ..schemas import ProfileIn, UserOut
from .auth import user_out

router = APIRouter(prefix="/api/me", tags=["account"])


@router.get("", response_model=UserOut)
def read_me(auth: Auth = Depends(current_auth)):
    return user_out(auth.user)


@router.patch("", response_model=UserOut)
def update_me(body: ProfileIn, auth: Auth = Depends(current_auth), db: Session = Depends(get_db)):
    user = db.merge(auth.user)
    if body.name is not None:
        user.name = body.name
    if body.org is not None:
        user.org = body.org
    db.commit()
    return user_out(user)


@router.delete("", status_code=204)
def delete_me(auth: Auth = Depends(current_auth), db: Session = Depends(get_db)):
    """Removes the account, its sessions, its saved history and any pending codes."""
    user = db.merge(auth.user)
    db.execute(delete(OtpCode).where(OtpCode.email == user.email))
    db.delete(user)
    db.commit()
