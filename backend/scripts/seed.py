"""Seed Paragon with a demo teacher, students, two courses, and sample materials.

Run from the backend directory:

    python -m scripts.seed

Idempotent: re-running won't duplicate users/courses (matched by email/code) but it
will skip course creation if either course already exists. Materials are re-uploaded
on every run because the underlying files may have changed.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from textwrap import dedent

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal, init_db
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.material import Material, MaterialSection, MaterialStatus
from app.models.user import Role, User
from app.services.ingestion import ingest_material
from app.utils.file_parsers import detect_mime
from app.utils.security import generate_course_code, hash_password

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s seed: %(message)s")
log = logging.getLogger("seed")


# ─────────────────────────────────────────────────────
# Sample text materials. We intentionally use plain text so the seed runs without
# bundling binary PDFs and so the demo works offline.
# ─────────────────────────────────────────────────────

DS_LECTURE_3 = dedent(
    """
    Lecture 3 — Binary Search Trees
    -----------------------------------

    A binary search tree (BST) is a binary tree satisfying the BST property: for every
    node n, every key in the left subtree is strictly less than n.key, and every key in
    the right subtree is strictly greater. In-order traversal of a BST therefore yields
    keys in sorted order — proven by induction on subtree size.

    Search, insert, and delete on a BST of height h all run in O(h) time. A balanced
    BST keeps h = O(log n); a degenerate BST (e.g. inserting sorted keys) yields
    h = O(n). Red-black trees and AVL trees enforce balance invariants that guarantee
    h = O(log n).

    Red-black trees sacrifice strict balance for cheaper rebalancing cost. The
    amortized number of rotations per update is O(1). This makes them attractive for
    workloads with heavy writes.

    AVL trees maintain a stricter invariant: for every node, the heights of its two
    subtrees differ by at most 1. This gives a tighter height bound of approximately
    1.44 log2(n+2), which makes AVL faster for pure lookup workloads.

    Practical rule of thumb: prefer red-black when writes dominate; prefer AVL when
    reads dominate. Standard library implementations (std::map, java.util.TreeMap)
    use red-black trees because their workloads are mixed.
    """
).strip()

DS_HASHING = dedent(
    """
    Lecture 4 — Hashing and Amortized Analysis
    -----------------------------------

    A hash table maps keys to slots in an array via a hash function h. With chaining,
    collisions cause linked-list growth in a slot. With open addressing, collisions
    probe to alternate slots.

    Dynamic resizing: when load factor α = n/m exceeds a threshold (commonly 0.75),
    we double the table size and rehash. This O(n) operation happens only after at
    least n inserts; using the potential method Φ(D) = 2·num − size, the amortized
    cost of TABLE-INSERT is at most 3, i.e. O(1).

    Key choice: cryptographic hashes are overkill; for in-memory tables, MurmurHash
    or xxHash give good distribution and avoid pathological inputs (Hash-DoS) when
    seeded per-process.
    """
).strip()

ALGO_DP = dedent(
    """
    Lecture 2 — Dynamic Programming
    -----------------------------------

    Dynamic programming applies when a problem exhibits optimal substructure
    (an optimal solution can be composed from optimal subsolutions) and overlapping
    subproblems (the same subsolutions appear repeatedly).

    Standard examples:
      • Fibonacci: F(n) = F(n-1) + F(n-2), with memoization or tabulation.
      • Longest common subsequence: LCS(i, j) = 1 + LCS(i-1, j-1) if x_i == y_j else
        max(LCS(i-1, j), LCS(i, j-1)).
      • 0/1 knapsack: K(i, w) = max(K(i-1, w), v_i + K(i-1, w-w_i)) when w_i ≤ w.

    Top-down with memoization is convenient when the recursion is sparse; bottom-up
    is preferable when nearly all subproblems will be evaluated.

    The exchange argument is a useful proof technique for showing greedy algorithms
    are optimal: assume a different optimum exists, swap an early choice for the
    greedy one, and argue the total objective does not decrease.
    """
).strip()

DBMS_INDEX = dedent(
    """
    Lecture 7 — B-tree indexes and query plans
    -----------------------------------

    A B-tree index on a sorted column lets the database locate rows in O(log n) by
    descending balanced fanout nodes. The leftmost prefix rule says a composite
    index (a, b, c) accelerates queries that filter on (a), (a, b), or (a, b, c) —
    but not on (b) alone.

    Reading EXPLAIN ANALYZE output:
      • Seq Scan: linear scan; OK for small tables, costly for large ones.
      • Index Scan: uses an index but still visits heap rows for non-indexed columns.
      • Index Only Scan: covered by the index alone — cheapest.
      • Bitmap Index Scan: combines multiple indexes via bitmap AND/OR.

    Locking and isolation levels:
      • Read Uncommitted is rarely useful and exposes dirty reads.
      • Read Committed prevents dirty reads but allows non-repeatable reads.
      • Repeatable Read locks the snapshot.
      • Serializable serializes transactions, often via predicate locks.
    """
).strip()


SAMPLE_MATERIALS: dict[str, list[tuple[str, str, str, list[str]]]] = {
    "DS": [
        ("Lecture_03_BinaryTrees.txt", "Week 3", DS_LECTURE_3, ["lecture", "trees"]),
        (
            "Lecture_04_HashingAmortized.txt",
            "Week 4",
            DS_HASHING,
            ["lecture", "hashing", "amortized"],
        ),
    ],
    "ALGO": [
        ("Lecture_02_DynamicProgramming.txt", "Week 2", ALGO_DP, ["lecture", "dp"]),
    ],
    "DBMS": [
        ("Lecture_07_Indexing.txt", "Week 7", DBMS_INDEX, ["lecture", "indexing"]),
    ],
}


# ─────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────

async def upsert_user(
    db,
    *,
    email: str,
    name: str,
    role: str,
    password: str,
    institution: str,
) -> User:
    """Create the user if missing, otherwise reset their password / role to the
    seed values. This makes the demo accounts reliably loginable across re-runs."""
    existing = await db.scalar(select(User).where(User.email == email.lower()))
    if existing:
        existing.password_hash = hash_password(password)
        existing.name = name
        existing.role = role
        existing.institution = institution
        await db.flush()
        return existing
    u = User(
        email=email.lower(),
        password_hash=hash_password(password),
        name=name,
        role=role,
        institution=institution,
    )
    db.add(u)
    await db.flush()
    return u


async def upsert_course(
    db,
    *,
    teacher: User,
    name: str,
    description: str,
    semester: str,
    gradient: str,
    accent_hue: int,
    ai_name: str,
    ai_personality: str,
) -> tuple[Course, bool]:
    existing = await db.scalar(
        select(Course).where(Course.teacher_id == teacher.id, Course.name == name)
    )
    if existing:
        return existing, False
    course = Course(
        teacher_id=teacher.id,
        code=generate_course_code(),
        name=name,
        description=description,
        semester=semester,
        gradient=gradient,
        accent_hue=accent_hue,
        ai_name=ai_name,
        ai_personality=ai_personality,
        rag_mode="balanced",
    )
    db.add(course)
    await db.flush()
    return course, True


async def upload_seed_material(
    db,
    *,
    course: Course,
    uploader: User,
    filename: str,
    folder: str,
    text: str,
    tags: list[str],
) -> Material:
    course_dir = settings.uploads_dir / course.id
    course_dir.mkdir(parents=True, exist_ok=True)

    # Reuse the latest material with this filename if present (idempotent re-runs).
    existing = await db.scalar(
        select(Material).where(
            Material.course_id == course.id, Material.filename == filename
        )
    )
    if existing:
        existing.status = MaterialStatus.PROCESSING.value
        path = Path(existing.path)
    else:
        from uuid import uuid4

        mid = str(uuid4())
        path = course_dir / f"{mid}__{filename}"
        existing = Material(
            id=mid,
            course_id=course.id,
            uploader_id=uploader.id,
            section=MaterialSection.CLASS.value,
            filename=filename,
            path=str(path),
            mime=detect_mime(filename),
            size=len(text.encode("utf-8")),
            folder=folder,
            tags=tags,
            status=MaterialStatus.PROCESSING.value,
        )
        db.add(existing)

    path.write_text(text, encoding="utf-8")
    existing.size = path.stat().st_size
    return existing


# ─────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────

async def main() -> None:
    log.info("Initializing schema…")
    await init_db()

    async with SessionLocal() as db:
        teacher = await upsert_user(
            db,
            email="prof.rivera@paragon.edu",
            name="Prof. Amelia Rivera",
            role=Role.TEACHER.value,
            password="paragon-demo-1234",
            institution="Paragon University",
        )
        student_a = await upsert_user(
            db,
            email="fahmid@paragon.edu",
            name="Fahmid Uzzaman",
            role=Role.STUDENT.value,
            password="paragon-demo-1234",
            institution="Paragon University",
        )
        student_b = await upsert_user(
            db,
            email="ayaan@paragon.edu",
            name="Ayaan Khan",
            role=Role.STUDENT.value,
            password="paragon-demo-1234",
            institution="Paragon University",
        )

        ds_course, ds_created = await upsert_course(
            db,
            teacher=teacher,
            name="Data Structures",
            description="Arrays, lists, trees, graphs. Deep invariants and amortized analysis.",
            semester="Spring 2026",
            gradient="#815AFF,#FF46BE,#00C8FF",
            accent_hue=268,
            ai_name="DS AI",
            ai_personality=(
                "A focused, patient tutor that explains data structures with diagrams and "
                "invariants. Prefers step-by-step derivations over one-line answers."
            ),
        )
        algo_course, algo_created = await upsert_course(
            db,
            teacher=teacher,
            name="Algorithms",
            description="Divide-and-conquer, greedy, DP, network flow, NP-completeness.",
            semester="Spring 2026",
            gradient="#FF46BE,#FF8A3D,#FFD66B",
            accent_hue=326,
            ai_name="Algo AI",
            ai_personality=(
                "A rigorous coach that always asks for invariants and recurrences before "
                "revealing a technique. Loves the exchange argument."
            ),
        )
        dbms_course, dbms_created = await upsert_course(
            db,
            teacher=teacher,
            name="Database Management Systems",
            description="Relational algebra, transactions, indexing, query optimization.",
            semester="Spring 2026",
            gradient="#00C8FF,#78FFD2,#815AFF",
            accent_hue=196,
            ai_name="DBMS AI",
            ai_personality=(
                "A pragmatic DBA that leans on concrete SQL, shows execution plans, and "
                "never hand-waves locking or isolation."
            ),
        )

        for s in (student_a, student_b):
            for c in (ds_course, algo_course, dbms_course):
                exists = await db.scalar(
                    select(Enrollment).where(
                        Enrollment.user_id == s.id, Enrollment.course_id == c.id
                    )
                )
                if not exists:
                    db.add(Enrollment(user_id=s.id, course_id=c.id))

        # Upload + queue ingestion for sample materials.
        materials_to_ingest: list[str] = []
        for course, key in (
            (ds_course, "DS"),
            (algo_course, "ALGO"),
            (dbms_course, "DBMS"),
        ):
            for filename, folder, text, tags in SAMPLE_MATERIALS[key]:
                m = await upload_seed_material(
                    db,
                    course=course,
                    uploader=teacher,
                    filename=filename,
                    folder=folder,
                    text=text,
                    tags=tags,
                )
                materials_to_ingest.append(m.id)

        await db.commit()

    log.info("Ingesting %d sample materials (this may download embeddings on first run)…", len(materials_to_ingest))
    for mid in materials_to_ingest:
        try:
            await ingest_material(mid)
        except Exception as e:
            log.warning("Ingestion failed for %s: %s", mid, e)

    log.info("Seed complete.")
    log.info("Sign in:")
    log.info("  Teacher:  prof.rivera@paragon.edu / paragon-demo-1234")
    log.info("  Student:  fahmid@paragon.edu / paragon-demo-1234")
    log.info("  Student:  ayaan@paragon.edu / paragon-demo-1234")


if __name__ == "__main__":
    asyncio.run(main())
