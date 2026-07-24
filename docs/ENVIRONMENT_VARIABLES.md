# Environment Variables

Every variable the app reads, where to set it, and how to get its value.
"Set at" tells you which dashboard it belongs in.

- **Render** = backend service → Environment tab (or `render.yaml`).
- **Vercel** = frontend project → Settings → Environment Variables.
- **Google** = value you paste INTO Google Cloud Console (not an app env var).

> 🔴 = you must set this by hand for production. 🟢 = auto-provided / has a safe
> default. 🟡 = optional.

## Backend (Render)

| Variable | Set at | Required? | Example value | How to obtain | Change for prod? |
|---|---|---|---|---|---|
| `APP_ENV` | Render | 🔴 | `production` | literal | Yes — `development` → `production` |
| `APP_DEBUG` | Render | 🟢 | `false` | literal | Set `false` |
| `APP_PORT` / `PORT` | Render | 🟢 | `10000` | Render injects `$PORT` | No (auto) |
| `JWT_SECRET` | Render | 🔴 | `k3s...64chars` | `python -c "import secrets;print(secrets.token_urlsafe(64))"` — or let `render.yaml` `generateValue` do it | Yes — still used for the legacy fallback path |
| `FIREBASE_PROJECT_ID` | Render | 🟡→🔴 | `paragon-classroom` | Firebase Console → Project settings → Project ID. Enables Firebase auth (recommended). Blank = legacy email/password auth | Set it to use Firebase |
| `CORS_ORIGINS` | Render | 🔴 | `https://paragon.vercel.app,https://paragon-git-main-you.vercel.app` | your Vercel domain(s) | Yes |
| `DATABASE_URL` | Render | 🔴 | `postgresql+asyncpg://user:pass@ep-x.neon.tech/db` | Neon dashboard → Connection string (swap scheme to `postgresql+asyncpg`) | Yes — SQLite → Neon |
| `DB_POOL_SIZE` | Render | 🟡 | `5` | literal | No |
| `STORAGE_BACKEND` | Render | 🔴 | `cloudinary` | literal | Yes — `local` → `cloudinary` |
| `CLOUDINARY_CLOUD_NAME` | Render + Vercel | 🔴 | `dxxxx` | Cloudinary dashboard | Yes |
| `CLOUDINARY_UPLOAD_PRESET` | Render + Vercel | 🔴 | `paragon_unsigned` | Cloudinary → Settings → Upload → add **unsigned** preset | Yes |
| `MAX_UPLOAD_MB` | Render | 🟡 | `40` | literal | No |
| `USER_STORAGE_QUOTA_MB` | Render | 🟡 | `200` | literal | No |
| `VECTOR_BACKEND` | Render | 🔴 | `pgvector` | literal | Yes — `chroma` → `pgvector` |
| `EMBEDDING_PROVIDER` | Render | 🔴 | `gemini` | literal | Yes — `local` → `gemini` |
| `EMBEDDING_MODEL` | Render | 🟡 | `text-embedding-004` | provider default | No |
| `LLM_FALLBACK_CHAIN` | Render | 🔴 | `gemini:gemini-2.0-flash,groq:llama-3.3-70b-versatile,openrouter:meta-llama/llama-3.3-70b-instruct:free` | literal | Recommended |
| `GEMINI_API_KEY` | Render | 🔴 | `AIza...` | https://aistudio.google.com/apikey | Yes |
| `GROQ_API_KEY` | Render | 🟡 | `gsk_...` | https://console.groq.com/keys | For fallback |
| `OPENROUTER_API_KEY` | Render | 🟡 | `sk-or-...` | https://openrouter.ai/keys | For fallback |
| `OPENAI_API_KEY` | Render | 🟡 | `sk-...` | https://platform.openai.com/api-keys | Only if used |
| `ANTHROPIC_API_KEY` | Render | 🟡 | `sk-ant-...` | https://console.anthropic.com | Only if used |
| `LLM_DAILY_USER_CAP` | Render | 🟡 | `100` | literal (0 = unlimited) | Optional guard |
| `LLM_DAILY_GLOBAL_CAP` | Render | 🟡 | `2000` | literal (0 = unlimited) | Optional guard |
| `GOOGLE_OAUTH_CLIENT_ID` | Render + Google | 🔴 | `123-abc.apps.googleusercontent.com` | Google Cloud Console → Credentials | Yes |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Render | 🔴 | `GOCSPX-...` | Google Cloud Console → Credentials | Yes |
| `GOOGLE_OAUTH_REDIRECT_URI` | Render | 🔴 | `https://paragon.vercel.app/auth/google/callback` | your Vercel domain + `/auth/google/callback` | Yes |
| `GOOGLE_OAUTH_DEV_FALLBACK` | Render | 🔴 | `false` | literal | **Must be `false`** in prod (enforced) |
| `REQUIRE_EMAIL_VERIFICATION` | Render | 🟡 | `false` | literal — `false` skips SMTP for demos | Optional |
| `SMTP_HOST` / `SMTP_USERNAME` / `SMTP_PASSWORD` | Render | 🟡 | `sandbox.smtp.mailtrap.io` / ... | https://mailtrap.io (free) | Only if verification on |
| `SENTRY_DSN` | Render | 🟡 | `https://xxx@sentry.io/123` | https://sentry.io (free) | Optional |
| `EXAM_GRACE_PERIOD_S` | Render | 🟡 | `120` | literal | No |

