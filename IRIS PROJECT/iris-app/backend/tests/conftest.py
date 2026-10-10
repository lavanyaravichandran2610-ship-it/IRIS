import os

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.database import Base
from app.main import create_app


def make_settings(tmp_path, **overrides) -> Settings:
    base = dict(
        env="development",
        secret_key="test-secret-" + "x" * 40,
        database_url=os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{tmp_path / 'test.db'}",
        email_provider="console",
        debug_return_otp=True,
        google_client_id="test-client.apps.googleusercontent.com",
        otp_resend_seconds=0,
        cors_origins="http://localhost:8000",
    )
    base.update(overrides)
    return Settings(_env_file=None, **base)


@pytest.fixture
def make_client(tmp_path):
    clients = []

    def _make(**overrides):
        c = TestClient(create_app(make_settings(tmp_path, **overrides)))
        c.__enter__()
        clients.append(c)
        return c

    yield _make
    for c in clients:
        Base.metadata.drop_all(c.app.state.engine)  # keeps a shared Postgres clean between tests
        c.__exit__(None, None, None)


@pytest.fixture
def client(make_client):
    return make_client()


def signup(client, email="student@gmail.com", name="Student One"):
    r = client.post("/api/auth/otp/request", json={"email": email, "purpose": "signup", "name": name})
    assert r.status_code == 200, r.text
    r = client.post("/api/auth/otp/verify", json={"email": email, "purpose": "signup", "code": r.json()["dev_code"]})
    assert r.status_code == 200, r.text
    return r.json()


def signin(client, email="student@gmail.com"):
    r = client.post("/api/auth/otp/request", json={"email": email, "purpose": "signin"})
    assert r.status_code == 200, r.text
    r = client.post("/api/auth/otp/verify", json={"email": email, "purpose": "signin", "code": r.json()["dev_code"]})
    assert r.status_code == 200, r.text
    return r.json()


def bearer(auth):
    return {"Authorization": f"Bearer {auth['token']}"}
