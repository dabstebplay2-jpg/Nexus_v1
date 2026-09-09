import logging
import time

import minecraft_launcher_lib


logger = logging.getLogger(__name__)


def _retry(func, max_attempts=3, delay=1.0):
    last_error = None
    for attempt in range(max_attempts):
        try:
            return func()
        except Exception as e:
            last_error = e
            logger.warning("Attempt %d/%d failed: %s", attempt + 1, max_attempts, e)
            if attempt < max_attempts - 1:
                time.sleep(delay * (attempt + 1))
    raise last_error


class VersionManager:
    def get_all_versions(self):
        return _retry(lambda: minecraft_launcher_lib.utils.get_version_list())

    def get_release_versions(self):
        versions = self.get_all_versions()

        release_versions = [
            version["id"]
            for version in versions
            if version.get("type") == "release"
        ]

        return release_versions

    def get_snapshot_versions(self):
        versions = self.get_all_versions()

        snapshot_versions = [
            version["id"]
            for version in versions
            if version.get("type") == "snapshot"
        ]

        return snapshot_versions