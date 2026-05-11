from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger(__name__)


# Supported extensions → mime hints (best-effort)
SUPPORTED_EXTS = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
}

MAX_UPLOAD_BYTES = 40 * 1024 * 1024  # 40 MB


class UnsupportedFileError(ValueError):
    pass


def detect_mime(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return SUPPORTED_EXTS.get(ext, "application/octet-stream")


def is_supported(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_EXTS


def extract_pages(path: Path) -> list[tuple[int, str]]:
    """Extract text as a list of (page_number, text) tuples.

    For formats without pages (.txt, .md, .docx), we produce a single "page"
    or split by ``\\f`` form-feeds when present.
    """
    ext = path.suffix.lower()
    if ext == ".pdf":
        return _extract_pdf(path)
    if ext == ".docx":
        return _extract_docx(path)
    if ext == ".pptx":
        return _extract_pptx(path)
    if ext in {".txt", ".md", ".markdown"}:
        return _extract_text(path)
    raise UnsupportedFileError(f"Unsupported file type: {ext}")


def _extract_pdf(path: Path) -> list[tuple[int, str]]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(str(path))
    except Exception as e:  # malformed / encrypted
        log.warning("PDF parse failed for %s: %s", path, e)
        return []
    pages: list[tuple[int, str]] = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        if text.strip():
            pages.append((i, text))
    return pages


def _extract_docx(path: Path) -> list[tuple[int, str]]:
    from docx import Document

    doc = Document(str(path))
    parts: list[str] = []
    for p in doc.paragraphs:
        if p.text.strip():
            parts.append(p.text)
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    text = "\n".join(parts).strip()
    return [(1, text)] if text else []


def _extract_pptx(path: Path) -> list[tuple[int, str]]:
    from pptx import Presentation

    prs = Presentation(str(path))
    pages: list[tuple[int, str]] = []
    for i, slide in enumerate(prs.slides, start=1):
        chunks: list[str] = []
        for shape in slide.shapes:
            if not hasattr(shape, "text_frame"):
                continue
            tf = shape.text_frame
            for para in tf.paragraphs:
                txt = "".join(run.text for run in para.runs).strip()
                if txt:
                    chunks.append(txt)
        if chunks:
            pages.append((i, "\n".join(chunks)))
    return pages


def _extract_text(path: Path) -> list[tuple[int, str]]:
    raw = path.read_text(encoding="utf-8", errors="ignore")
    if "\f" in raw:
        return [(i + 1, part) for i, part in enumerate(raw.split("\f")) if part.strip()]
    return [(1, raw)] if raw.strip() else []
