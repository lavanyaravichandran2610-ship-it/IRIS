from datetime import timedelta

import httpx
import pytest
from sqlalchemy import func, select

from app import emailer
from app.config import Settings
from app.database import normalise_url, utcnow
from app.emailer import EmailError
from app.models import AuthSession, OtpCode, User, Workspace
from app.security import make_token, new_session_id

from .conftest import bearer, signin, signup

GOOD = {"v": 3, "library": ["mirsky2018"], "runs": [], "manuscript": "hello"}


def db_of(client):
    return client.app.state.SessionLocal()


# ------------------------------------------------------------------ basics
def test_health_and_public_config(client):
    assert client.get("/api/health").json()["status"] == "ok"
    cfg = client.get("/api/config").json()
    assert cfg["google_client_id"].endswith("googleusercontent.com")
    assert "gmail.com" in cfg["allowed_email_domains"]
    assert "secret" not in str(cfg).lower()


def test_api_responses_are_not_cached(client):
    r = client.get("/api/health")
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["x-content-type-options"] == "nosniff"


# ------------------------------------------------------------------ email codes
def test_signup_with_emailed_code(client):
    auth = signup(client, "Student@Gmail.com", "  Student   One ")
    assert auth["user"]["email"] == "student@gmail.com"
    assert auth["user"]["name"] == "Student One"
    assert auth["user"]["google"] is False
    me = client.get("/api/me", headers=bearer(auth))
    assert me.status_code == 200 and me.json()["email"] == "student@gmail.com"


def test_code_is_stored_hashed_and_is_single_use(client):
    r = client.post("/api/auth/otp/request", json={"email": "a@gmail.com", "purpose": "signup", "name": "A"})
    code = r.json()["dev_code"]
    with db_of(client) as db:
        row = db.scalar(select(OtpCode))
        assert row.code_hash != code and len(row.code_hash) == 64
    body = {"email": "a@gmail.com", "purpose": "signup", "code": code}
    assert client.post("/api/auth/otp/verify", json=body).status_code == 200
    again = client.post("/api/auth/otp/verify", json=body)
    assert again.status_code == 400 and "No active code" in again.json()["detail"]


def test_code_not_returned_when_debug_off(make_client):
    c = make_client(debug_return_otp=False)
    r = c.post("/api/auth/otp/request", json={"email": "a@gmail.com", "purpose": "signup", "name": "A"})
    assert r.status_code == 200 and "dev_code" not in r.json()


def test_signup_and_signin_rules(client):
    signup(client)
    dup = client.post("/api/auth/otp/request", json={"email": "student@gmail.com", "purpose": "signup", "name": "X"})
    assert dup.status_code == 409
    unknown = client.post("/api/auth/otp/request", json={"email": "nobody@gmail.com", "purpose": "signin"})
    assert unknown.status_code == 404
    other = client.post("/api/auth/otp/request", json={"email": "x@yahoo.com", "purpose": "signup", "name": "X"})
    assert other.status_code == 400 and "Gmail" in other.json()["detail"]
    noname = client.post("/api/auth/otp/request", json={"email": "n@gmail.com", "purpose": "signup", "name": " "})
    assert noname.status_code == 400 and "full name" in noname.json()["detail"]
    bad = client.post("/api/auth/otp/request", json={"email": "not-an-email", "purpose": "signin"})
    assert bad.status_code == 422 and bad.json()["detail"] == "Enter a valid email address."


def test_sign_in_returns_same_user(client):
    first = signup(client)
    second = signin(client)
    assert second["user"]["id"] == first["user"]["id"]
    assert second["token"] != first["token"]


