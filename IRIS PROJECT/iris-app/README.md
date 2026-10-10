# IRIS: Intelligent Research & Innovation System

From research idea to publication-ready outcome.

This folder is the full-stack version: a website plus a backend that provides real accounts.

- Sign in with Google, or with a Gmail address confirmed by a one-time code sent to the inbox.
- Accounts and research history are stored in a database, so they follow the user to any device.

```
iris-app/
├── frontend/                 The website (plain HTML, CSS, JavaScript; no build step)
│   ├── index.html
│   ├── config.js             Tells the website where the backend is (empty = same address)
│   ├── css/styles.css
│   └── js/
│       ├── data.js           Sample paper library
│       ├── engine.js         Retrieval, ML models, integrity checks (no DOM code)
│       ├── api.js            Talks to the backend
│       ├── core.js           State, routing, history sync, landing page, dashboard
│       ├── discover-copilot.js
│       ├── experiments.js
│       ├── auth.js           Sign up, sign in, Google button, profile
│       └── integrity-publish.js
├── backend/                  The API (Python, FastAPI)
│   ├── app/
│   │   ├── main.py           App set-up, security headers, serves the website
│   │   ├── config.py         All settings, read from environment variables
│   │   ├── models.py         Database tables: users, one-time codes, sessions, workspaces
│   │   ├── routers/auth.py   Email codes, Google sign-in, sign out
│   │   ├── routers/me.py     Profile: read, edit, delete account
│   │   ├── routers/state.py  Saved research history (with conflict protection)
│   │   ├── emailer.py        Sends the code: console, SMTP, Brevo or Resend
│   │   ├── security.py       Code hashing, session tokens, rate limiter
│   │   └── ...
│   ├── tests/test_api.py     44 automated tests
│   ├── requirements.txt
│   └── .env.example          Every setting, with comments
├── render.yaml               One-click deploy blueprint for Render
└── README.md
```

The backend serves the website too, so the whole project runs as **one program at one address**.

---

## 1. Run it on your computer

You need Python 3.11 or newer (tested here on Python 3.13).

```bash
cd iris-app/backend
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # Windows: copy .env.example .env
uvicorn app.main:create_app --factory --reload --port 8000
```

Open http://localhost:8000.

With the default settings the one-time code is shown on the sign-in screen (labelled "Development mode"),
so you can try everything without any email set up. Interactive API docs are at http://localhost:8000/docs.

Set `SECRET_KEY` in `.env` if you want logins to survive a server restart. Generate one with:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Run the tests: `pip install pytest` then `python -m pytest` inside `backend/`.

---

## 2. Turn on Google sign-in

1. Open https://console.cloud.google.com and create a project (or pick one).
2. Set up the **OAuth consent screen** (menu names change; in the newer layout it is "Google Auth Platform"):
   app name `IRIS`, your support email, audience **External**.
   While the app is in **Testing**, only the test users you list can sign in. When you are ready for everyone,
   publish the app to production. IRIS only asks for the basic profile and email, which does not need Google's review.
3. Go to **Credentials, Create credentials, OAuth client ID**. Type: **Web application**.
4. Under **Authorized JavaScript origins** add:
   - `http://localhost` and `http://localhost:8000` for local use
   - your real address later, for example `https://iris.onrender.com`

   You do not need a redirect URI. Google only accepts `localhost` or an `https://` domain here, never a bare IP address.
5. Copy the **Client ID** into `backend/.env`:
   `GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com`
6. Restart the server. A "Continue with Google" button appears on the sign-in screen.

Google changes can take a few minutes to apply. Leave `GOOGLE_CLIENT_ID` empty to hide the button.
The server checks each Google login itself (signature, expiry, audience and a verified email), so a faked request is rejected.

---

## 3. Turn on real emailed codes

Pick one provider and set it in `backend/.env`. Until you do, the code is only printed in the server log and shown on screen
in development mode.

### Option A: Gmail SMTP (simplest, for your own computer, a lab demo or a VPS)

1. Use a Gmail account just for IRIS.
2. Turn on 2-Step Verification, then create an App Password at https://myaccount.google.com/apppasswords.
3. Set:

