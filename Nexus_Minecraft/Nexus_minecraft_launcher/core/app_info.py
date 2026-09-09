import os

APP_NAME = "Nexus Launcher"
APP_VERSION = "0.7.13"
APP_CODENAME = "Modpack Direct Install"

APP_FULL_NAME = f"{APP_NAME} {APP_VERSION}"
USER_AGENT = f"NexusLauncher/{APP_VERSION}"

# Настрой под свой будущий GitHub repo перед первым релизом.
# Можно не менять код, а задать переменные окружения при сборке:
# NEXUS_GITHUB_OWNER и NEXUS_GITHUB_REPO.
GITHUB_OWNER = os.environ.get("NEXUS_GITHUB_OWNER", "dabstebplay2-jpg")
GITHUB_REPO = os.environ.get("NEXUS_GITHUB_REPO", "Nexus_mincraft_laucher")
GITHUB_LATEST_RELEASE_API = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"
GITHUB_LATEST_RELEASE_PAGE = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"

WINDOWS_EXE_ASSET_PREFIX = "NexusLauncher"
PORTABLE_ASSET_KEYWORD = "portable"

WEBSITE_RELEASE_JSON_URL = os.environ.get(
    "NEXUS_WEBSITE_RELEASE_JSON_URL",
    f"https://{GITHUB_OWNER}.github.io/{GITHUB_REPO}/release.json",
)
