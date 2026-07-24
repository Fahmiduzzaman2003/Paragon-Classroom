# Deploying Paragon (free tier, first time)

A copy-pasteable guide assuming you've never deployed before. Total cost: **$0**.
Follow the sections **in order** — the order matters because each service needs
a URL from the previous one.

**Stack:** Frontend on **Vercel** · Backend on **Render** · Database + vectors on
**Neon** (Postgres + pgvector) · Files on **Cloudinary** · AI via **Gemini/Groq/
OpenRouter** · Login via **Google**.

---

## 0. Create the free accounts (do these first)

Sign up for each (no credit card required):

1. **GitHub** — push this repo there (Render & Vercel deploy from it).
2. **Neon** — https://neon.tech (Postgres database)
3. **Cloudinary** — https://cloudinary.com (file storage)
4. **Google AI Studio** — https://aistudio.google.com/apikey (Gemini key — LLM + embeddings)
5. **Groq** — https://console.groq.com (fallback LLM key) *(optional but recommended)*
6. **OpenRouter** — https://openrouter.ai (second fallback LLM key) *(optional)*
7. **Google Cloud Console** — https://console.cloud.google.com (OAuth login)
8. **Render** — https://render.com (backend host)
9. **Vercel** — https://vercel.com (frontend host)

---

## 1. Neon (database + vector store)

1. Create a project → it gives you a **connection string** like:
   `postgresql://user:pass@ep-cool-name-123.us-east-2.aws.neon.tech/neondb?sslmode=require`
2. Convert it to the async driver Paragon uses — replace `postgresql://` with
   `postgresql+asyncpg://` and drop the `?sslmode=require` (the app adds SSL itself):
   `postgresql+asyncpg://user:pass@ep-cool-name-123.us-east-2.aws.neon.tech/neondb`
3. Save this as your **`DATABASE_URL`**. pgvector is enabled automatically by the
   app on first use (it runs `CREATE EXTENSION vector`).

## 2. Cloudinary (file storage)

1. Dashboard → note your **Cloud name** (e.g. `dxxxx`) → this is `CLOUDINARY_CLOUD_NAME`.
2. Settings (gear) → **Upload** → **Upload presets** → **Add upload preset**.
3. Set **Signing Mode = Unsigned**. Name it e.g. `paragon_unsigned`. Save.
   → the name is `CLOUDINARY_UPLOAD_PRESET`.

## 3. AI keys

- **Gemini:** https://aistudio.google.com/apikey → Create API key → `GEMINI_API_KEY`.
- **Groq** (optional): https://console.groq.com/keys → `GROQ_API_KEY`.
- **OpenRouter** (optional): https://openrouter.ai/keys → `OPENROUTER_API_KEY`.

## 4. Authentication — Firebase (recommended) or Google OAuth (legacy)

**Recommended: Firebase Authentication.** It sends verification + password-reset
emails itself (no SMTP), does Google sign-in with no `redirect_uri` juggling, and
manages tokens. Free (Spark plan), no card, **no service-account key**.

1. https://console.firebase.google.com → **Add project** (name it e.g. `paragon-classroom`).
2. In the project, click the **Web** icon (`</>`) → register an app → copy the
   **SDK config** object (`apiKey`, `authDomain`, `projectId`, `appId`, …).
3. **Build → Authentication → Get started** → enable **Email/Password** and **Google**.
4. **Authentication → Settings → Authorized domains → Add domain:**
   `paragon-classroom.vercel.app` (`localhost` is already there).
5. You'll set the config values into Vercel (`VITE_FIREBASE_*`) in step 6, and
   `FIREBASE_PROJECT_ID` on Render in step 5 — that's all. No OAuth consent screen,
   no redirect URIs, no SMTP.

> To skip Firebase and use the built-in email/password auth instead, just leave all
> `FIREBASE_*` / `VITE_FIREBASE_*` vars blank and follow the legacy Google OAuth steps
> below. The app auto-detects which mode to use.

<details><summary>Legacy: Google OAuth (Cloud Console) — only if NOT using Firebase</summary>