```
EMAIL_PROVIDER=smtp
EMAIL_FROM=your.iris.account@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.iris.account@gmail.com
SMTP_PASSWORD=the-16-character-app-password
DEBUG_RETURN_OTP=false
```

Gmail limits how many emails an account can send per day (around 500 for a normal account), which is plenty for a project demo.
**Free Render services block SMTP ports (25, 465 and 587)**, so this option does not work there. Use it locally, on a VPS,
or on a paid Render instance.

### Option B: Resend or Brevo (work on free hosting, because they use HTTPS)

You need a **domain you own**, verified with the provider by adding the DNS records it shows you.

- Resend: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=...`, `EMAIL_FROM=login@yourdomain.com`.
  Resend's built-in test address (`resend.dev`) only delivers to your own account email, so a verified domain is
  required to email other people.
- Brevo: `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY=...`, `EMAIL_FROM=login@yourdomain.com`.

Do not send "from" a `@gmail.com` address through these services. Gmail tends to reject or spam-folder it, because the
message is not authenticated for gmail.com. A domain costs a few hundred rupees a year, and students can sometimes get one
free (check the current offers on the GitHub Student Developer Pack).

---

## 4. Deploy online (Render + Neon, free)

Render runs the program. Neon holds the database (Render's own free databases are time-limited).

1. **Put the project on GitHub.** Create a repository and upload everything inside `iris-app`, so that `render.yaml`,
   `backend/` and `frontend/` are at the top level.
2. **Database.** Create a free project at https://neon.com, copy the connection string. It looks like
   `postgresql://user:password@host/dbname?sslmode=require`.
3. **Email.** Set up Option B above (Resend or Brevo) and keep the API key and sender address.
4. **Render.** At https://render.com choose **New, Blueprint**, connect the repository and apply `render.yaml`.
   Render asks you for the values marked as secret:
   `DATABASE_URL`, `EMAIL_FROM`, `RESEND_API_KEY` (or switch `EMAIL_PROVIDER` to `brevo` and add `BREVO_API_KEY`),
   and `GOOGLE_CLIENT_ID`. `SECRET_KEY` is generated for you.
5. When the first deploy finishes you get an address like `https://iris.onrender.com`.
   - Add it to **Authorized JavaScript origins** in Google Cloud (section 2).
   - Open it, sign up, and check that the code arrives in your inbox.

Free Render services go to sleep when idle, so the first visit after a quiet period is slow. The database tables are created
automatically on first start.

**Other hosts.** Any server that can run Python works: install the requirements, set the environment variables from
`.env.example`, and start it with

```bash
cd backend
uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
```

behind HTTPS (for example Caddy or Nginx). `--proxy-headers` makes the per-network rate limit see each visitor's real
address instead of the proxy's. Run a single worker, because the per-network limiter lives in memory.

**Website on a different host** (for example Netlify) and the API on Render: in `frontend/config.js` set
`window.IRIS_CONFIG = { apiBase: "https://iris.onrender.com" }`, and on the backend set
`CORS_ORIGINS=https://your-site.netlify.app`. Add the website's address to Google's authorized origins.

**No backend at all.** If `frontend/` is hosted alone, the site detects that there is no API and runs as a demo:
accounts live in the browser only and the code is shown on screen.

---

## 5. Settings reference

All settings are environment variables (or lines in `backend/.env`). `.env.example` explains each one.

| Setting | Default | Meaning |
| --- | --- | --- |
| `ENV` | `development` | Use `production` when deployed. Production refuses unsafe settings at start-up. |
| `SECRET_KEY` | random | Signs sessions and protects codes. 32+ characters, required in production. |
| `DATABASE_URL` | SQLite file | Use PostgreSQL in production. `postgres://` and `postgresql://` both work. |
| `GOOGLE_CLIENT_ID` | empty | Enables the Google button. |
| `EMAIL_PROVIDER` | `console` | `console`, `smtp`, `brevo` or `resend`. |
| `ALLOWED_EMAIL_DOMAINS` | `gmail.com,googlemail.com` | Who can sign up with an emailed code. |
| `OTP_TTL_SECONDS` | 300 | How long a code works. |
| `OTP_MAX_ATTEMPTS` | 5 | Wrong guesses allowed per code. |
| `OTP_RESEND_SECONDS` | 30 | Wait before another code can be requested. |
| `OTP_MAX_PER_HOUR` | 6 | Codes per email address per hour. |
| `OTP_IP_PER_HOUR` | 30 | Codes per network address per hour. Raise it if a whole class shares one WiFi. |
| `SESSION_DAYS` | 14 | How long a login lasts. |
| `DEBUG_RETURN_OTP` | `false` | Development only: show the code on screen. Refused in production. |
| `CORS_ORIGINS` | localhost | Only needed when the website is hosted separately. |
| `CSP_ENABLED` | `true` | Content-Security-Policy on the website pages. |

