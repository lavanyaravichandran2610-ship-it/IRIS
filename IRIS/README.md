# IRIS — Intelligent Research & Innovation System

IRIS is a locally runnable full-stack research workspace using the supplied interface, a Flask REST API, and SQLite persistence. Its active modules are connected to backend endpoints rather than relying only on browser-only demo handlers.

## Run locally (Windows)

1. Install Python 3.10 or newer.
2. Extract the project ZIP and open a terminal in the `iris_project` folder.
3. Create and activate a virtual environment (recommended):
   ```powershell
   py -m venv .venv
   .venv\Scripts\activate
   ```
4. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
5. Start the app:
   ```powershell
   python app.py
   ```
6. Open **http://127.0.0.1:5000**. The bottom-right status should say `IRIS API · online`.

You can also run `run_windows.bat` to install the packages and start the server.

## Connected modules

- **Accounts:** server-side registration/login/logout, password hashes, HTTP-only session cookie. This build uses email + password; it does not pretend to send email OTPs.
- **Workspace persistence:** per-account project state is saved to SQLite, including manuscript text, selected papers, Copilot messages, and activity.
- **Discover:** server-side scholarly search using curated seed references and best-effort live Crossref lookup when internet access is available. Search results link to DOI/publisher/source records.
- **Research Copilot:** calls a local Ollama model if configured. Otherwise it labels its answer as retrieval-only fallback; it does not claim to be a full LLM.
- **Experiment Engine:** trains/evaluates real scikit-learn classifiers on the server. Upload your own CSV (up to 25 MB), select its target column, and run Random Forest, Extra Trees, Gradient Boosting, or Logistic Regression. Numeric features are used and missing values are median-imputed. The app includes `sample_data/demo_classification.csv` for testing the upload flow. If no CSV is selected, it uses a labelled synthetic benchmark.
- **Experiment history:** run configurations and metrics are stored in SQLite. The active UI displays results immediately.
- **Integrity & rectification:** server-side checks for citation markers, References/Bibliography heading, manuscript length and readability; conservative whitespace cleanup and corrective suggestions; a separate revalidation action.
- **Publication guidance:** venue suggestions are fetched from the backend and link to official venue pages.

## Optional local LLM for Copilot

Install [Ollama](https://ollama.com), pull a model such as `qwen2.5:3b`, and start Ollama before IRIS. In PowerShell:
```powershell
$env:OLLAMA_URL="http://localhost:11434/api/generate"
$env:OLLAMA_MODEL="qwen2.5:3b"
python app.py
```
Without Ollama, the Copilot still responds in clearly labelled retrieval-only mode.

## API quick tests

```powershell
curl http://127.0.0.1:5000/api/health
curl "http://127.0.0.1:5000/api/papers?q=transformer"
```

Authenticated endpoints include `/api/projects`, `/api/datasets/upload`, `/api/datasets`, `/api/experiments/run`, `/api/experiments/history`, `/api/integrity/check`, and `/api/integrity/rectify`.

## Important boundaries

- The included demo CSV is generated synthetic data, not a real network-traffic dataset. Do not present its metrics as real-world research evidence.
- Uploaded CSV training currently uses numeric feature columns; categorical feature columns are not automatically encoded. The selected target may be categorical.
- Integrity checks are heuristics, not a licensed full-text plagiarism comparison or novelty-verification service. Similarity and novelty are not certified.
- Crossref live search requires server internet access. Ollama responses require a local Ollama service and downloaded model.
- This is a local development build, not production-hardened hosting. Before public deployment, add CSRF protection, rate limits, stronger secret-key configuration, account recovery, upload quotas, HTTPS, and a deployment server.

## Publish to GitHub and deploy online (Render)

### 1. Push this folder to GitHub

Create a new **public or private repository** on GitHub, for example `IRIS-Research-Platform`. Upload the contents of this folder to the repository root (so `app.py`, `requirements.txt`, and `render.yaml` are visible at the top level). Do not upload `.venv`, `.env`, `iris.db`, or personal datasets.

Using Git in PowerShell from this folder:

```powershell
git init
git add .
git commit -m "Prepare IRIS for deployment"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/IRIS-Research-Platform.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username. If Git asks you to authenticate, use GitHub's sign-in flow or a supported credential manager; your GitHub account password is not accepted for Git pushes.

### 2. Deploy the Flask app

GitHub stores the code; it does not run this Flask backend through GitHub Pages. To host the working app, sign in to Render, choose **New → Blueprint**, connect this GitHub repository, and apply the `render.yaml` configuration. Alternatively create a Web Service using build command `pip install -r requirements.txt` and start command `gunicorn app:app`.

After deployment, open the HTTPS URL Render provides. Check `/api/health` on that domain to confirm the backend responds.

### Hosting and data note

This configuration is suitable for a demonstration deployment. On a free ephemeral host, SQLite records and uploaded files can be lost when the service restarts or redeploys. For durable multi-user hosting, use managed PostgreSQL and persistent object storage, configure secrets in the host dashboard, and add production protections such as CSRF defense, rate limits, upload quotas, and account recovery. The optional Copilot's local Ollama mode will not reach your own computer's Ollama instance from a cloud host; configure a reachable hosted model endpoint or use its labelled fallback.