def test_wrong_codes_lock_the_code(client):
    r = client.post("/api/auth/otp/request", json={"email": "a@gmail.com", "purpose": "signup", "name": "A"})
    real = r.json()["dev_code"]
    wrong = "000000" if real != "000000" else "111111"
    body = {"email": "a@gmail.com", "purpose": "signup", "code": wrong}
    first = client.post("/api/auth/otp/verify", json=body)
    assert first.status_code == 400 and first.json()["attempts_left"] == 4
    for _ in range(4):
        last = client.post("/api/auth/otp/verify", json=body)
    assert last.json()["attempts_left"] == 0
    late = client.post("/api/auth/otp/verify", json={**body, "code": real})
    assert late.status_code == 400  # the right code no longer works
    fresh = client.post("/api/auth/otp/request", json={"email": "a@gmail.com", "purpose": "signup", "name": "A"})
    ok = client.post("/api/auth/otp/verify", json={**body, "code": fresh.json()["dev_code"]})
    assert ok.status_code == 200


def test_expired_code_is_rejected(client):
    r = client.post("/api/auth/otp/request", json={"email": "a@gmail.com", "purpose": "signup", "name": "A"})
    with db_of(client) as db:
        row = db.scalar(select(OtpCode))
        row.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    v = client.post("/api/auth/otp/verify", json={"email": "a@gmail.com", "purpose": "signup", "code": r.json()["dev_code"]})
    assert v.status_code == 400 and "expired" in v.json()["detail"]


def test_new_request_replaces_old_code(client):
    a = client.post("/api/auth/otp/request", json={"email": "a@gmail.com", "purpose": "signup", "name": "A"}).json()["dev_code"]
    b = client.post("/api/auth/otp/request", json={"email": "a@gmail.com", "purpose": "signup", "name": "A"}).json()["dev_code"]
    if a != b:
        old = client.post("/api/auth/otp/verify", json={"email": "a@gmail.com", "purpose": "signup", "code": a})
        assert old.status_code == 400
    assert client.post("/api/auth/otp/verify", json={"email": "a@gmail.com", "purpose": "signup", "code": b}).status_code == 200


def test_resend_cooldown(make_client):
    c = make_client(otp_resend_seconds=30)
    ok = c.post("/api/auth/otp/request", json={"email": "a@gmail.com", "purpose": "signup", "name": "A"})
    assert ok.status_code == 200
    again = c.post("/api/auth/otp/request", json={"email": "a@gmail.com", "purpose": "signup", "name": "A"})
    assert again.status_code == 429 and again.json()["retry_after"] > 0 and "Retry-After" in again.headers


def test_hourly_cap_per_address(make_client):
    c = make_client(otp_max_per_hour=2)
    body = {"email": "a@gmail.com", "purpose": "signup", "name": "A"}
    assert c.post("/api/auth/otp/request", json=body).status_code == 200
    assert c.post("/api/auth/otp/request", json=body).status_code == 200
    assert c.post("/api/auth/otp/request", json=body).status_code == 429


def test_per_network_cap_is_configurable(make_client):
    c = make_client(otp_ip_per_hour=5)
    for i in range(5):
        c.post("/api/auth/otp/request", json={"email": f"u{i}@gmail.com", "purpose": "signin"})
    r = c.post("/api/auth/otp/request", json={"email": "late@gmail.com", "purpose": "signin"})
    assert r.status_code == 429
    roomy = make_client(otp_ip_per_hour=100)
    for i in range(40):
        assert roomy.post("/api/auth/otp/request", json={"email": f"u{i}@gmail.com", "purpose": "signin"}).status_code != 429


def test_gmail_aliases_are_one_account(client):
    first = signup(client, "T.U+lab@Gmail.com", "Tee You")
    assert first["user"]["email"] == "tu@gmail.com"
    again = signin(client, "tu@googlemail.com")
    assert again["user"]["id"] == first["user"]["id"]
    dup = client.post("/api/auth/otp/request", json={"email": "t.u@gmail.com", "purpose": "signup", "name": "X"})
    assert dup.status_code == 409
    junk = client.post("/api/auth/otp/request", json={"email": "+tag@gmail.com", "purpose": "signup", "name": "X"})
    assert junk.status_code == 422


def test_google_account_with_dots_links_to_the_same_account(client, monkeypatch):
    first = signup(client, "firstlast@gmail.com", "First Last")
    fake_google(monkeypatch, email="First.Last@gmail.com", sub="g-dots")
    g = client.post("/api/auth/google", json=CRED).json()
    assert g["user"]["id"] == first["user"]["id"]


