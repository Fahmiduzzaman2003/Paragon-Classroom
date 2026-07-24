# Paragon — Deployment Audit (Phase 0)

**Target:** Vercel (frontend, Hobby) + Render (backend, Free), **$0 cost**.
**Scope of this document:** read-only audit. **No code has been changed.** This is
the map we harden against in Phases 1–8.

> TL;DR — the app is well-structured and *mostly* deployable, but it will **not
> survive a Render Free deploy as-is**. Three things break hard: (1) the vector
> store and embeddings are local/on-disk and die on every spin-down, and the
> local ONNX embedder risks OOM on 512 MB; (2) ingestion runs in an in-process
> background task with no jobs table, so a redeploy mid-ingest leaves documents
> stuck "processing" forever; (3) there is **no root `.gitignore`, and
> `backend/.env` (with real secrets) is untracked-but-not-ignored** — one
> `git add -A` leaks JWT + API keys. Everything else is polish.

---

## 1. Detected stack

### Backend — `backend/`
| Item | Value |
|---|---|
| Language / runtime | Python, `requires-python = ">=3.11"` (`pyproject.toml`) |
| Framework | FastAPI + Starlette, async SQLAlchemy 2.0 |
| ASGI server | `uvicorn[standard]` |
| Package manager | pip (`requirements.txt`) + `pyproject.toml` (both present) |
| Entry point | `backend/app/main.py` → `app` (FastAPI), lifespan calls `init_db()` |
| DB (dev) | SQLite via `aiosqlite` (`sqlite+aiosqlite:///./paragon.db`) |
| DB (prod-ready) | `asyncpg` driver already in deps (Postgres) |
| Vector store | **ChromaDB `PersistentClient` on local disk** (`vector_store.py`) |
| Embeddings | **ChromaDB bundled ONNX all-MiniLM-L6-v2, local** (`embeddings.py`) |
| LLM | Pluggable: openai / openrouter / anthropic / gemini / mock (`services/llm/`) |
| Auth | Email+password (JWT) **and** Google OIDC code-flow (`services/google.py`) |
| Config | Pydantic `BaseSettings` (`app/config.py`) — good foundation |
| Migrations | `create_all()` + ad-hoc SQLite `ALTER TABLE` (`database.py`). `backend/alembic/` exists but is **empty**, no `alembic.ini`. |
| Start command (needed) | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

### Frontend — `frontend/`
| Item | Value |
|---|---|
| Framework | React 19 + Vite 8 (SPA), TypeScript ~6.0 |
| Package manager | npm (`package-lock.json` present) |
| Build | `tsc -b && vite build` → `dist/` |
| Dev | `vite` (port 5173) |
| State/data | Zustand (+ `persist`), TanStack Query, axios |
| Routing | react-router-dom 7 (client-side SPA routing) |
| Public env prefix | `VITE_` (correct for Vite) |
| Node version | **Not pinned** — no `.node-version` / `engines` field |

