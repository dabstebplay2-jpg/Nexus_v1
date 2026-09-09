from __future__ import annotations

import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer


class OAuthCallbackServer:
    """Small one-shot localhost OAuth callback server for desktop launcher login."""

    def __init__(self, redirect_uri: str, timeout: int = 180):
        self.redirect_uri = str(redirect_uri)
        self.timeout = int(timeout or 180)
        parsed = urllib.parse.urlparse(self.redirect_uri)

        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        self.expected_path = parsed.path or "/"

        self.url = None
        self.error = None
        self._event = threading.Event()
        self._server = None
        self._thread = None

        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                outer.url = f"http://{self.headers.get('Host')}{self.path}"

                parsed_request = urllib.parse.urlparse(self.path)
                ok = parsed_request.path == outer.expected_path

                if ok:
                    body = (
                        "<html><head><meta charset='utf-8'></head>"
                        "<body style='font-family:Segoe UI;background:#020617;color:#e5e7eb;padding:40px'>"
                        "<h1>Nexus Launcher</h1>"
                        "<p>Авторизация получена. Можно вернуться в лаунчер.</p>"
                        "</body></html>"
                    )
                    self.send_response(200)
                else:
                    body = (
                        "<html><head><meta charset='utf-8'></head>"
                        "<body style='font-family:Segoe UI;background:#020617;color:#fecaca;padding:40px'>"
                        "<h1>Nexus Launcher</h1>"
                        "<p>Неверный callback path. Проверь redirect URI.</p>"
                        "</body></html>"
                    )
                    self.send_response(404)

                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body.encode("utf-8"))))
                self.end_headers()
                self.wfile.write(body.encode("utf-8"))

                if ok:
                    outer._event.set()

            def log_message(self, format, *args):
                return

        self._server = HTTPServer((host, port), Handler)

    def start(self):
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def wait(self):
        if not self._event.wait(self.timeout):
            raise TimeoutError("Время ожидания OAuth callback истекло. Попробуй войти ещё раз.")
        return self.url

    def close(self):
        try:
            if self._server:
                self._server.shutdown()
                self._server.server_close()
        except Exception:
            pass