def test_attempt_limit_follows_the_setting(make_client):
    c = make_client(otp_max_attempts=2)
    real = c.post("/api/auth/otp/request", json={"email": "a@gmail.com", "purpose": "signup", "name": "A"}).json()["dev_code"]
    wrong = "000000" if real != "000000" else "111111"
    body = {"email": "a@gmail.com", "purpose": "signup", "code": wrong}
    assert c.post("/api/auth/otp/verify", json=body).json()["attempts_left"] == 1
    last = c.post("/api/auth/otp/verify", json=body)
    assert last.status_code == 400 and last.json()["attempts_left"] == 0
    assert c.post("/api/auth/otp/verify", json={**body, "code": real}).status_code == 400


# ------------------------------------------------------------------ website serving and headers
def test_website_is_served_with_security_headers(make_client, tmp_path):
    site = tmp_path / "site"
    site.mkdir()
    (site / "index.html").write_text("<!doctype html><title>IRIS</title>")
    c = make_client(frontend_dir=str(site))
    page = c.get("/")
    assert page.status_code == 200 and "IRIS" in page.text
    csp = page.headers["content-security-policy"]
    assert "accounts.google.com/gsi/client" in csp and "frame-ancestors 'none'" in csp
    assert page.headers["cache-control"] == "no-cache"
    assert page.headers["cross-origin-opener-policy"] == "same-origin-allow-popups"
    api = c.get("/api/health")
    assert "content-security-policy" not in api.headers and api.headers["cache-control"] == "no-store"
    missing = c.get("/api/does-not-exist")
    assert missing.status_code == 404 and "content-security-policy" not in missing.headers


def test_csp_can_be_switched_off_and_site_can_be_disabled(make_client, tmp_path):
    site = tmp_path / "site"
    site.mkdir()
    (site / "index.html").write_text("<title>IRIS</title>")
    assert "content-security-policy" not in make_client(frontend_dir=str(site), csp_enabled=False).get("/").headers
    assert make_client(serve_frontend=False).get("/").status_code == 404


def test_email_failure_returns_502_and_leaves_no_code(client, monkeypatch):
    def boom(*a, **k):
        raise EmailError("provider down")

    monkeypatch.setattr("app.routers.auth.send_otp_email", boom)
    r = client.post("/api/auth/otp/request", json={"email": "a@gmail.com", "purpose": "signup", "name": "A"})
    assert r.status_code == 502
    with db_of(client) as db:
        assert db.scalar(select(func.count()).select_from(OtpCode)) == 0


# ------------------------------------------------------------------ Google
def fake_google(monkeypatch, **claims):
    base = {"sub": "g-123", "email": "g.user@gmail.com", "email_verified": True, "name": "Google User"}
    base.update(claims)
    monkeypatch.setattr("app.routers.auth.verify_google_token", lambda cred, cid: base)


CRED = {"credential": "x" * 40}


def test_google_creates_then_reuses_account(client, monkeypatch):
    fake_google(monkeypatch)
    first = client.post("/api/auth/google", json=CRED).json()
    assert first["user"]["google"] is True and first["user"]["name"] == "Google User"
    second = client.post("/api/auth/google", json=CRED).json()
    assert second["user"]["id"] == first["user"]["id"]


def test_google_links_existing_email_account(client, monkeypatch):
    email_user = signup(client, "g.user@gmail.com", "Typed Name")
    fake_google(monkeypatch)
    g = client.post("/api/auth/google", json=CRED).json()
    assert g["user"]["id"] == email_user["user"]["id"] and g["user"]["google"] is True
    assert g["user"]["name"] == "Typed Name"  # an existing name is not overwritten


def test_google_rejects_unverified_bad_and_unconfigured(client, make_client, monkeypatch):
    fake_google(monkeypatch, email_verified=False)
    assert client.post("/api/auth/google", json=CRED).status_code == 401

    def bad(cred, cid):
        raise ValueError("Wrong audience")

    monkeypatch.setattr("app.routers.auth.verify_google_token", bad)
    assert client.post("/api/auth/google", json=CRED).status_code == 401

    off = make_client(google_client_id="")
    assert off.post("/api/auth/google", json=CRED).status_code == 503