### Deploy artifacts present today
- `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `docker-compose.yml` (untracked).
- **Missing:** `render.yaml`, `vercel.json`, `runtime.txt`/`.python-version`, `.node-version`, CI workflow, smoke test.

---

## 2. Feature-by-feature: will it break in deployment?

| Feature | Status on Render Free | Why |
|---|---|---|
| **Email/password auth (JWT)** | ✅ Works | Stateless Bearer tokens. `JWT_SECRET` fails-fast in prod (`config.py:113`). Needs a **stable** secret set in Render (ephemeral dev secret would log everyone out each cold start). |
| **Google OAuth** | ⚠️ Works but cross-domain gaps | Real OIDC code-flow verifies signature/`aud`/`iss`/`exp` against JWKS (`google.py:170`) — solid. **But** redirect URIs default to `localhost` (`config.py:77`), users are keyed on **email not `sub`** (`google.py:231`; `User` has no `google_sub` column), and CORS origins come from `APP_FRONTEND_ORIGIN` defaulting to localhost only. |
| **Token refresh** | ✅ Works | Single-flight guard exists (`api.ts:24`). Refresh token kept in `localStorage` via Zustand `persist` (Bearer model, not HttpOnly cookie) — acceptable cross-site, worth documenting. |
| **File upload** | ⚠️ Partial | `Storage` interface exists with `local` + `cloudinary` backends (good!). **But** prod default is `cloudinary` requiring config; Cloudinary path **buffers the whole file in RAM** (up to 40 MB, `storage/backend.py:143`) → memory spike on 512 MB; no signed **direct-to-storage** upload; `delete_material` bypasses the interface and calls `Path().unlink()` directly (`materials.py:261`) — wrong for Cloudinary. |
| **Ingestion (parse→chunk→embed)** | ❌ Breaks | Runs in `BackgroundTasks` in-process (`materials.py:199`). **No jobs table**, status lives only on `Material`. A spin-down/redeploy mid-ingest → material stuck at `processing` forever, no retry, no recovery, no polling contract. |
| **RAG retrieval** | ❌ Breaks on redeploy | Chroma `PersistentClient` writes to `CHROMA_PATH` on **ephemeral disk** (`vector_store.py:20`). Every spin-down/redeploy **wipes all vectors** → "vector store empty" and empty answers. |
| **Embeddings** | ❌ OOM risk | Local ONNX MiniLM via `DefaultEmbeddingFunction` (`embeddings.py:30`) loads `onnxruntime` + model into a 512 MB box; `chromadb` itself is a heavy dependency. Constraint explicitly forbids local ML. Must move to a hosted embeddings API. |
| **LLM chat / streaming** | ⚠️ Works, not resilient | Individual providers implemented, but `factory.py` picks **one** provider then falls to `mock`. **No ordered fallback chain, no error classification, no circuit breaker, no JSON-repair, no cost/quota caps, no `/admin/llm/health`** (all of Phase 5). |
| **Quiz / exam engine** | ✅ Mostly solid | Timer computed server-side (`quizzes.py:451+`), answer keys hidden via `hide_keys` (`quizzes.py:89`), duplicate submit blocked with 409 (`quizzes.py:573`), in-progress attempts resume. Missing: client **idempotency key** for cold-start retry safety; explicit grace-period policy. |
| **Grading (objective)** | ✅ Works | Deterministic, server-side, pure-stdlib NLP (`grading.py`, `nlp_grading.py` — no torch/sklearn). Needs unit tests. |
| **Grading (subjective/LLM)** | ⚠️ Partial | Uses stdlib NLP suggestion, not a rubric-driven LLM+JSON-schema path with a `needs_manual_review` queue backed by the fallback chain. |
| **Analytics** | ⚠️ Verify | `services/analytics.py` exists; needs audit for N+1 queries, pagination, indexes, and cold-DB latency. Not yet reviewed line-by-line. |
| **Email verification / password reset** | ✅ Works free | Prints link to console when SMTP blank (`services/email.py`), Mailtrap-compatible. Fine for free tier. |
| **Health checks** | ⚠️ Thin | Only `GET /health` (`routers/health.py`) — no dependency check. Render wants a cheap liveness path; readiness (DB/vector/storage) missing. |

---

## 3. Deployment-hostile assumptions in the code

### 3a. Assumes `localhost`
- `frontend/src/lib/api.ts:6` — default API base `http://localhost:8000`.
- `config.py:33-46` — `APP_FRONTEND_ORIGIN` default is a localhost list (also the CORS allowlist source in `main.py:64`).
- `config.py:77-84` — `GOOGLE_OAUTH_REDIRECT_URI` defaults to localhost callbacks.
- `auth.py:130` — `_frontend_base()` uses first CORS origin for email links → localhost in prod unless overridden.
- *(These are defaults, not hardcodes — overridable by env. The risk is forgetting to override them, so they must be documented and validated.)*

### 3b. Local-filesystem writes (all lost on Render restart)
- `config.py:196-197` — `get_settings()` **creates `uploads_dir` and `chroma_path` on disk at import**.
- `vector_store.py:20` — Chroma persists to `CHROMA_PATH` on disk.
- `storage/backend.py:61` (LocalStorage) — writes uploads to disk; prod default is cloudinary but local is the fallback.
- `paragon.db` (SQLite) — dev DB on disk; must be Postgres in prod.
- `.jwtsecret.tmp`, `uvicorn.*.log` — stray on-disk artifacts.

