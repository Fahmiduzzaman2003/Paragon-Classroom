"""Unit tests for the Google OAuth service.

Focuses on the dev-fallback path which has no external dependencies. The real
OIDC flow is exercised by the system tests against a mocked HTTPX transport.
"""
from __future__ import annotations

import pytest

from app.services import google as google_svc


class TestDevFallbackExchange:
    @pytest.mark.asyncio
    async def test_minimum_email(self):
        info = await google_svc.dev_fallback_exchange("Test@Example.com")
        assert info.email == "test@example.com"  # normalized
        assert info.email_verified is True
        assert info.sub.startswith("dev|")

    @pytest.mark.asyncio
    async def test_with_explicit_name(self):
        info = await google_svc.dev_fallback_exchange("u@x.edu", name="Unit Tester")
        assert info.name == "Unit Tester"

    @pytest.mark.asyncio
    async def test_falls_back_to_local_part(self):
        info = await google_svc.dev_fallback_exchange("alice@school.edu")
        assert info.name == "alice"

    @pytest.mark.asyncio
    async def test_missing_email_rejected(self):
        with pytest.raises(google_svc.GoogleAuthError):
            await google_svc.dev_fallback_exchange("")


class TestAuthorizationUrl:
    def test_raises_when_not_configured(self):
        import importlib

        from app import config as config_module

        original_id = config_module.settings.google_oauth_client_id
        original_secret = config_module.settings.google_oauth_client_secret
        try:
            object.__setattr__(config_module.settings, "google_oauth_client_id", "")
            object.__setattr__(config_module.settings, "google_oauth_client_secret", "")
            with pytest.raises(google_svc.GoogleAuthError):
                google_svc.build_authorization_url(state="nonce")
        finally:
            object.__setattr__(config_module.settings, "google_oauth_client_id", original_id)
            object.__setattr__(config_module.settings, "google_oauth_client_secret", original_secret)

    def test_returns_google_url_when_configured(self):
        from app import config as config_module

        original_id = config_module.settings.google_oauth_client_id
        original_secret = config_module.settings.google_oauth_client_secret
        try:
            object.__setattr__(config_module.settings, "google_oauth_client_id", "fake-client-id")
            object.__setattr__(config_module.settings, "google_oauth_client_secret", "fake-secret")
            url = google_svc.build_authorization_url(state="abc")
            assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth")
            assert "client_id=fake-client-id" in url
            assert "state=abc" in url
            assert "scope=openid+email+profile" in url
        finally:
            object.__setattr__(config_module.settings, "google_oauth_client_id", original_id)
            object.__setattr__(config_module.settings, "google_oauth_client_secret", original_secret)
