import logging
import base64
import hashlib
import secrets
import time
import urllib.parse
import webbrowser

import requests

from auth import oauth_config
from auth.account_manager import get_account_manager


logger = logging.getLogger(__name__)


class ElyAuthService:
    AUTH_URL = "https://account.ely.by/oauth2/v1"
    TOKEN_URL = "https://account.ely.by/api/oauth2/v1/token"
    ACCOUNT_INFO_URL = "https://account.ely.by/api/account/v1/info"

    SKIN_UPLOAD_PAGE = "https://ely.by/skins/add"
    PROFILE_PAGE = "https://ely.by/u/{username}"
    TOKEN_REFRESH_MARGIN_SECONDS = 120

    def __init__(self):
        self.state = None
        self.code_verifier = None

    @staticmethod
    def _pkce_challenge(code_verifier):
        digest = hashlib.sha256(str(code_verifier).encode("ascii")).digest()
        return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")

    def ensure_configured(self):
        if not oauth_config.ely_is_configured():
            raise RuntimeError(
                "Ely.by OAuth не настроен.\n\n"
                "Для публичного desktop-клиента достаточно:\n"
                "NEXUS_ELY_CLIENT_ID=nexus-launcher\n"
                "NEXUS_ELY_REDIRECT_URI=http://localhost:8089/auth/ely/callback\n\n"
                "NEXUS_ELY_CLIENT_SECRET нужен только для старого confidential-клиента.\n\n"
                "Приложение создаётся в аккаунте Ely.by, redirect URI должен совпадать точно."
            )

    def build_login_url(self):
        self.ensure_configured()

        self.state = secrets.token_urlsafe(24)
        self.code_verifier = secrets.token_urlsafe(64)

        params = {
            "client_id": oauth_config.get_ely_client_id(),
            "redirect_uri": oauth_config.get_ely_redirect_uri(),
            "response_type": "code",
            "scope": "account_info account_email offline_access minecraft_server_session",
            "state": self.state,
            "code_challenge": self._pkce_challenge(self.code_verifier),
            "code_challenge_method": "S256",
        }

        return f"{self.AUTH_URL}?{urllib.parse.urlencode(params)}"

    def open_login_page(self):
        login_url = self.build_login_url()
        webbrowser.open(login_url)
        return login_url

    def complete_login_from_redirect_url(self, redirect_url):
        self.ensure_configured()

        redirect_url = str(redirect_url or "").strip()

        if not redirect_url:
            raise RuntimeError("Вставь redirect URL после входа Ely.by.")

        parsed = urllib.parse.urlparse(redirect_url)
        query = urllib.parse.parse_qs(parsed.query)

        if "error" in query:
            error = query.get("error", ["unknown"])[0]
            message = query.get("error_message", ["Ошибка Ely.by OAuth"])[0]
            raise RuntimeError(f"{error}: {message}")

        code = query.get("code", [None])[0]
        state = query.get("state", [None])[0]

        if not code:
            raise RuntimeError("В redirect URL не найден параметр code.")

        if self.state and state != self.state:
            raise RuntimeError("OAuth state не совпал. Авторизация отменена.")

        token_data = self.exchange_code_for_token(code)
        user_info = self.get_user_info(token_data["access_token"])

        username = user_info.get("username")
        uuid = str(user_info.get("uuid", "")).replace("-", "")

        if not username:
            raise RuntimeError("Ely.by не вернул username.")

        manager = get_account_manager()

        account = {
            "type": "ely",
            "username": username,
            "display_name": username,
            "uuid": uuid,
            "provider": "ely",
            "access_token": token_data.get("access_token", ""),
            "refresh_token_saved": bool(token_data.get("refresh_token")),
            "profile_link": user_info.get("profileLink"),
            "email": user_info.get("email"),
        }

        saved = manager.upsert_account(account)
        manager.set_active_account(saved["id"])

        manager.save_tokens(
            saved["id"],
            {
                "access_token": token_data.get("access_token", ""),
                "refresh_token": token_data.get("refresh_token", ""),
                "token_type": token_data.get("token_type", "Bearer"),
                "expires_in": token_data.get("expires_in", 0),
                "expires_at": token_data.get("expires_at", 0),
            },
        )

        return saved

    def _token_request_data(self, extra):
        data = {
            "client_id": oauth_config.get_ely_client_id(),
            **dict(extra or {}),
        }

        client_secret = oauth_config.get_ely_client_secret()
        if client_secret:
            data["client_secret"] = client_secret

        return data

    def exchange_code_for_token(self, code):
        if oauth_config.ely_is_public_client() and not self.code_verifier:
            raise RuntimeError("PKCE code_verifier не найден. Начни вход Ely.by заново.")

        data = self._token_request_data(
            {
                "redirect_uri": oauth_config.get_ely_redirect_uri(),
                "grant_type": "authorization_code",
                "code": code,
            }
        )

        if self.code_verifier:
            data["code_verifier"] = self.code_verifier

        response = requests.post(
            self.TOKEN_URL,
            data=data,
            timeout=25,
        )

        if response.status_code >= 400:
            raise RuntimeError(response.text)

        data = response.json()

        if "access_token" not in data:
            raise RuntimeError(f"Ely.by не вернул access_token: {data}")

        return self._normalize_token_data(data)

    def _normalize_token_data(self, data, previous_refresh_token=""):
        normalized = dict(data or {})

        if not normalized.get("refresh_token") and previous_refresh_token:
            normalized["refresh_token"] = previous_refresh_token

        try:
            expires_in = int(normalized.get("expires_in") or 0)
        except (TypeError, ValueError):
            expires_in = 0

        normalized["expires_in"] = expires_in
        normalized["expires_at"] = int(time.time()) + expires_in if expires_in > 0 else 0
        normalized.setdefault("token_type", "Bearer")
        return normalized

    def refresh_access_token(self, account_id):
        self.ensure_configured()

        manager = get_account_manager()
        tokens = manager.load_tokens(account_id)
        refresh_token = tokens.get("refresh_token")

        if not refresh_token:
            raise RuntimeError("Для Ely.by аккаунта нет refresh_token. Войди в Ely.by заново.")

        response = requests.post(
            self.TOKEN_URL,
            data=self._token_request_data({
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            }),
            timeout=25,
        )

        if response.status_code >= 400:
            raise RuntimeError(response.text)

        data = response.json()
        if "access_token" not in data:
            raise RuntimeError(f"Ely.by не обновил access_token: {data}")

        normalized = self._normalize_token_data(data, previous_refresh_token=refresh_token)
        manager.save_tokens(account_id, normalized)

        for account in manager.list_accounts():
            if account.get("id") == account_id:
                account["access_token"] = normalized.get("access_token", "")
                account["refresh_token_saved"] = bool(normalized.get("refresh_token"))
                manager.upsert_account(account)
                break

        return normalized

    def ensure_fresh_launch_token(self, account):
        if not account or str(account.get("provider") or "").lower() != "ely":
            return account

        account_id = account.get("id")
        if not account_id:
            return account

        manager = get_account_manager()
        tokens = manager.load_tokens(account_id)

        if not tokens:
            return account

        expires_at = int(tokens.get("expires_at") or 0)
        has_valid_token = bool(tokens.get("access_token")) and (
            not expires_at or expires_at - int(time.time()) > self.TOKEN_REFRESH_MARGIN_SECONDS
        )

        if has_valid_token:
            if account.get("access_token") != tokens.get("access_token"):
                account = dict(account)
                account["access_token"] = tokens.get("access_token", "")
                manager.upsert_account(account)
            return account

        refreshed = self.refresh_access_token(account_id)
        updated = dict(account)
        updated["access_token"] = refreshed.get("access_token", "")
        updated["refresh_token_saved"] = bool(refreshed.get("refresh_token"))
        return manager.upsert_account(updated)

    def get_user_info(self, access_token):
        response = requests.get(
            self.ACCOUNT_INFO_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
            },
            timeout=25,
        )

        if response.status_code >= 400:
            raise RuntimeError(response.text)

        return response.json()

    def open_skin_upload_page(self):
        webbrowser.open(self.SKIN_UPLOAD_PAGE)

    def open_profile_page(self, username):
        username = str(username or "").strip()

        if username:
            webbrowser.open(self.PROFILE_PAGE.format(username=username))
        else:
            webbrowser.open("https://ely.by")

    def get_skin_url(self, username):
        username = str(username or "").strip()
        return f"http://skinsystem.ely.by/skins/{username}.png"