### 3c. In-memory state that must survive restarts
- `auth.py:290` — `_google_state_store` (OAuth `state` nonces) is a process-local dict → a cold start between redirect and callback = "Invalid or expired state".
- `services/limiter.py` — slowapi rate-limit counters in memory (acceptable, documented).
- LLM circuit-breaker state (to be built) will also be in-process — needs a documented Redis seam.
- `@lru_cache` singletons for embeddings/vector-store/storage/llm — fine, but they cache the *first* config seen.

### 3d. Synchronous long-running work (> 30 s) on the request path / in-process
- `materials.py:199` — ingestion via `BackgroundTasks` runs **inside the web process**; parse+embed of a large PDF can run minutes and competes for the 512 MB / shared CPU, and is **not durable**.
- No hard per-job timeout, no concurrency cap, no bounded worker pool.

### 3e. Unbounded memory
- `storage/backend.py:143-152` — Cloudinary upload reads the entire file into a `list[bytes]` then joins → full-file in RAM.
- `file_parsers.extract_pages` / `chunk_pages` — need to confirm they stream page-by-page rather than loading whole doc + all embeddings (flagged for Phase 3/4 review).
- Local ONNX embedder resident memory (§2).

### 3f. Missing timeouts / deadlines
- LLM providers: per-call timeout / global chain deadline not enforced at the factory level (Phase 5).
- Frontend axios timeout is a fixed `30_000` ms (`api.ts:10`) — **shorter than Render's 30–60 s cold start**, so the very first request after idle can spuriously fail. No "waking up the server" UX.
- `httpx` calls to Google have 10 s timeouts (good) — but no retry.

---

## 4. Config / secrets read ad-hoc or hardcoded

**Good news:** almost all config already flows through the typed `Settings`
object — this is a strong starting point. Gaps:

| Location | Issue |
|---|---|
| `config.py:111-112` | `os.environ.get("APP_ENV")` read directly inside a validator (works, but a raw env read). |
| `google.py:236`, `google.py` upsert | `__import__("secrets")` inline; user keyed on email, no `sub` column. |
| `frontend/src/lib/api.ts:6` | `import.meta.env.VITE_API_URL` read directly (only place; fine, but should be centralized into a validated `env.ts` per Phase 1). |
| `main.py:64` | CORS list derived from `APP_FRONTEND_ORIGIN`; there is **no dedicated `CORS_ORIGINS`** var as Phase 2 specifies. |
| Config completeness | No fail-fast for required prod values beyond `JWT_SECRET` (e.g. missing storage/LLM/embedding keys silently degrade to local/mock). |
| **Hardcoded values found** | Only legitimate constants: Google discovery/issuer URLs (`google.py:40-41`), OpenRouter base URL default, model-dimension heuristics. **No hardcoded API keys or bucket names in tracked source.** |

### 🔴 Secret-hygiene blocker (most urgent finding)
- **No root `.gitignore` is tracked** (confirmed via `git ls-files`).
- `git check-ignore backend/.env` → **not ignored**. `backend/.env`, `backend/.jwtsecret.tmp`, `frontend/.env`, `.env.local`, `paragon.db`, `chroma_data/`, `uploads/`, and log files are all **untracked-but-committable**. A single `git add -A` publishes live secrets.
- Untracked dev cruft that should never ship: `_check.ps1`, `_check2.ps1`, `_probe.py`, `_run_uvicorn.py`, `_install_deps.py`, `probe.ps1`, `run*.ps1`, `uvicorn.*.log`.

---

## 5. Other gaps vs. the phase requirements (inventory, not yet fixed)

- **Migrations:** `create_all()` in the boot path (`database.py:43`) + hand-rolled SQLite `ALTER TABLE`. Alembic dir empty. No pool tuning (`pool_pre_ping`, small `pool_size`, `pool_recycle`) for low-connection free Postgres.
- **Resilience:** no `/healthz` + `/readyz` split; no SIGTERM graceful shutdown; no request-ID middleware; error envelope is `{error:{code,message}}` but **no `request_id`** (`main.py:82`); no security headers (HSTS/nosniff/frame-deny/referrer-policy); no request body-size cap; rate limiting only on some auth routes.
- **Observability:** no structured per-LLM-call logs, no Sentry hook (even behind a flag).
- **Frontend:** `ErrorBoundary.tsx` exists ✅; but no cold-start "waking up" state, no offline/failed-fetch handling standardized, skeletons not verified on every async surface, and no bundle check that secrets aren't shipped.
- **CI / tests / smoke:** none. `backend/tests/` untracked; no GitHub Actions; no `scripts/smoke_test.*`.
- **Deps:** `chromadb` (heavy, pulls onnxruntime) will be dropped when embeddings/vector move to hosted APIs. `torch`/`transformers`/`sentence-transformers` are **not** present (good). `openai`, `anthropic`, `google-generativeai` all installed.