1. https://console.cloud.google.com → create/select a project.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create.
   - Fill app name, your email. Save through the steps.
   - While testing, add your Google account under **Test users** (only test users
     can log in until you click **Publish app**).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins** — add (you'll add the real Vercel URL in step 7):
     - `http://localhost:5173`
   - **Authorized redirect URIs** — add:
     - `http://localhost:5173/auth/google/callback`
   - Create → copy the **Client ID** (`...apps.googleusercontent.com`) and
     **Client secret** (`GOCSPX-...`).

   > You'll come back in **step 7** to add your production Vercel URLs here.

</details>

---

## 5. Deploy the backend (Render) — do this BEFORE the frontend

1. Push this repo to GitHub.
2. Render → **New + → Blueprint** → connect the repo. Render reads `render.yaml`
   and proposes the `paragon-api` service. Click **Apply**.
   - (Manual alternative: New + → Web Service → root directory `backend`,
     Build `pip install -r requirements.txt`,
     Start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`,
     Health check path `/healthz`, Instance type **Free**, Region **Oregon**.)
3. In the service **Environment** tab, fill the `sync: false` vars from
   [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md):
   `DATABASE_URL`, `CORS_ORIGINS` (leave a placeholder for now, e.g.
   `https://localhost`), `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
   `GOOGLE_OAUTH_REDIRECT_URI` (placeholder for now),
   `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`, `GEMINI_API_KEY`,
   and optionally `GROQ_API_KEY` / `OPENROUTER_API_KEY`.
   (`APP_ENV=production`, `STORAGE_BACKEND=cloudinary`, `VECTOR_BACKEND=pgvector`,
   `EMBEDDING_PROVIDER=gemini`, `GOOGLE_OAUTH_DEV_FALLBACK=false`, and
   `JWT_SECRET` are already set by `render.yaml`.)
4. Deploy. When it's live, copy the URL, e.g. `https://paragon-api.onrender.com`.
5. Verify: open `https://paragon-api.onrender.com/healthz` → `{"status":"ok"}`.

## 6. Deploy the frontend (Vercel)

1. Vercel → **Add New → Project** → import the repo.
2. **Root Directory:** `frontend`. Framework preset: **Vite** (auto-detected).
   Build command `npm run build`, Output dir `dist` (from `vercel.json`).
3. **Environment Variables:**
   - `VITE_API_URL` = your Render URL from step 5 (`https://paragon-api.onrender.com`)
   - `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` (optional)
4. Deploy. Copy the production URL, e.g. `https://paragon.vercel.app`.
5. (Recommended) Vercel → Settings → Domains → note a **stable preview alias** like
   `https://paragon-git-main-you.vercel.app` so preview builds have a fixed URL.

## 7. Wire the two together (the part everyone forgets)

Now that you have the real Vercel URL, go back and add it in **three** places:

1. **Render → `CORS_ORIGINS`** = `https://paragon.vercel.app,https://paragon-git-main-you.vercel.app`
2. **Render → `GOOGLE_OAUTH_REDIRECT_URI`** = `https://paragon.vercel.app/auth/google/callback`
3. **Google Cloud Console → Credentials → your OAuth client:**
   - Authorized JavaScript origins: add `https://paragon.vercel.app`
   - Authorized redirect URIs: add `https://paragon.vercel.app/auth/google/callback`

Redeploy the Render service (Manual Deploy → Deploy latest commit) so the new
`CORS_ORIGINS` takes effect.

---

## 8. Post-deploy verification checklist

Open your Vercel URL and confirm each feature:

- [ ] **App loads** (no white screen). If it's slow the first time, that's Render
      cold start — the "waking up the server" banner should show.
- [ ] **Google login** works → you land in the dashboard. (redirect_uri_mismatch?
      see [TROUBLESHOOTING](TROUBLESHOOTING.md).)
- [ ] **Create a course** as a teacher.
- [ ] **Upload a PDF/notes** → its status goes `processing → ready` (poll works).
- [ ] **Ask the course AI** a question → you get an answer **with citations**.
- [ ] **Create a quiz**, take it as a student, **submit** → you get a score.
- [ ] **Analytics** dashboard loads for the teacher.
- [ ] `GET https://<render>/readyz` → `{"status":"ok"}` (DB reachable).
- [ ] `GET https://<render>/admin/llm/health` (as an admin) shows the provider chain.

Optional end-to-end check from your machine:
```bash
BASE_URL=https://paragon-api.onrender.com python backend/scripts/smoke_test.py
```

---

## Local development (unchanged)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements-dev.txt      # includes local ONNX embeddings + tests
cp .env.example .env                       # runs out-of-the-box (mock LLM, SQLite)
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
cp .env.example .env                       # defaults to http://localhost:8000
npm run dev
```

No API keys needed locally: the LLM falls back to a deterministic **mock**, storage
is local disk, vectors use on-disk Chroma, and login can use the dev-Google shim.