def test_google_token_is_checked_against_the_configured_client(client, monkeypatch):
    seen = {}

    def spy(cred, cid):
        seen["cid"] = cid
        return {"sub": "s1", "email": "z@gmail.com", "email_verified": True, "name": "Z"}

    monkeypatch.setattr("app.routers.auth.verify_google_token", spy)
    client.post("/api/auth/google", json=CRED)
    assert seen["cid"] == "test-client.apps.googleusercontent.com"


# ------------------------------------------------------------------ sessions
def test_requires_a_valid_token(client):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401
    auth = signup(client)
    tampered = auth["token"][:-3] + ("abc" if not auth["token"].endswith("abc") else "xyz")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {tampered}"}).status_code == 401


def test_expired_token_is_refused(client):
    auth = signup(client)
    past = utcnow() - timedelta(minutes=5)
    tok = make_token(client.app.state.settings.secret_key, auth["user"]["id"], new_session_id(), past)
    r = client.get("/api/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401 and "expired" in r.json()["detail"]


def test_logout_ends_only_that_session(client):
    a = signup(client)
    b = signin(client)
    assert client.post("/api/auth/logout", headers=bearer(a)).status_code == 204
    assert client.get("/api/me", headers=bearer(a)).status_code == 401
    assert client.get("/api/me", headers=bearer(b)).status_code == 200


def test_logout_all_ends_every_session(client):
    a = signup(client)
    b = signin(client)
    r = client.post("/api/auth/logout-all", headers=bearer(a))
    assert r.json()["revoked"] == 2
    assert client.get("/api/me", headers=bearer(b)).status_code == 401


# ------------------------------------------------------------------ profile
def test_profile_update_and_validation(client):
    a = signup(client)
    r = client.patch("/api/me", json={"name": "New Name", "org": "Sri Shakthi"}, headers=bearer(a))
    assert r.status_code == 200 and r.json()["name"] == "New Name" and r.json()["org"] == "Sri Shakthi"
    assert client.get("/api/me", headers=bearer(a)).json()["org"] == "Sri Shakthi"
    assert client.patch("/api/me", json={"name": "  "}, headers=bearer(a)).status_code == 422
    assert client.patch("/api/me", json={"org": "x" * 200}, headers=bearer(a)).status_code == 422


def test_delete_account_removes_everything(client):
    a = signup(client)
    client.put("/api/state", json={"state": GOOD, "base_rev": 0}, headers=bearer(a))
    uid = a["user"]["id"]
    assert client.delete("/api/me", headers=bearer(a)).status_code == 204
    assert client.get("/api/me", headers=bearer(a)).status_code == 401
    with db_of(client) as db:
        assert db.get(User, uid) is None
        assert db.scalar(select(func.count()).select_from(AuthSession)) == 0
        assert db.scalar(select(func.count()).select_from(Workspace)) == 0
        assert db.scalar(select(func.count()).select_from(OtpCode)) == 0
    signup(client)  # the address can be used again


# ------------------------------------------------------------------ history
def test_state_round_trip_and_revisions(client):
    a = signup(client)
    h = bearer(a)
    assert client.get("/api/state", headers=h).json() == {"state": None, "rev": 0}
    assert client.put("/api/state", json={"state": GOOD, "base_rev": 0}, headers=h).json() == {"rev": 1}
    got = client.get("/api/state", headers=h).json()
    assert got["rev"] == 1 and got["state"] == GOOD
    newer = {**GOOD, "manuscript": "edited"}
    assert client.put("/api/state", json={"state": newer, "base_rev": 1}, headers=h).json() == {"rev": 2}
    assert client.get("/api/state/rev", headers=h).json() == {"rev": 2}


def test_stale_save_is_refused_with_the_latest_copy(client):
    a = signup(client)
    h = bearer(a)
    client.put("/api/state", json={"state": GOOD, "base_rev": 0}, headers=h)
    client.put("/api/state", json={"state": {**GOOD, "manuscript": "laptop"}, "base_rev": 1}, headers=h)
    stale = client.put("/api/state", json={"state": {**GOOD, "manuscript": "phone"}, "base_rev": 1}, headers=h)
    assert stale.status_code == 409
    body = stale.json()
    assert body["rev"] == 2 and body["state"]["manuscript"] == "laptop"
    first_again = client.put("/api/state", json={"state": GOOD, "base_rev": 0}, headers=h)
    assert first_again.status_code == 409


def test_state_validation_and_size_limit(make_client):
    c = make_client(max_state_bytes=2000)
    a = signup(c)
    h = bearer(a)
    assert c.put("/api/state", json={"state": {"v": 2}, "base_rev": 0}, headers=h).status_code == 422
    big = {**GOOD, "manuscript": "x" * 5000}
    assert c.put("/api/state", json={"state": big, "base_rev": 0}, headers=h).status_code == 413
    assert c.put("/api/state", json={"state": GOOD}, headers=h).status_code == 422  # base_rev required
    assert c.put("/api/state", json={"state": GOOD, "base_rev": 0}, headers={}).status_code == 401


def test_each_user_sees_only_their_own_history(client):
    a = signup(client, "a@gmail.com", "A")
    b = signup(client, "b@gmail.com", "B")
    client.put("/api/state", json={"state": {**GOOD, "manuscript": "secret of A"}, "base_rev": 0}, headers=bearer(a))
    assert client.get("/api/state", headers=bearer(b)).json() == {"state": None, "rev": 0}
    assert "secret of A" not in client.get("/api/state", headers=bearer(b)).text


# ------------------------------------------------------------------ CORS
def test_cors_allows_only_listed_origins(client):
    ok = client.options(
        "/api/state",
        headers={"Origin": "http://localhost:8000", "Access-Control-Request-Method": "PUT",
                 "Access-Control-Request-Headers": "authorization,content-type"},
    )
    assert ok.status_code == 200 and ok.headers["access-control-allow-origin"] == "http://localhost:8000"
    no = client.options(
        "/api/state",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "PUT"},
    )
    assert "access-control-allow-origin" not in no.headers


