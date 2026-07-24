"""Unit tests: deterministic grading, magic-byte validation, LLM helpers."""
from __future__ import annotations

import pytest

from app.services.llm.errors import Decision, classify
from app.services.llm.orchestrator import _extract_json
from app.utils.file_parsers import UnsupportedFileError, validate_magic


class _Q:
    """Minimal stand-in for a Question row (grade_answer only reads these)."""

    def __init__(self, type_, correct, points=10, explanation=""):
        self.type = type_
        self.correct = correct
        self.points = points
        self.explanation = explanation


@pytest.mark.unit
class TestObjectiveGrading:
    def test_mcq_single_correct_and_incorrect(self):
        from app.services.grading import grade_answer

        q = _Q("mcq_single", [2], points=10)
        assert grade_answer(q, [2], "").points == 10
        assert grade_answer(q, [0], "").points == 0

    def test_true_false_deterministic(self):
        from app.services.grading import grade_answer

        q = _Q("true_false", [1], points=5)
        assert grade_answer(q, [1], "").correct is True
        assert grade_answer(q, [0], "").correct is False

    def test_mcq_multi_partial_credit_never_negative(self):
        from app.services.grading import grade_answer

        q = _Q("mcq_multi", [0, 1], points=10)
        # One right, one wrong → clamped at 0, never negative.
        assert grade_answer(q, [0, 3], "").points >= 0

    def test_essay_without_model_answer_is_manual(self):
        from app.services.grading import grade_answer

        q = _Q("essay", [], points=20)
        res = grade_answer(q, [], "A thoughtful essay.")
        assert res.auto is False  # routed to manual review


@pytest.mark.unit
class TestMagicValidation:
    def test_accepts_valid_text(self):
        assert validate_magic("notes.txt", b"hello world") == "text/plain"

    def test_rejects_exe_disguised_as_pdf(self):
        with pytest.raises(UnsupportedFileError):
            validate_magic("evil.pdf", b"MZ\x90\x00\x03")

    def test_rejects_bad_pdf_signature(self):
        with pytest.raises(UnsupportedFileError):
            validate_magic("x.pdf", b"not really a pdf")

    def test_rejects_unsupported_extension(self):
        with pytest.raises(UnsupportedFileError):
            validate_magic("archive.zip", b"PK\x03\x04")

    def test_accepts_pdf_with_real_signature(self):
        assert validate_magic("real.pdf", b"%PDF-1.7\n...") == "application/pdf"


@pytest.mark.unit
class TestLLMHelpers:
    def test_error_classification(self):
        class E:
            def __init__(self, status):
                self.status_code = status

        assert classify(E(429)) == Decision.RETRY_SAME
        assert classify(E(401)) == Decision.NEXT_PROVIDER
        assert classify(E(404)) == Decision.NEXT_PROVIDER
        assert classify(E(503)) == Decision.RETRY_SAME
        assert classify(Exception("maximum context length exceeded")) == Decision.NEXT_PROVIDER

    def test_extract_json_from_prose_and_fences(self):
        assert _extract_json('result: {"score": 8}')["score"] == 8
        assert _extract_json('```json\n{"score": 5}\n```')["score"] == 5
        assert _extract_json('{"a": {"b": 1}}')["a"]["b"] == 1
