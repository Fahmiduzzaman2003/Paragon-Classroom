"""Unit tests for app/utils/security.py — the cryptographic primitives that
underpin every authenticated request. No DB, no HTTP, no asyncio."""
from __future__ import annotations

import pytest
from jose import JWTError

from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_course_code,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_returns_bcrypt_string(self):
        h = hash_password("hunter2!")
        assert isinstance(h, str)
        assert h.startswith("$2b$") or h.startswith("$2a$")

    def test_hash_is_non_deterministic(self):
        a = hash_password("hunter2!")
        b = hash_password("hunter2!")
        assert a != b  # bcrypt uses a random salt per call

    def test_verify_accepts_correct_password(self):
        h = hash_password("correct horse battery staple")
        assert verify_password("correct horse battery staple", h) is True

    def test_verify_rejects_wrong_password(self):
        h = hash_password("hunter2!")
        assert verify_password("hunter3?", h) is False

    def test_verify_handles_corrupt_hash_gracefully(self):
        """A garbage hash must return False, never raise (security-critical)."""
        assert verify_password("anything", "not-a-real-hash") is False
        assert verify_password("anything", "") is False

    def test_password_roundtrip_unicode(self):
        pw = "пароль🔐密码"
        h = hash_password(pw)
        assert verify_password(pw, h)
        assert not verify_password(pw + "x", h)


class TestJWTLifecycle:
    def test_access_token_encodes_user_id_and_role(self):
        token, ttl = create_access_token("user-123", extra={"role": "teacher"})
        assert isinstance(token, str)
        assert ttl > 0
        payload = decode_token(token, expected_type="access")
        assert payload["sub"] == "user-123"
        assert payload["typ"] == "access"
        assert payload["role"] == "teacher"

    def test_refresh_token_round_trip(self):
        token = create_refresh_token("user-abc")
        payload = decode_token(token, expected_type="refresh")
        assert payload["sub"] == "user-abc"
        assert payload["typ"] == "refresh"

    def test_decode_rejects_wrong_type(self):
        """An access token presented as a refresh (or vice versa) is rejected."""
        access, _ = create_access_token("user-123")
        refresh = create_refresh_token("user-123")
        with pytest.raises(JWTError):
            decode_token(access, expected_type="refresh")
        with pytest.raises(JWTError):
            decode_token(refresh, expected_type="access")

    def test_decode_rejects_garbage(self):
        with pytest.raises(JWTError):
            decode_token("not.a.jwt", expected_type="access")

    def test_tokens_are_unique(self):
        # Two access tokens for different subjects must encode different payloads.
        a, _ = create_access_token("user-aaa")
        b, _ = create_access_token("user-bbb")
        assert a != b
        pa = decode_token(a, expected_type="access")
        pb = decode_token(b, expected_type="access")
        assert pa["sub"] != pb["sub"]


class TestCourseCodes:
    @pytest.mark.parametrize("length", [4, 6, 8])
    def test_generate_course_code_shape(self, length: int):
        code = generate_course_code(length=length)
        assert code.startswith("PRG-")
        body = code.removeprefix("PRG-")
        assert len(body) == length
        # No ambiguous characters (0, O, 1, I)
        for ch in body:
            assert ch not in "0O1I"

    def test_generate_course_code_is_random(self):
        codes = {generate_course_code() for _ in range(50)}
        # Birthday-bound: 50 draws from ~32^6 > 1M space — collisions vanishingly rare
        assert len(codes) >= 49
