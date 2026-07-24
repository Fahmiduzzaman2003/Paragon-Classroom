from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..dependencies import CurrentUser, Database
from ..models.course import Course
from ..models.job import IngestionJob
from ..models.user import Role
from ..schemas.material import JobOut

router = APIRouter()


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: str, current: CurrentUser, db: Database) -> IngestionJob:
    """Poll an ingestion job. Visible to the job's owner or the course teacher."""
    job = await db.get(IngestionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.user_id != current.id and current.role != Role.ADMIN.value:
        course = await db.get(Course, job.course_id)
        is_teacher = bool(course and course.teacher_id == current.id)
        if not is_teacher:
            raise HTTPException(status_code=403, detail="Not permitted")
    return job
