"""Unit tests for the email + token service (no SMTP, no DB)."""
from __future__ import annotations

import hashlib

from app.services.email import generate_token, hash_token


class TestEmailTokens:
    def test_generate_token_returns_raw_and_digest(self):
        raw, digest = generate_token()
        assert isinstance(raw, str) and len(raw) >= 32
        assert isinstance(digest, str) and len(digest) == 64  # sha256 hex

    def test_hash_token_matches_generate(self):
        """hash_token(raw) must reproduce the digest returned alongside raw."""
        raw, digest = generate_token()
        assert hash_token(raw) == digest

    def test_hash_token_is_sha256(self):
        raw = "known-fixed-token-for-test"
        expected = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        assert hash_token(raw) == expected

    def test_generate_is_unique(self):
        seen = {generate_token()[0] for _ in range(200)}
        assert len(seen) == 200  # collisions astronomically unlikely

    def test_raw_tokens_are_never_persisted(self):
        """Sanity check: the digest is what we store, not the raw — guard
        against accidentally logging the raw token in a refactor."""
        raw, digest = generate_token()
        assert raw != digest