---

## 6. How it works

- **Email code.** The server creates a random 6-digit code, stores only a keyed hash of it, and emails it.
  The code works once, for 5 minutes, with 5 guesses. New requests replace old codes.
  `t.u+x@gmail.com`, `tu@gmail.com` and `tu@googlemail.com` are treated as one mailbox, so there is one account per mailbox.
- **Google.** The browser gets a signed ID token from Google. The server verifies it with Google's public keys, then signs the
  user in. If the same address already has an email account, the two are linked.
- **Sessions.** After sign-in the server issues a signed token and records the session in the database, so signing out
  (or "Sign out of all devices") ends it immediately on the server.
- **History.** The workspace (saved papers, Copilot chats, experiment runs, manuscript, checklist) is saved as one document
  per user with a revision number. If two devices save at the same time, the second save is refused and that device loads
  the newer copy, so one device never silently overwrites another.

Security measures in place: hashed and single-use codes, attempt and rate limits per address and per network, revocable
sessions, server-side Google token checks, strict Content-Security-Policy, and no secrets in the website code.
Known trade-off: the session token is kept in the browser's local storage so the site can also be hosted separately
from the API. The CSP limits what scripts can run, which is the main protection against token theft.
Signing in with an unknown address says "No account found", which tells a visitor whether an address has an account.
That is common for small apps; the rate limits slow down anyone probing for addresses.

---

## 7. What has been tested, and what has not

Tested here:
- 44 automated backend tests: code rules, limits, Gmail aliases, sessions, Google login (with Google's check replaced by a stub),
  profile, history conflicts, security headers, and the request format for Brevo, Resend and SMTP.
- 30 checks in a real browser against the running server: sign up with a code, wrong codes, reload keeps the login,
  a second device sees the same history, the "updated on another device" conflict, profile edits, sign out, sign out of all
  devices, expired session, account deletion, and the phone layout.

Not tested here, so check them on your first real run:
- Sending a real email (the providers were tested against stand-ins, not the live services).
- Real Google sign-in (it needs your Client ID and a public address; the test environment could not reach Google).
- PostgreSQL (the tests use SQLite; the same code runs on PostgreSQL through `DATABASE_URL`, and the test suite can be run
  against it with `TEST_DATABASE_URL`).
- The Render deploy itself (`render.yaml` was written to Render's blueprint format but not run).

---

## 8. Troubleshooting

| Problem | What to check |
| --- | --- |
| The Google button does not appear | `GOOGLE_CLIENT_ID` is set, and the page address is listed under Authorized JavaScript origins. Open the browser console for messages. |
| "Google sign-in could not verify" | The Client ID in the backend does not match the one the website used, or the app is still in Testing and your account is not a listed test user. |
| The code never arrives | Check spam. Look at the server log for `email failed`. On Render free, SMTP is blocked: use Resend or Brevo. |
| "Too many requests from this network" | Many people share one address. Raise `OTP_IP_PER_HOUR`. |
| Logged out after every server restart | Set a fixed `SECRET_KEY`. |
| Server refuses to start in production | The error lists exactly which setting is unsafe or missing. |
| Site shows demo mode and a code on screen | The website could not reach the API. Check `frontend/config.js` and `CORS_ORIGINS`. |

---

## 9. Next steps

The backend is organised so more features can be added as new files in `app/routers/`. The natural next ones are paper
search against arXiv and Crossref, embedding-based retrieval, an LLM for the Copilot, and server-side model training. The logic in
`frontend/js/engine.js` has no browser code in it, so it can be moved to Python directly.
