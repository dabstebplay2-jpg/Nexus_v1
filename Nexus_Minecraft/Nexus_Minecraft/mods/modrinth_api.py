import json
import logging
import time

import requests

try:
    from core.app_info import USER_AGENT
except Exception:
    USER_AGENT = "NexusLauncher/0.6.0"


logger = logging.getLogger(__name__)


def _retry_request(func, max_attempts=3, delay=1.0):
    last_error = None
    for attempt in range(max_attempts):
        try:
            return func()
        except requests.exceptions.Timeout as e:
            last_error = e
            logger.warning("Timeout attempt %d/%d: %s", attempt + 1, max_attempts, e)
            if attempt < max_attempts - 1:
                time.sleep(delay * (attempt + 1))
        except requests.exceptions.ConnectionError as e:
            last_error = e
            logger.warning("Connection error attempt %d/%d: %s", attempt + 1, max_attempts, e)
            if attempt < max_attempts - 1:
                time.sleep(delay * (attempt + 1))
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code in (429, 500, 502, 503, 504):
                last_error = e
                logger.warning("HTTP %d attempt %d/%d", e.response.status_code, attempt + 1, max_attempts)
                if attempt < max_attempts - 1:
                    time.sleep(delay * (attempt + 1) * 2)
            else:
                raise
    raise last_error


class ModrinthAPI:
    BASE_URL = "https://api.modrinth.com/v2"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": USER_AGENT,
        })

    def build_facets(
        self,
        minecraft_version: str | None = None,
        loader: str | None = None,
        project_type: str = "mod",
    ):
        facets = [
            [f"project_type:{project_type}"],
        ]

        if minecraft_version:
            facets.append([f"versions:{minecraft_version}"])

        if loader and loader != "vanilla":
            facets.append([f"categories:{loader}"])

        return json.dumps(facets)

    def search_projects_page(
        self,
        query: str = "",
        minecraft_version: str | None = None,
        loader: str | None = None,
        project_type: str = "mod",
        limit: int = 48,
        offset: int = 0,
        index: str = "downloads",
    ):
        limit = max(1, min(int(limit), 100))
        offset = max(0, int(offset))

        params = {
            "query": query or "",
            "limit": limit,
            "offset": offset,
            "index": index,
            "facets": self.build_facets(
                minecraft_version=minecraft_version,
                loader=loader,
                project_type=project_type,
            ),
        }

        logger.info("Searching Modrinth page: %s", params)

        def _do_search():
            response = self.session.get(
                f"{self.BASE_URL}/search",
                params=params,
                timeout=25,
            )
            response.raise_for_status()
            return response.json()

        data = _retry_request(_do_search)

        return {
            "hits": data.get("hits", []),
            "offset": data.get("offset", offset),
            "limit": data.get("limit", limit),
            "total_hits": data.get("total_hits", 0),
        }

    def search_projects(
        self,
        query: str = "",
        minecraft_version: str | None = None,
        loader: str | None = None,
        project_type: str = "mod",
        limit: int = 48,
        offset: int = 0,
        index: str = "downloads",
    ):
        page = self.search_projects_page(
            query=query,
            minecraft_version=minecraft_version,
            loader=loader,
            project_type=project_type,
            limit=limit,
            offset=offset,
            index=index,
        )

        return page.get("hits", [])

    def get_popular_projects(
        self,
        minecraft_version: str | None = None,
        loader: str | None = None,
        project_type: str = "mod",
        limit: int = 48,
        offset: int = 0,
    ):
        return self.search_projects(
            query="",
            minecraft_version=minecraft_version,
            loader=loader,
            project_type=project_type,
            limit=limit,
            offset=offset,
            index="downloads",
        )

    def get_project(self, project_id_or_slug: str):
        logger.info("Getting Modrinth project: %s", project_id_or_slug)

        def _do_get():
            response = self.session.get(
                f"{self.BASE_URL}/project/{project_id_or_slug}",
                timeout=25,
            )
            response.raise_for_status()
            return response.json()

        return _retry_request(_do_get)

    def get_project_versions(
        self,
        project_id_or_slug: str,
        minecraft_version: str | None = None,
        loader: str | None = None,
    ):
        params = {}

        if minecraft_version:
            params["game_versions"] = json.dumps([minecraft_version])

        if loader and loader != "vanilla":
            params["loaders"] = json.dumps([loader])

        logger.info(
            "Getting Modrinth versions: project=%s params=%s",
            project_id_or_slug,
            params,
        )

        def _do_get_versions():
            response = self.session.get(
                f"{self.BASE_URL}/project/{project_id_or_slug}/version",
                params=params,
                timeout=25,
            )
            response.raise_for_status()
            return response.json()

        return _retry_request(_do_get_versions)

    def get_version(self, version_id: str):
        def _do_get():
            response = self.session.get(
                f"{self.BASE_URL}/version/{version_id}",
                timeout=25,
            )
            response.raise_for_status()
            return response.json()

        return _retry_request(_do_get)