---

## 6. Ranked action list

### 🔴 Blockers — deploy will fail / leak without these
1. **Add root `.gitignore`; stop tracking secrets & cruft.** Verify `.env*` ignored except `.env.example`. *(Phase 1)*
2. **External, persistent vector store** (pgvector on free Supabase/Neon) behind a `VectorStore` interface — replace on-disk Chroma. *(Phase 4)*
3. **Hosted embeddings API** (free tier), drop local ONNX + `chromadb` embedder to avoid OOM. *(Phase 4)*
4. **Durable ingestion:** jobs table + polling endpoint + bounded worker pool + per-job timeout + boot-time requeue of stuck jobs. *(Phase 3)*
5. **Stable `JWT_SECRET` + Postgres `DATABASE_URL`** set in Render; move off SQLite/ephemeral disk; pool tuning + Alembic. *(Phase 1/7)*
6. **Config for prod origins:** `CORS_ORIGINS`, Google redirect URIs, `VITE_API_URL`, frontend base for emails — all env-driven and documented; fail-fast on missing required prod values. *(Phase 1/2)*
7. **`render.yaml` + `vercel.json` + pinned runtimes** so deploys are reproducible and bind `0.0.0.0:$PORT`. *(Phase 1)*

### 🟠 Important — graded quality, correctness, and first-run UX
8. **LLM fallback layer** (ordered chain, error classification, circuit breaker, JSON-repair, deadlines, cost caps, `/admin/llm/health`). *(Phase 5)*
9. **Cold-start UX:** longer first-request timeout + retry + "waking up the server" state + optional `/healthz` prewarm. *(Phase 7)*
10. **Google user keyed on `sub`** (add `google_sub` column, idempotent upsert, same-email-different-provider handling). *(Phase 2)*
11. **Upload hardening:** magic-byte MIME check, size enforced client+server, per-user quota, prefer signed direct-to-storage; route delete through `Storage.delete`. *(Phase 3)*
12. **`/healthz` + `/readyz`, request-ID + `request_id` in error envelope, security headers, body-size cap, SIGTERM handling.** *(Phase 7)*
13. **Subjective grading:** rubric prompt → strict JSON schema → validation → `needs_manual_review` queue; store `model_used` + rubric version. *(Phase 6)*
14. **Analytics review:** kill N+1, add indexes, paginate, brief cache, verify cold-DB latency. *(Phase 6)*

### 🟢 Nice-to-have — polish and safety nets
15. Submission **idempotency key** + grace-period policy. *(Phase 6)*
16. **Authorization tests** (student cannot read another student's attempts/docs/analytics). *(Phase 6)*
17. **GitHub Actions CI** (install/lint/typecheck/test/build) + **`scripts/smoke_test`**. *(Phase 7)*
18. **Sentry** behind an env flag (default off). *(Phase 7)*
19. Embedding **content-hash cache** for idempotent re-ingestion. *(Phase 4)*
20. Drop `chromadb` from `requirements.txt` once §3/§4 land. *(Phase 1)*

---

## 7. What already works and should NOT be disturbed
- Typed Pydantic config with fail-fast `JWT_SECRET` in prod.
- `Storage` provider interface (local + Cloudinary) — the pattern is right; extend it.
- Real Google OIDC verification against JWKS (`aud`/`iss`/`exp`).
- Single-flight token refresh on the client.
- Server-authoritative exam timers, hidden answer keys, duplicate-submit protection.
- Deterministic stdlib grading (no heavy ML).
- Consistent JSON error envelope shape.
- `mock` LLM + local fallbacks that let the whole app run with **zero** API keys locally — keep this dev path alive through every change.

---

**Phase 0 complete. No files were modified. Awaiting your confirmation before starting Phase 1.**
