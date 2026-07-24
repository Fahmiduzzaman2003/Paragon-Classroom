"""Durable, bounded background-job execution for ingestion.

Free-tier reality: Render Free has **no separate worker dyno and no queue**, so
jobs run in a bounded in-process pool inside the web process. Everything the
rest of the app touches goes through :func:`enqueue` / :func:`recover_stuck_jobs`
and the :class:`JobBackend` protocol, so swapping to Redis/RQ, Celery, or BullMQ
later is a **single-file change** (write a new backend, point ``_backend`` at it).

Guarantees:
* Concurrency cap (``INGEST_CONCURRENCY``) so N big PDFs can't exhaust 512 MB.
* Hard per-job timeout (``INGEST_JOB_TIMEOUT_S``).
* Error classification: :class:`PermanentError` fails fast; everything else is
  retried with exponential backoff + jitter up to ``INGEST_MAX_ATTEMPTS``.
* Boot recovery: jobs left ``processing`` by a crash/redeploy are requeued.
* Graceful drain on shutdown.
"""

from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Awaitable, Callable, Protocol

from sqlalchemy import select

from ..config import settings
from ..database import SessionLocal
from ..models.job import IngestionJob, JobStatus
from ..models.material import Material, MaterialStatus

log = logging.getLogger(__name__)


class PermanentError(Exception):
    """A deterministic failure (corrupt file, no text). Do NOT retry."""


class RetryableError(Exception):
    """A transient failure (network, rate limit, timeout). Retry with backoff."""


# Runner signature: given a job id, do the work, updating stage/progress on the
# row as it goes. Returns nothing; raises PermanentError / RetryableError / other.
JobRunner = Callable[[str], Awaitable[None]]


class JobBackend(Protocol):
    def submit(self, job_id: str) -> None: ...
    async def drain(self, timeout: float = 20.0) -> None: ...


class InProcessJobBackend:
    def __init__(
        self,
        runner: JobRunner,
        *,
        concurrency: int,
        job_timeout_s: int,
        max_attempts: int,
    ) -> None:
        self._runner = runner
        self._sem = asyncio.Semaphore(max(1, concurrency))
        self._timeout = job_timeout_s
        self._max_attempts = max(1, max_attempts)
        self._tasks: set[asyncio.Task] = set()

    def submit(self, job_id: str) -> None:
        task = asyncio.create_task(self._run(job_id))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def drain(self, timeout: float = 20.0) -> None:
        if not self._tasks:
            return
        log.info("Draining %d in-flight ingestion job(s)…", len(self._tasks))
        done, pending = await asyncio.wait(self._tasks, timeout=timeout)
        for t in pending:
            t.cancel()

    # ── internals ─────────────────────────────────────────────
    async def _run(self, job_id: str) -> None:
        async with self._sem:
            for attempt in range(1, self._max_attempts + 1):
                await self._mark(job_id, status=JobStatus.PROCESSING.value, attempts=attempt, error="")
                try:
                    await asyncio.wait_for(self._runner(job_id), timeout=self._timeout)
                    await self._mark(job_id, status=JobStatus.SUCCEEDED.value, progress=100, stage="done")
                    return
                except PermanentError as e:
                    log.warning("Job %s permanent failure: %s", job_id, e)
                    await self._fail(job_id, f"{e}")
                    return
                except (RetryableError, asyncio.TimeoutError, Exception) as e:  # noqa: BLE001
                    is_last = attempt >= self._max_attempts
                    kind = "timeout" if isinstance(e, asyncio.TimeoutError) else type(e).__name__
                    log.warning(
                        "Job %s attempt %d/%d failed (%s): %s",
                        job_id, attempt, self._max_attempts, kind, e,
                    )
                    if is_last:
                        await self._fail(job_id, f"{kind}: {e}")
                        return
                    # Exponential backoff with jitter: 2s, 4s, 8s … capped at 30s.
                    delay = min(30.0, 2.0 * (2 ** (attempt - 1))) + random.uniform(0, 1.5)
                    await self._mark(job_id, status=JobStatus.QUEUED.value)
                    await asyncio.sleep(delay)

    async def _mark(self, job_id: str, **fields) -> None:
        async with SessionLocal() as db:
            job = await db.get(IngestionJob, job_id)
            if not job:
                return
            for k, v in fields.items():
                setattr(job, k, v)
            await db.commit()

    async def _fail(self, job_id: str, error: str) -> None:
        async with SessionLocal() as db:
            job = await db.get(IngestionJob, job_id)
            if not job:
                return
            job.status = JobStatus.FAILED.value
            job.error = error[:1000]
            material = await db.get(Material, job.material_id)
            if material:
                material.status = MaterialStatus.FAILED.value
                material.status_detail = error[:500]
            await db.commit()


# ─────────────────────────────────────────────────────────────
# Module singleton + public API
# ─────────────────────────────────────────────────────────────
async def _default_runner(job_id: str) -> None:
    # Lazy import to avoid a circular import (ingestion imports this module).
    from .ingestion import run_ingestion_job

    await run_ingestion_job(job_id)


_backend: JobBackend = InProcessJobBackend(
    _default_runner,
    concurrency=settings.ingest_concurrency,
    job_timeout_s=settings.ingest_job_timeout_s,
    max_attempts=settings.ingest_max_attempts,
)


def enqueue(job_id: str) -> None:
    """Schedule a job for execution on the configured backend."""
    _backend.submit(job_id)


async def drain(timeout: float = 20.0) -> None:
    await _backend.drain(timeout)


async def recover_stuck_jobs() -> None:
    """On boot, requeue jobs a crash/redeploy left mid-flight.

    ``processing``/``queued`` rows are either resubmitted (if attempts remain) or
    marked failed (if exhausted), so nothing is stuck forever.
    """
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(IngestionJob).where(
                    IngestionJob.status.in_([JobStatus.PROCESSING.value, JobStatus.QUEUED.value])
                )
            )
        ).scalars().all()
        requeue: list[str] = []
        for job in rows:
            if job.attempts >= settings.ingest_max_attempts:
                job.status = JobStatus.FAILED.value
                job.error = "Abandoned after redeploy (max attempts reached)"
                material = await db.get(Material, job.material_id)
                if material:
                    material.status = MaterialStatus.FAILED.value
                    material.status_detail = "Ingestion interrupted by a restart"
            else:
                job.status = JobStatus.QUEUED.value
                job.updated_at = datetime.now(tz=timezone.utc)
                requeue.append(job.id)
        await db.commit()

    for job_id in requeue:
        enqueue(job_id)
    if rows:
        log.info("Recovered %d ingestion job(s) on boot (%d requeued)", len(rows), len(requeue))