# ------------------------------------------------------------------ configuration and email
def test_production_refuses_unsafe_settings():
    with pytest.raises(RuntimeError) as e:
        Settings(_env_file=None, env="production", secret_key="short", debug_return_otp=True).prepare()
    msg = str(e.value)
    assert "SECRET_KEY" in msg and "DEBUG_RETURN_OTP" in msg and "EMAIL_PROVIDER" in msg
    with pytest.raises(RuntimeError):
        Settings(_env_file=None, env="production", secret_key="k" * 40, email_provider="brevo",
                 email_from="a@b.co", brevo_api_key="k", cors_origins="*").prepare()
    good = Settings(_env_file=None, env="production", secret_key="k" * 40, email_provider="brevo",
                    email_from="me@gmail.com", brevo_api_key="key", cors_origins="https://iris.example").prepare()
    assert good.is_production


def test_production_allows_empty_cors_when_the_backend_serves_the_site():
    ok = Settings(_env_file=None, env="production", secret_key="k" * 40, email_provider="resend",
                  email_from="login@iris.example", resend_api_key="key", cors_origins="").prepare()
    assert ok.cors_list == []


def test_database_url_normalisation():
    assert normalise_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalise_url("postgresql://u:p@h/db?sslmode=require") == "postgresql+psycopg://u:p@h/db?sslmode=require"
    assert normalise_url("sqlite:///x.db") == "sqlite:///x.db"


def test_brevo_request_shape(monkeypatch):
    sent = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        sent.update(url=url, headers=headers, json=json)
        return httpx.Response(201, json={"messageId": "1"})

    monkeypatch.setattr(emailer.httpx, "post", fake_post)
    s = Settings(_env_file=None, email_provider="brevo", brevo_api_key="KEY", email_from="me@gmail.com", email_from_name="IRIS")
    emailer.send_otp_email(s, "to@gmail.com", "123456", "signup", "Ann <b>")
    assert sent["url"] == "https://api.brevo.com/v3/smtp/email"
    assert sent["headers"]["api-key"] == "KEY"
    assert sent["json"]["to"] == [{"email": "to@gmail.com"}]
    assert sent["json"]["sender"]["email"] == "me@gmail.com"
    assert "123456" in sent["json"]["textContent"] and "123456" in sent["json"]["htmlContent"]
    assert "Ann &lt;b&gt;" in sent["json"]["htmlContent"]  # names are escaped in the HTML body


