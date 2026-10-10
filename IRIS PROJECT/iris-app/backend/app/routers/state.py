"""The user's saved research history, stored as one JSON document with a revision number.

The revision number stops one device from silently overwriting another: a save must name
the revision it started from, and is refused (409) if the account has moved on since.
"""
import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import Settings
from ..database import get_db, utcnow
from ..deps import Auth, current_auth, get_settings
from ..errors import ApiError
from ..models import Workspace
from ..schemas import StateIn

router = APIRouter(prefix="/api/state", tags=["history"])
STATE_VERSION = 3


@router.get("")
def read_state(auth: Auth = Depends(current_auth), db: Session = Depends(get_db)):
    ws = db.get(Workspace, auth.user.id)
    if not ws:
        return {"state": None, "rev": 0}
    return {"state": json.loads(ws.data), "rev": ws.rev}


@router.get("/rev")
def read_rev(auth: Auth = Depends(current_auth), db: Session = Depends(get_db)):
    ws = db.get(Workspace, auth.user.id)
    return {"rev": ws.rev if ws else 0}


@router.put("")
def write_state(
    body: StateIn,
    request: Request,
    auth: Auth = Depends(current_auth),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if body.state.get("v") != STATE_VERSION:
        raise ApiError(422, "This saved history format is not supported.")
    data = json.dumps(body.state, separators=(",", ":"), ensure_ascii=False)
    if len(data.encode()) > settings.max_state_bytes:
        raise ApiError(413, "Your saved history is too large to store.")

    uid = auth.user.id
    ws = db.get(Workspace, uid)

    def conflict():
        db.rollback()
        cur = db.get(Workspace, uid)
        return ApiError(
            409,
            "Your account was updated on another device.",
            state=json.loads(cur.data) if cur else None,
            rev=cur.rev if cur else 0,
        )

    if not ws:
        if body.base_rev != 0:
            raise conflict()
        db.add(Workspace(user_id=uid, data=data, rev=1, updated_at=utcnow()))
        try:
            db.commit()
        except IntegrityError:
            raise conflict()
        return {"rev": 1}

    res = db.execute(
        update(Workspace)
        .where(Workspace.user_id == uid, Workspace.rev == body.base_rev)
        .values(data=data, rev=Workspace.rev + 1, updated_at=utcnow())
    )
    if res.rowcount != 1:
        raise conflict()
    db.commit()
    return {"rev": body.base_rev + 1}
