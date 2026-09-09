import logging
import secrets
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

    def __init__(self):
        self.state = None

    def ensure_configured(self):
        if not oauth_config.ely_is_configured():
            raise RuntimeError(
                "Ely.by OAuth не настроен.\n\n"
                "Нужно задать переменные окружения:\n"
                "NEXUS_oauth_config.get_ely_client_id()\n"
                "NEXUS_oauth_config.get_ely_client_secret()\n"
                "NEXUS_oauth_config.get_ely_redirect_uri()\n\n"
                "Приложение создаётся в аккаунте Ely.by."
            )

    def build_login_url(self):
        self.ensure_configured()

        self.state = secrets.token_urlsafe(24)

        params = {
            "client_id": oauth_config.get_ely_client_id(),
            "redirect_uri": oauth_config.get_ely_redirect_uri(),
            "response_type": "code",
            "scope": "account_info account_email offline_access minecraft_server_session",
            "state": self.state,
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
            },
        )

        return saved

    def exchange_code_for_token(self, code):
        response = requests.post(
            self.TOKEN_URL,
            data={
                "client_id": oauth_config.get_ely_client_id(),
                "client_secret": oauth_config.get_ely_client_secret(),
                "redirect_uri": oauth_config.get_ely_redirect_uri(),
                "grant_type": "authorization_code",
                "code": code,
            },
            timeout=25,
        )

        if response.status_code >= 400:
            raise RuntimeError(response.text)

        data = response.json()

        if "access_token" not in data:
            raise RuntimeError(f"Ely.by не вернул access_token: {data}")

        return data

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