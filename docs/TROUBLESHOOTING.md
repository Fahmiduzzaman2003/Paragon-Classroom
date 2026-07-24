# Troubleshooting

The failure modes you're most likely to hit, with the symptom → cause → fix.
Every error response includes a `request_id` — quote it when searching Render logs.

---

## CORS error in the browser console

**Symptom:** `Access to XMLHttpRequest ... has been blocked by CORS policy` and API
calls fail in the browser (but work in curl/Postman).

**Cause:** Your Vercel origin isn't in the backend allowlist.

**Fix:**
1. Render → `CORS_ORIGINS` must contain your exact Vercel origin, comma-separated,
   **no trailing slash**: `https://paragon.vercel.app`.
2. Redeploy the Render service (env changes need a redeploy).
3. On startup the logs print `CORS allowlist: [...]` — confirm your origin is there.
4. Preview deploys have changing URLs — add a **stable preview alias** (Vercel →
   Domains) and put that in `CORS_ORIGINS`, don't chase per-deploy URLs.

---

## Google login: `redirect_uri_mismatch`

**Symptom:** Google shows *"Error 400: redirect_uri_mismatch"* after you pick an account.

**Cause:** The redirect URI the app sends doesn't **exactly** match one registered
in Google Cloud Console.

**Fix:**
1. Google Console → Credentials → your OAuth client → **Authorized redirect URIs**
   must contain the **exact** string, including scheme and path:
   `https://paragon.vercel.app/auth/google/callback` (no trailing slash).
2. It must equal Render's `GOOGLE_OAUTH_REDIRECT_URI`.
3. Also add the origin to **Authorized JavaScript origins**: `https://paragon.vercel.app`.
4. Changes in Google Console can take a few minutes to propagate.
5. Still failing? Ensure you're a **Test user** on the consent screen (or the app
   is Published).

---

## First request hangs ~30–60s, then works

**Symptom:** After the app is idle, the first action is very slow; the "waking up
the server" banner shows.

**Cause:** Render Free spun the backend down after ~15 min idle; it's cold-starting.
**This is expected**, not a bug.

**Fix / mitigations:**
- Nothing to fix — the client already retries once with a 60s timeout.
- To avoid it during a demo: open the app a minute early (the app pings `/healthz`
  on load), or run an external pinger during demo hours (see PRODUCTION_READINESS,
  note the instance-hour trade-off).

---

## Ingestion stuck on "processing" / OOM during upload

**Symptom:** A material never reaches `ready`, or the Render log shows the process
restarting (`Out of memory`) during ingestion.

**Causes & fixes:**
- **OOM:** you set `EMBEDDING_PROVIDER=local` on Render — the ONNX model exceeds
  512 MB. Set `EMBEDDING_PROVIDER=gemini` + `GEMINI_API_KEY`. (The config now fails
  fast on boot if you do this, so you'll see a clear error instead.)
- **Stuck after a redeploy:** a job interrupted mid-run is **auto-requeued on boot**
  (or marked failed after max attempts). Check `GET /jobs/{id}` — `error` explains why.
- **Huge PDF:** pages are capped at `MAX_INGEST_PAGES` (default 50); the material
  still succeeds but only the first N pages are indexed (noted in `status_detail`).
- **Scanned PDF (no text):** fails permanently with "No extractable text" — it's an
  image; OCR isn't in scope.

---

## AI answers are empty or "I couldn't find this in the materials"

**Symptom:** Chat returns no citations / says it can't find anything.

**Causes & fixes:**
- **Vector store empty after redeploy:** you're on `VECTOR_BACKEND=chroma` in prod —
  Chroma is on-disk and wiped on every Render redeploy. Set `VECTOR_BACKEND=pgvector`
  (persists on Neon). Then re-upload / re-ingest materials once.
- **Nothing ingested yet:** upload a material and wait for `ready`.
- **Genuinely not in the docs:** working as intended — the similarity floor stops
  it from hallucinating. Lower `RAG_SIMILARITY_FLOOR` slightly if retrieval is too
  strict for your content.

---

## LLM quota exhausted / AI unavailable

**Symptom:** Chat shows *"The AI service is temporarily unavailable"* or
*"reached today's AI usage limit"*.

**Causes & fixes:**
- **Provider daily free quota hit:** the chain automatically falls to the next
  provider. Configure more than one (`GEMINI` + `GROQ` + `OPENROUTER`) in
  `LLM_FALLBACK_CHAIN` so one exhausted quota doesn't take you down.
- **Your app-level cap hit:** `LLM_DAILY_USER_CAP` / `LLM_DAILY_GLOBAL_CAP` — raise
  or set to `0` (unlimited).
- **Diagnose:** `GET /admin/llm/health` (as admin) shows each provider's circuit
  state and recent success rate.
- **All providers failing:** check the keys are valid; a `401` moves the chain to
  the next provider immediately (see the structured `llm_call` log lines).

---

## Backend won't boot / config error on Render

**Symptom:** Deploy fails at startup with
`Invalid configuration for APP_ENV=production: - ...`.

**Cause:** The fail-fast validator found missing/invalid production vars — it lists
**all** of them at once.

**Fix:** Set each listed variable (see [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md))
and redeploy. Common ones: `JWT_SECRET`, `DATABASE_URL` (must be Postgres, not
SQLite), `VECTOR_BACKEND=pgvector`, `EMBEDDING_PROVIDER=gemini`,
`GOOGLE_OAUTH_DEV_FALLBACK=false`.

---

## Database connection errors (Neon)

**Symptom:** `readyz` returns 503 with `database: error`, or logs show SSL/connection
failures.

**Causes & fixes:**
- **Wrong driver in the URL:** it must be `postgresql+asyncpg://...`. If you pasted
  Neon's raw `postgresql://...`, swap the scheme.
- **SSL:** the app enables SSL for non-local Postgres automatically; you don't need
  `?sslmode=require` in the URL (and the async driver ignores it — remove it).
- **Too many connections:** Neon Free has a low connection cap. The pool is already
  small (`DB_POOL_SIZE=5`) with `pool_pre_ping`; don't raise it on free tier.

---

## Uploads rejected

- **415 Unsupported / "not a valid PDF":** the file's magic bytes don't match its
  extension (or it's an executable/archive). Only PDF, DOCX, PPTX, TXT, MD are
  allowed, verified by content, not just extension.
- **413 too large / quota reached:** over `MAX_UPLOAD_MB` (40) or your
  `USER_STORAGE_QUOTA_MB` (200). Delete some materials or raise the limits.
