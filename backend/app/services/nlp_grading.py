"""
Lightweight NLP grading for written answers.

This is a pure-stdlib scorer (no torch/sklearn) so it runs anywhere the rest
of Paragon does. The teacher provides one or more "model answers" in
``Question.correct``; we compare the student's response against each and
take the best similarity score, then award proportional credit.

Pipeline:
  1. Lowercase, strip punctuation, drop English stopwords.
  2. Crude lemma normalisation (suffix stripping for common endings).
  3. Score = max(jaccard, weighted_token_overlap, char_ngram_cosine).

The hybrid score handles three failure modes a single metric struggles with:
  - Synonyms or extra wording (token overlap > jaccard).
  - Partial matches with shared roots (lemma stripping helps).
  - Misspelt or differently-tokenised answers (char n-grams catch those).

Confidence is reported back so the UI can flag low-confidence auto-grades to
the teacher for manual review.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

_STOPWORDS = frozenset(
    {
        "a", "an", "the", "and", "or", "but", "if", "is", "are", "was", "were",
        "be", "been", "being", "have", "has", "had", "do", "does", "did",
        "of", "in", "on", "at", "to", "for", "by", "with", "from", "as",
        "this", "that", "these", "those", "it", "its", "itself", "i", "we",
        "you", "they", "them", "he", "she", "his", "her", "their", "our", "my",
        "me", "us", "your", "yours", "ours", "so", "than", "then", "there",
        "here", "what", "which", "who", "whom", "how", "when", "where", "why",
        "not", "no", "only", "very", "can", "will", "would", "should", "could",
        "may", "might", "must", "also", "such", "into", "out", "up", "down",
        "about", "above", "below", "over", "under", "again", "more", "most",
        "some", "any", "each", "all", "both",
    }
)

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_SUFFIXES = ("ingly", "edly", "ing", "ies", "ied", "ily", "ier", "iest", "ed", "es", "ly", "s")


def _lemma(tok: str) -> str:
    if len(tok) < 5:
        return tok
    for suf in _SUFFIXES:
        if tok.endswith(suf) and len(tok) - len(suf) >= 3:
            return tok[: -len(suf)]
    return tok


def _tokens(text: str) -> list[str]:
    text = text.lower()
    raw = _TOKEN_RE.findall(text)
    return [_lemma(t) for t in raw if t not in _STOPWORDS]


def _char_ngrams(text: str, n: int = 3) -> Counter[str]:
    text = re.sub(r"\s+", " ", text.lower().strip())
    return Counter(text[i : i + n] for i in range(max(0, len(text) - n + 1)))


def _cosine(a: Counter[str], b: Counter[str]) -> float:
    if not a or not b:
        return 0.0
    common = set(a) & set(b)
    if not common:
        return 0.0
    dot = sum(a[k] * b[k] for k in common)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb) if na and nb else 0.0


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / max(1, len(a | b))


def _token_overlap(student: list[str], reference: list[str]) -> float:
    """Recall-biased overlap: how much of the reference answer is covered?"""
    if not reference:
        return 0.0
    ref_counter = Counter(reference)
    stu_counter = Counter(student)
    matched = sum(min(ref_counter[k], stu_counter[k]) for k in ref_counter)
    return matched / sum(ref_counter.values())


@dataclass(slots=True)
class NlpScore:
    similarity: float        # 0..1
    confidence: float        # 0..1, low ⇒ flag for manual review
    matched_keywords: list[str]


def score_written(student_text: str, reference_answers: list[str]) -> NlpScore:
    """Return the best similarity score across all reference answers."""
    student_text = (student_text or "").strip()
    refs = [r for r in (reference_answers or []) if isinstance(r, str) and r.strip()]
    if not student_text or not refs:
        return NlpScore(similarity=0.0, confidence=0.0, matched_keywords=[])

    s_tokens = _tokens(student_text)
    s_set = set(s_tokens)
    s_ng = _char_ngrams(student_text)

    best = 0.0
    best_matched: list[str] = []
    for ref in refs:
        r_tokens = _tokens(ref)
        r_set = set(r_tokens)
        r_ng = _char_ngrams(ref)

        jac = _jaccard(s_set, r_set)
        cov = _token_overlap(s_tokens, r_tokens)
        ng = _cosine(s_ng, r_ng)

        # Weighted blend — coverage matters most for short factual answers,
        # n-grams handle spelling variation, jaccard catches "wrote everything
        # the teacher said but in a different order".
        score = 0.45 * cov + 0.35 * ng + 0.20 * jac
        if score > best:
            best = score
            best_matched = sorted(s_set & r_set)

    # Confidence: high when at least two of the three signals agree, lower
    # when only character n-grams matched (probably a coincidental substring).
    confidence = min(1.0, best * 1.1)
    if len(best_matched) < 2 and best < 0.6:
        confidence *= 0.5

    return NlpScore(similarity=round(best, 3), confidence=round(confidence, 3), matched_keywords=best_matched[:8])
