from __future__ import annotations

import json
import os
import re
import unittest
from pathlib import Path
from unittest.mock import patch

from core.app_info import APP_VERSION, GITHUB_OWNER, GITHUB_REPO
from tools.generate_website_release import normalize_repo


ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT / "website"
REPO = f"{GITHUB_OWNER}/{GITHUB_REPO}"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class ProjectIntegrityTests(unittest.TestCase):
    def test_website_release_metadata_matches_app_info(self) -> None:
        release = json.loads(read_text(WEBSITE / "release.json"))
        downloads_release = json.loads(read_text(WEBSITE / "downloads" / "release.json"))
        index = read_text(WEBSITE / "index.html")
        script = read_text(WEBSITE / "script.js")

        self.assertEqual(release["version"], APP_VERSION)
        self.assertEqual(downloads_release["version"], APP_VERSION)
        self.assertEqual(release["repo"], REPO)
        self.assertEqual(downloads_release["repo"], REPO)
        self.assertIn(f'window.NEXUS_VERSION = "{APP_VERSION}";', index)
        self.assertIn(f'window.NEXUS_REPO = "{REPO}";', index)
        self.assertIn(f'const fallbackVersion = window.NEXUS_VERSION || "{APP_VERSION}";', script)
        self.assertIn(f'const repo = window.NEXUS_REPO || "{REPO}";', script)

        expected_installer = f"NexusLauncherSetup-{APP_VERSION}-win-x64.exe"
        expected_portable = f"NexusLauncher-{APP_VERSION}-win-x64-portable.zip"
        for payload in (release, downloads_release):
            self.assertIn(expected_installer, json.dumps(payload, ensure_ascii=False))
            self.assertIn(expected_portable, json.dumps(payload, ensure_ascii=False))

    def test_static_site_uses_canonical_assets_everywhere(self) -> None:
        index = read_text(WEBSITE / "index.html")
        privacy = read_text(WEBSITE / "privacy.html")
        not_found = read_text(WEBSITE / "404.html")
        manifest = read_text(WEBSITE / "manifest.webmanifest")
        vercel = read_text(WEBSITE / "vercel.json")
        headers = read_text(WEBSITE / "_headers")
        deep_qa = read_text(ROOT / "tools" / "deep_qa.py")

        for html in (index, privacy, not_found):
            self.assertIn('href="styles.css"', html)
            self.assertNotIn('href="style.css"', html)

        self.assertIn('src="script.js"', index)
        self.assertNotIn('src="app.js"', index)
        self.assertIn('"source": "/styles.css"', vercel)
        self.assertNotIn('"source": "/style.css"', vercel)
        self.assertRegex(headers, re.compile(r"^/styles\.css$", re.MULTILINE))
        self.assertNotRegex(headers, re.compile(r"^/style\.css$", re.MULTILINE))
        self.assertIn('"website/script.js"', deep_qa)
        self.assertNotIn('"website/app.js"', deep_qa)
        self.assertFalse((WEBSITE / "style.css").exists())
        self.assertFalse((WEBSITE / "app.js").exists())

        self.assertNotIn(".png", index + privacy + not_found)
        self.assertNotIn(".png", manifest)
        for asset in ("assets/favicon.svg", "assets/logo.svg", "assets/og-cover.svg"):
            self.assertTrue((WEBSITE / asset).exists(), asset)
            self.assertIn(asset, index + manifest)

    def test_ci_runs_project_integrity_tests(self) -> None:
        ci = read_text(ROOT / ".github" / "workflows" / "ci.yml")

        self.assertIn("python -m unittest discover -s tests", ci)
        self.assertIn("python tools/deep_qa.py", ci)

    def test_deep_qa_does_not_depend_on_network_loader_api(self) -> None:
        deep_qa = read_text(ROOT / "tools" / "deep_qa.py")
        full_audit = read_text(ROOT / "tools" / "full_audit.py")

        self.assertIn("collect_issues(include_ui=False, include_network=False)", deep_qa)
        self.assertIn("def audit_loader_rules()", full_audit)
        self.assertIn("include_network: bool = True", full_audit)
        self.assertIn("--skip-network", full_audit)
        self.assertIn("--skip-ui", full_audit)

    def test_launcher_sidebar_compact_policy_is_explicit(self) -> None:
        from app.window import should_use_compact_sidebar

        sidebar = read_text(ROOT / "ui" / "components" / "sidebar.py")
        topbar = read_text(ROOT / "ui" / "components" / "topbar.py")
        window = read_text(ROOT / "app" / "window.py")

        self.assertFalse(should_use_compact_sidebar(1179, user_collapsed=False))
        self.assertFalse(should_use_compact_sidebar(1400, user_collapsed=False))
        self.assertTrue(should_use_compact_sidebar(1400, user_collapsed=True))
        self.assertIn("SidebarCollapseButton", sidebar)
        self.assertIn("collapsed_changed", sidebar)
        self.assertIn("_on_logo_clicked", sidebar)
        self.assertIn('button.setProperty("compact", compact)', sidebar)
        self.assertIn('self.logo_card.setFixedSize(58 if compact else 196', sidebar)
        self.assertNotIn("SidebarRailButton", sidebar)
        self.assertIn("should_use_compact_topbar", window)
        self.assertIn("THEME_LABELS", topbar)
        self.assertNotIn("TopbarMenuButton", topbar)
        self.assertIn("collapsed_changed.connect", window)

    def test_launcher_topbar_exposes_theme_toggle(self) -> None:
        topbar = read_text(ROOT / "ui" / "components" / "topbar.py")
        window = read_text(ROOT / "app" / "window.py")
        settings = read_text(ROOT / "ui" / "pages" / "settings_page.py")
        styles = read_text(ROOT / "ui" / "styles.py")

        self.assertIn("theme_clicked = Signal()", topbar)
        self.assertIn('setObjectName("TopbarThemeButton")', topbar)
        self.assertIn("self.topbar.theme_clicked.connect(self.toggle_theme)", window)
        self.assertIn("THEME_OPTIONS", styles)
        self.assertIn("for theme_id, theme_label in THEME_OPTIONS", settings)

    def test_launcher_ui_regressions_are_guarded(self) -> None:
        mods = read_text(ROOT / "ui" / "pages" / "mods_page.py")
        accounts = read_text(ROOT / "ui" / "pages" / "accounts_page.py")
        main = read_text(ROOT / "main.py")
        settings = read_text(ROOT / "core" / "launcher_settings.py")
        launcher = read_text(ROOT / "core" / "launcher.py")
        discord_presence = read_text(ROOT / "core" / "discord_presence.py")
        ely_authlib = read_text(ROOT / "core" / "ely_authlib.py")
        wheel_guard = read_text(ROOT / "ui" / "wheel_guard.py")
        settings_page = read_text(ROOT / "ui" / "pages" / "settings_page.py")
        instances_page = read_text(ROOT / "ui" / "pages" / "instances_page.py")
        styles = read_text(ROOT / "ui" / "styles.py")
        custom_skin_loader = read_text(ROOT / "core" / "custom_skin_loader.py")
        skin_preview = read_text(ROOT / "ui" / "components" / "skin_preview.py")
        i18n = read_text(ROOT / "core" / "i18n.py")

        self.assertIn("collapsed = self.advanced_filters_widget.isVisible()", mods)
        self.assertIn("Показать фильтры", mods)
        self.assertIn("def start_auth_worker", accounts)
        self.assertIn("def _try_import_ely_skin_for_account", accounts)
        self.assertIn("reflow_skin_action_buttons", accounts)
        self.assertIn("skin_studio_layout.setDirection", accounts)
        self.assertIn("self.accounts_panel.setMinimumWidth(0 if narrow else 330)", accounts)
        self.assertIn("install_no_wheel_value_changes(app)", main)
        self.assertIn('lang = "ru"', main)
        self.assertNotIn("detect_os_language", main)
        self.assertIn("DEFAULT_DISCORD_CLIENT_ID", settings)
        self.assertIn("set_launching", discord_presence)
        self.assertIn("set_minecraft_closed", discord_presence)
        self.assertIn("_game_active", discord_presence)
        self.assertIn("ensure_authlib_injector()", launcher)
        self.assertIn("set_launching(instance)", launcher)
        self.assertIn("set_minecraft_closed", launcher)
        self.assertIn("prepare_custom_skin_loader", launcher)
        self.assertIn("build_ely_javaagent_argument", ely_authlib)
        self.assertIn("_nearest_scroll_area", wheel_guard)
        self.assertIn("_scroll_parent", wheel_guard)
        self.assertIn("windows_wheel_scroll_lines", wheel_guard)
        self.assertIn("_compute_scroll_delta", wheel_guard)
        self.assertNotIn("English", settings_page)
        self.assertNotIn("lang_combo", settings_page)
        self.assertNotIn('"en"', i18n)
        self.assertFalse((ROOT / "ui" / "locales" / "en.json").exists())
        self.assertIn("MinecraftLaunchProgressDialog", instances_page)
        self.assertNotIn("QProgressDialog", instances_page)
        self.assertIn("return base + DARK_STYLE", styles)
        self.assertIn('"Лесная глубина"', styles)
        self.assertIn("CUSTOM_SKIN_LOADER_PROJECT = \"customskinloader\"", custom_skin_loader)
        self.assertIn('"type": "LocalSkin"', custom_skin_loader)
        self.assertIn("api.modrinth.com", custom_skin_loader)
        self.assertIn("def mouseMoveEvent", skin_preview)
        self.assertIn("def wheelEvent", skin_preview)
        self.assertIn("def _visible_faces_for_box", skin_preview)
        self.assertIn("def _project_point", skin_preview)
        self.assertIn("def _transform_vector", skin_preview)
        self.assertIn("sorted(faces, key=lambda item: item[\"depth\"])", skin_preview)

    def test_discord_presence_is_packaged_and_configurable(self) -> None:
        settings_page = read_text(ROOT / "ui" / "pages" / "settings_page.py")
        one_file_spec = read_text(ROOT / "build" / "NexusLauncher-OneFile.spec")
        portable_spec = read_text(ROOT / "build" / "NexusLauncher-Portable.spec")

        self.assertIn("Вставь Discord Application Client ID", settings_page)
        self.assertIn("self.discord_client_id_input.text().strip()", settings_page)
        self.assertIn("setClearButtonEnabled(True)", settings_page)
        self.assertNotIn("self.discord_client_id_input.setReadOnly(True)", settings_page)
        self.assertIn('"pypresence"', one_file_spec)
        self.assertIn('"pypresence"', portable_spec)

    def test_ely_by_oauth_is_launch_ready(self) -> None:
        ely_auth = read_text(ROOT / "auth" / "ely_auth.py")
        oauth_config = read_text(ROOT / "auth" / "oauth_config.py")
        launcher = read_text(ROOT / "core" / "launcher.py")

        self.assertIn('DEFAULT_ELY_CLIENT_ID = "nexus-launcher"', oauth_config)
        self.assertIn("def ely_is_public_client", oauth_config)
        self.assertIn("get_ely_client_id() and get_ely_redirect_uri()", oauth_config)
        self.assertNotIn("get_ely_client_secret() and get_ely_redirect_uri()", oauth_config)
        self.assertIn("NEXUS_ELY_CLIENT_ID", ely_auth)
        self.assertIn("NEXUS_ELY_REDIRECT_URI", ely_auth)
        self.assertNotIn("NEXUS_oauth_config", ely_auth)
        self.assertIn("minecraft_server_session", ely_auth)
        self.assertIn("offline_access", ely_auth)
        self.assertIn("code_challenge_method", ely_auth)
        self.assertIn("code_verifier", ely_auth)
        self.assertIn("def _token_request_data", ely_auth)
        self.assertIn("def refresh_access_token", ely_auth)
        self.assertIn('"grant_type": "refresh_token"', ely_auth)
        self.assertIn("expires_at", ely_auth)
        self.assertIn("ensure_fresh_launch_token", launcher)

    def test_site_script_uses_local_release_metadata_fallback(self) -> None:
        script = read_text(WEBSITE / "script.js")

        self.assertIn('fetch("release.json"', script)
        self.assertIn("applyReleaseMetadata", script)

    def test_release_generator_updates_script_fallbacks(self) -> None:
        generator = read_text(ROOT / "tools" / "generate_website_release.py")

        self.assertIn('WEBSITE_DIR / "script.js"', generator)
        self.assertIn("fallbackVersion", generator)
        self.assertIn("window.NEXUS_REPO", generator)

    def test_website_build_script_uses_release_metadata_flow(self) -> None:
        script = read_text(ROOT / "scripts" / "build-website.ps1")

        self.assertIn("generate_website_release.py", script)
        self.assertNotIn("NexusLauncher_Windows.zip", script)
        self.assertNotIn("'version': '0.5.0'", script)

    def test_default_repo_normalization_matches_app_info(self) -> None:
        with patch.dict(
            os.environ,
            {
                "GITHUB_REPOSITORY_OWNER": GITHUB_OWNER,
                "GITHUB_REPOSITORY": REPO,
            },
        ):
            self.assertEqual(normalize_repo(None), REPO)
        self.assertEqual(normalize_repo("owner/example"), "owner/example")


if __name__ == "__main__":
    unittest.main()
