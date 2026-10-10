"""Sends the verification email. Providers: console (development), brevo, resend, smtp."""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from html import escape

import httpx

from .config import Settings

log = logging.getLogger("iris.email")


class EmailError(Exception):
    pass


def _content(code: str, minutes: int, name: str, purpose: str) -> tuple[str, str, str]:
    action = "create your IRIS account" if purpose == "signup" else "sign in to IRIS"
    subject = f"{code} is your IRIS verification code"
    hello = f"Hi {name}," if name else "Hi,"
    text = (
        f"{hello}\n\nUse this code to {action}:\n\n    {code}\n\n"
        f"It expires in {minutes} minutes and works once. "
        "If you did not ask for it, you can ignore this email.\n\nIRIS"
    )
    html = (
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#0E1A2B">'
        f"<p>{escape(hello)}</p><p>Use this code to {action}:</p>"
        f'<p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:20px 0">{code}</p>'
        f"<p>It expires in {minutes} minutes and works once. "
        "If you did not ask for it, you can ignore this email.</p>"
        '<p style="color:#55657B">IRIS: Intelligent Research &amp; Innovation System</p></div>'
    )
    return subject, text, html


def send_otp_email(settings: Settings, to: str, code: str, purpose: str, name: str = "") -> None:
    subject, text, html = _content(code, settings.otp_ttl_seconds // 60, name, purpose)
    provider = settings.email_provider
    try:
        if provider == "console":
            log.warning("[DEV EMAIL] to=%s code=%s purpose=%s", to, code, purpose)
        elif provider == "brevo":
            r = httpx.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": settings.brevo_api_key, "accept": "application/json"},
                json={
                    "sender": {"name": settings.email_from_name, "email": settings.email_from},
                    "to": [{"email": to}],
                    "subject": subject,
                    "htmlContent": html,
                    "textContent": text,
                },
                timeout=15,
            )
            if r.status_code >= 300:
                raise EmailError(f"brevo returned {r.status_code}: {r.text[:200]}")
        elif provider == "resend":
            r = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": f"{settings.email_from_name} <{settings.email_from}>",
                    "to": [to],
                    "subject": subject,
                    "html": html,
                    "text": text,
                },
                timeout=15,
            )
            if r.status_code >= 300:
                raise EmailError(f"resend returned {r.status_code}: {r.text[:200]}")
        elif provider == "smtp":
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = f"{settings.email_from_name} <{settings.email_from}>"
            msg["To"] = to
            msg.set_content(text)
            msg.add_alternative(html, subtype="html")
            ctx = ssl.create_default_context()
            if settings.smtp_ssl:
                with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=ctx, timeout=15) as s:
                    s.login(settings.smtp_user, settings.smtp_password)
                    s.send_message(msg)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
                    s.starttls(context=ctx)
                    s.login(settings.smtp_user, settings.smtp_password)
                    s.send_message(msg)
    except EmailError:
        raise
    except Exception as exc:  # network errors, auth failures, timeouts
        raise EmailError(f"{provider} failed: {exc.__class__.__name__}: {exc}") from exc