## Frontend (Vercel)

| Variable | Set at | Required? | Example value | How to obtain | Change for prod? |
|---|---|---|---|---|---|
| `VITE_API_URL` | Vercel | 🔴 | `https://paragon-api.onrender.com` | your Render service URL | Yes |
| `VITE_CLOUDINARY_CLOUD_NAME` | Vercel | 🟡 | `dxxxx` | Cloudinary dashboard | For profile-pic uploads |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Vercel | 🟡 | `paragon_unsigned` | Cloudinary unsigned preset | For profile-pic uploads |
| `VITE_FIREBASE_API_KEY` | Vercel | 🟡→🔴 | `AIzaSy...` | Firebase Console → Project settings → Web app SDK config | Set to use Firebase auth |
| `VITE_FIREBASE_AUTH_DOMAIN` | Vercel | 🟡→🔴 | `paragon-classroom.firebaseapp.com` | same SDK config | Set to use Firebase auth |
| `VITE_FIREBASE_PROJECT_ID` | Vercel | 🟡→🔴 | `paragon-classroom` | same SDK config | Set to use Firebase auth |
| `VITE_FIREBASE_APP_ID` | Vercel | 🟡→🔴 | `1:123:web:abc` | same SDK config | Set to use Firebase auth |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Vercel | 🟡 | `123456789` | same SDK config | Optional |
| `VITE_FIREBASE_STORAGE_BUCKET` | Vercel | 🟡 | `paragon-classroom.appspot.com` | same SDK config | Optional |

> **Firebase web config is public by design** — these values are safe in the client bundle. When the four core `VITE_FIREBASE_*` values + backend `FIREBASE_PROJECT_ID` are set, auth uses Firebase (email/password + Google, with verification and reset emails sent by Firebase — **no SMTP, no Google-OAuth console setup, no `redirect_uri`**). Leave them blank to use the legacy flow.

## Values you paste INTO Google Cloud Console (not app env vars)

| Where in Google Console | Value to paste |
|---|---|
| Authorized JavaScript origins | `https://paragon.vercel.app` (+ `http://localhost:5173` for dev) |
| Authorized redirect URIs | `https://paragon.vercel.app/auth/google/callback` (+ `http://localhost:5173/auth/google/callback`) |

> ⚠️ Vercel **preview** URLs change every deploy. Add your **production** domain and
> ONE stable preview alias (Vercel → Settings → Domains) to both Google Console
> and `CORS_ORIGINS`, and use those — don't chase per-deploy preview URLs.