def test_brevo_error_is_reported(monkeypatch):
    monkeypatch.setattr(emailer.httpx, "post", lambda *a, **k: httpx.Response(401, json={"message": "bad key"}))
    s = Settings(_env_file=None, email_provider="brevo", brevo_api_key="KEY", email_from="me@gmail.com")
    with pytest.raises(EmailError):
        emailer.send_otp_email(s, "to@gmail.com", "123456", "signin")


def test_resend_request_shape(monkeypatch):
    sent = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        sent.update(url=url, headers=headers, json=json)
        return httpx.Response(200, json={"id": "1"})

    monkeypatch.setattr(emailer.httpx, "post", fake_post)
    s = Settings(_env_file=None, email_provider="resend", resend_api_key="RK", email_from="no-reply@example.com")
    emailer.send_otp_email(s, "to@gmail.com", "654321", "signin")
    assert sent["url"] == "https://api.resend.com/emails" and sent["headers"]["Authorization"] == "Bearer RK"
    assert sent["json"]["from"] == "IRIS <no-reply@example.com>"


# ------------------------------------------------------------------ email providers: SMTP
def smtp_settings(**kw):
    base = dict(env="development", secret_key="x" * 40, email_provider="smtp", email_from="iris.sender@gmail.com",
                smtp_host="smtp.gmail.com", smtp_user="iris.sender@gmail.com", smtp_password="app-password-here")
    base.update(kw)
    return Settings(_env_file=None, **base)


def fake_smtp(monkeypatch, fail_login=False):
    calls = []

    class Fake:
        def __init__(self, host, port, **kw):
            calls.append(("connect", host, port))

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self, context=None):
            calls.append(("starttls",))

        def login(self, user, password):
            if fail_login:
                import smtplib

                raise smtplib.SMTPAuthenticationError(535, b"bad credentials")
            calls.append(("login", user, password))

        def send_message(self, msg):
            calls.append(("send", msg["To"], msg["Subject"], msg["From"], msg.get_body(("plain",)).get_content()))

    monkeypatch.setattr(emailer.smtplib, "SMTP", Fake)
    monkeypatch.setattr(emailer.smtplib, "SMTP_SSL", Fake)
    return calls


def test_smtp_sends_through_starttls_then_login(monkeypatch):
    calls = fake_smtp(monkeypatch)
    emailer.send_otp_email(smtp_settings(), "student@gmail.com", "482913", "signup", "Student One")
    assert [c[0] for c in calls] == ["connect", "starttls", "login", "send"]
    assert calls[0][1:] == ("smtp.gmail.com", 587)
    _, to, subject, sender, body = calls[3]
    assert to == "student@gmail.com" and "482913" in subject and "IRIS" in sender
    assert "482913" in body and "expires in 5 minutes" in body


def test_smtp_implicit_tls_port(monkeypatch):
    calls = fake_smtp(monkeypatch)
    emailer.send_otp_email(smtp_settings(smtp_ssl=True, smtp_port=465), "a@gmail.com", "111222", "signin")
    assert [c[0] for c in calls] == ["connect", "login", "send"] and calls[0][2] == 465


def test_smtp_failure_is_reported_as_email_error(monkeypatch):
    fake_smtp(monkeypatch, fail_login=True)
    with pytest.raises(EmailError) as exc:
        emailer.send_otp_email(smtp_settings(), "a@gmail.com", "111222", "signin")
    assert "SMTPAuthenticationError" in str(exc.value) and "app-password-here" not in str(exc.value)


def test_user_created_time_is_marked_utc(client):
    auth = signup(client)
    assert auth["user"]["created"].endswith(("Z", "+00:00"))
