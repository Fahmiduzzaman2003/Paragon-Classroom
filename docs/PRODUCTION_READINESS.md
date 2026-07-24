# Production Readiness

The deliberate free-tier compromises, each with its risk, the exact upgrade path
(what env var / plan / service to change), and rough effort. Ordered by priority.
Nearly every item is **swap-in-place** — a config change, not a rewrite — because
each free choice sits behind an interface.

| # | Compromise | Risk | Upgrade path | Effort |
|---|---|---|---|---|
| 1 | **Render Free cold start** (spins down after ~15 min idle; 30–60s wake) | First request after idle is slow; evaluator may think it's broken | Render **Starter** ($7/mo) never idles. Or an external uptime pinger (see below). The UI already shows an honest "waking up" banner. | Change plan tier |
| 2 | **In-process job queue** (ingestion runs in the web dyno) | Heavy concurrent ingestion competes with request handling for 512 MB / shared CPU | Set up Redis (Upstash free) + swap `InProcessJobBackend` for an RQ/Celery backend — the `JobBackend` interface in `services/jobs.py` is the only seam | ~half day |
| 3 | **In-process circuit breaker + LLM quota + embedding cache** | State resets on restart; not shared across instances (fine at 1 instance) | Move `llm/breaker.py`, `llm/quota.py`, and the embedding cache to Redis. Interfaces are isolated. | ~half day |
| 4 | **`create_all` bootstrap** instead of migration-gated boot | Adding a column to an existing prod DB won't auto-apply (fresh deploys are fine) | Alembic is already scaffolded (`backend/alembic/`, baseline migration committed). Switch the deploy to run `alembic upgrade head` and generate a revision per schema change. | Low (already wired) |
| 5 | **Neon Free auto-suspend** (pauses on idle, resumes on query) | First query after idle adds ~1s | Neon paid tier stays warm; the pool already uses `pool_pre_ping` so a dropped connection is transparently replaced | Change plan tier |
| 6 | **Cloudinary unsigned uploads** (no server-side delete scope) | Deleting a material leaves the blob orphaned in Cloudinary | Switch to a **signed** preset + API secret and implement `CloudinaryStorage.delete` via the destroy endpoint. `StorageProvider` interface unchanged. | ~2 hrs |
| 7 | **Uploads stream through the backend** (buffered up to 40 MB in RAM for Cloudinary) | A burst of large uploads pressures 512 MB | Move to **direct-to-storage signed uploads** (browser → Cloudinary/S3), backend only records the URL. Or Cloudflare R2 (S3-compatible) behind the same `Storage` interface. | ~half day |
| 8 | **Local ONNX embeddings in dev only** | N/A in prod (prod uses hosted Gemini) — just don't set `EMBEDDING_PROVIDER=local` in prod (the config fails fast if you do) | — | — |
| 9 | **No background cron** (free tier) | Can't do scheduled cleanup / analytics precompute | Render Cron (paid) or GitHub Actions scheduled workflow calling an admin endpoint | ~2 hrs |
| 10 | **SMTP optional** (verification links print to server log) | Real email verification needs an SMTP provider | Set `SMTP_*` (Mailtrap free for testing; a real provider like Resend/SES for production) | ~1 hr |
| 11 | **Analytics cached in-process (30s TTL)** | Cache isn't shared; each instance recomputes | Move the TTL cache to Redis when you scale past one instance | ~1 hr |
| 12 | **Photo thumbnails** serve the Cloudinary URL directly | Serving full-res where a thumbnail would do | Use Cloudinary URL transformations (`/w_400,c_fill/`) for derivatives — a URL-string change in `QuestionImage`/avatar rendering | ~1 hr |

## The cold-start pinger (item 1) — trade-offs

You *can* keep the free dyno warm with an external pinger (e.g. a GitHub Actions
cron or UptimeRobot hitting `/healthz` every 10 min). Trade-offs:

- ✅ No cold starts during the day.
- ⚠️ Consumes your monthly free instance-hours faster (Render Free has a monthly
  cap) — a 24/7 pinger can exhaust it before month-end. Ping only during expected
  demo hours, or accept the occasional cold start (the UI handles it gracefully).

## What's already production-grade (no change needed)

- Typed, fail-fast config (backend Pydantic + frontend Zod).
- Real Google OIDC verified against JWKS; users keyed on stable `sub`.
- Provider-agnostic LLM layer: fallback chain, error classification, circuit
  breaker, per-attempt timeout + chain deadline, JSON-mode with repair, quotas.
- Persistent pgvector store with per-course isolation, similarity floor, and
  token-budgeted context.
- Durable, resumable ingestion jobs with boot recovery.
- Idempotent, time-authoritative exam submission with LLM rubric grading +
  manual-review fallback and audit trail.
- Request IDs, consistent error envelope, security headers, rate limits, graceful
  shutdown, `/healthz` + `/readyz`, CI, and an end-to-end smoke test.
