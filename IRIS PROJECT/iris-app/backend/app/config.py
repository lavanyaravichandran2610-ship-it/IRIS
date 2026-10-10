"""Application settings, read from environment variables (or a .env file)."""
import logging
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("iris.config")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- general -----------------------------------------------------------
    env: str = "development"          # set ENV=production when deployed
    secret_key: str = ""              # signs session tokens and OTP hashes (32+ chars in production)
    database_url: str = "sqlite:///./iris.db"
    cors_origins: str = (
        "http://localhost:8000,http://127.0.0.1:8000,http://localhost:5500,http://127.0.0.1:5500"
    )

    # --- sign-in -----------------------------------------------------------
    # Domains allowed to sign up with an emailed code. Google sign-in accepts any verified Google account.
    allowed_email_domains: str = "gmail.com,googlemail.com"
    google_client_id: str = ""

    otp_ttl_seconds: int = 300
    otp_max_attempts: int = 5
    otp_resend_seconds: int = 30
    otp_max_per_hour: int = 6          # codes per email address per hour
    otp_ip_per_hour: int = 30          # codes per network address per hour (raise it for a classroom on one WiFi)
    session_days: int = 14

    # --- email -------------------------------------------------------------
    email_provider: str = "console"   # console | brevo | resend | smtp
    email_from: str = ""
    email_from_name: str = "IRIS"
    brevo_api_key: str = ""
    resend_api_key: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_ssl: bool = False            # true = implicit TLS (port 465); false = STARTTLS (port 587)

    # --- limits / debugging ------------------------------------------------
    max_state_bytes: int = 2_000_000
    debug_return_otp: bool = False    # development only: return the code in the API response

    # --- serving the website from this same app (one URL, no CORS needed) -----
    serve_frontend: bool = True
    frontend_dir: str = ""            # default: the ../frontend folder next to this backend folder
    csp_enabled: bool = True          # Content-Security-Policy on the website pages

    @property
    def frontend_path(self) -> Path | None:
        if not self.serve_frontend:
            return None
        path = Path(self.frontend_dir) if self.frontend_dir else Path(__file__).resolve().parents[2] / "frontend"
        return path if (path / "index.html").is_file() else None

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def domain_list(self) -> list[str]:
        return [d.strip().lower().lstrip("@") for d in self.allowed_email_domains.split(",") if d.strip()]

    def prepare(self) -> "Settings":
        """Fail fast on unsafe production settings; fill a throwaway secret in development."""
        problems: list[str] = []
        if self.is_production:
            if len(self.secret_key) < 32:
                problems.append("SECRET_KEY must be at least 32 characters")
            if self.debug_return_otp:
                problems.append("DEBUG_RETURN_OTP must be false")
            if self.email_provider == "console":
                problems.append("EMAIL_PROVIDER must be brevo, resend or smtp (not console)")
            if "*" in self.cors_list:
                problems.append("CORS_ORIGINS must list your website address(es), not '*' (or be empty when this server serves the website)")
        if self.email_provider not in {"console", "brevo", "resend", "smtp"}:
            problems.append("EMAIL_PROVIDER must be one of console, brevo, resend, smtp")
        if self.email_provider != "console" and not self.email_from:
            problems.append("EMAIL_FROM is required when EMAIL_PROVIDER is not console")
        if self.email_provider == "brevo" and not self.brevo_api_key:
            problems.append("BREVO_API_KEY is required for the brevo provider")
        if self.email_provider == "resend" and not self.resend_api_key:
            problems.append("RESEND_API_KEY is required for the resend provider")
        if self.email_provider == "smtp" and not (self.smtp_host and self.smtp_user and self.smtp_password):
            problems.append("SMTP_HOST, SMTP_USER and SMTP_PASSWORD are required for the smtp provider")
        if problems:
            raise RuntimeError("Invalid configuration:\n  - " + "\n  - ".join(problems))
        if not self.secret_key:
            self.secret_key = secrets.token_urlsafe(48)
            log.warning("SECRET_KEY is not set. Using a temporary key; sessions end when the server restarts.")
        return self
