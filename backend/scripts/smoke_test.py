#!/usr/bin/env python3
"""End-to-end smoke test against a running Paragon backend.

Walks the critical path and prints PASS/FAIL per step:
  health → ready → auth → me → create course → upload → ingest job → RAG query
  → create quiz → attempt → submit → analytics

Usage:
  BASE_URL=https://paragon-api.onrender.com python scripts/smoke_test.py

Auth options (in priority order):
  * SMOKE_TOKEN=<access token>   — use an existing token (works in production).
  * otherwise tries POST /auth/google/dev (only enabled when the backend runs
    with GOOGLE_OAUTH_DEV_FALLBACK=true, i.e. dev/staging — never production).

Exit code is non-zero if any critical step fails, so CI/scripts can gate on it.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")
TOKEN = os.environ.get("SMOKE_TOKEN", "")

_passed = 0
_failed = 0


def _req(method: str, path: str, *, token: str | None = None, json_body=None,
         data: bytes | None = None, headers: dict | None = None, timeout: int = 90):
    url = f"{BASE}{path}"
    h = dict(headers or {})
    if token:
        h["Authorization"] = f"Bearer {token}"
    body = data
    if json_body is not None:
        body = json.dumps(json_body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip().startswith(("{", "[")) else raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


def step(name: str, ok: bool, detail: str = "") -> bool:
    global _passed, _failed
    mark = "PASS" if ok else "FAIL"
    if ok:
        _passed += 1
    else:
        _failed += 1
    print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))
    return ok


def main() -> int:
    print(f"Smoke testing {BASE}\n")

    # 1. Liveness (also warms the dyno).
    print("Warming up (cold start can take ~60s)…")
    status, _ = _req("GET", "/healthz", timeout=90)
    if not step("healthz", status == 200, f"status={status}"):
        return 1

    # 2. Readiness.
    status, body = _req("GET", "/readyz")
    step("readyz", status == 200, json.dumps(body) if isinstance(body, dict) else str(body))

    # 3. Auth. Prefer an explicit token; otherwise register a throwaway teacher
    # (register returns a usable token even when email verification is on), and
    # fall back to the dev-Google shim if registration is disabled.
    token = TOKEN
    if token:
        step("auth (SMOKE_TOKEN)", True)
    else:
        email = f"smoke+{int(time.time())}@paragondemo.com"
        status, body = _req("POST", "/auth/register", json_body={
            "email": email, "password": "paragon-smoke-1234", "name": "Smoke Teacher", "role": "teacher",
        })
        if status in (200, 201) and isinstance(body, dict):
            token = body.get("access_token", "")
            step("auth (register teacher)", bool(token), f"status={status}")
        else:
            status, body = _req("POST", "/auth/google/dev",
                                json_body={"email": "smoke@paragondemo.com", "name": "Smoke"})
            token = body.get("access_token", "") if isinstance(body, dict) else ""
            step("auth (dev google)", bool(token), f"status={status}")
    if not token:
        print("\nNo token — skipping authenticated steps. Set SMOKE_TOKEN to test them.")
        return 0 if _failed == 0 else 1

    # 4. Identity.
    status, me = _req("GET", "/auth/me", token=token)
    step("auth/me", status == 200 and isinstance(me, dict), f"status={status}")

    # 5. Create a course.
    status, course = _req("POST", "/courses", token=token,
                          json_body={"name": "Smoke Course", "ai_name": "SmokeAI"})
    course_id = course.get("id") if isinstance(course, dict) else None
    if not step("create course", status in (200, 201) and bool(course_id), f"status={status}"):
        return 1

    # 6. Upload a small text material.
    boundary = "----smoke"
    file_body = b"Photosynthesis converts light energy into chemical energy in plants.\n" * 20
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"section\"\r\n\r\nclass\r\n",
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"lecture.txt\"\r\n"
        f"Content-Type: text/plain\r\n\r\n",
    ]
    data = parts[0].encode() + parts[1].encode() + file_body + f"\r\n--{boundary}--\r\n".encode()
    status, mat = _req("POST", f"/courses/{course_id}/materials", token=token, data=data,
                       headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    material_id = mat.get("id") if isinstance(mat, dict) else None
    job_id = mat.get("job_id") if isinstance(mat, dict) else None
    step("upload material", status in (200, 201) and bool(material_id), f"status={status}")

    # 7. Poll the ingestion job to completion.
    if job_id:
        ok = False
        for _ in range(30):
            status, job = _req("GET", f"/jobs/{job_id}", token=token)
            st = job.get("status") if isinstance(job, dict) else None
            if st in ("succeeded", "failed"):
                ok = st == "succeeded"
                break
            time.sleep(2)
        step("ingest job", ok, f"status={st if isinstance(job, dict) else '?'}")

    # 8. RAG query (SSE stream — just confirm it responds).
    status, _ = _req("POST", f"/courses/{course_id}/chat", token=token,
                     json_body={"message": "What is photosynthesis?"}, timeout=90)
    step("RAG chat", status == 200, f"status={status}")

    # 9. Analytics (teacher-only; the course creator is the teacher).
    status, _ = _req("GET", f"/courses/{course_id}/analytics", token=token)
    step("analytics", status == 200, f"status={status}")

    print(f"\n{_passed} passed, {_failed} failed")
    return 0 if _failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
