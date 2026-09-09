from __future__ import annotations

import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from mods.modpack_importer import ModpackImportError, ModpackImporter


class FakeResponse:
    def __init__(self, payload: bytes):
        self.payload = payload
        self.headers = {"content-length": str(len(payload))}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def raise_for_status(self):
        return None

    def iter_content(self, chunk_size: int):
        yield self.payload


class ModpackSecurityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.importer = ModpackImporter()

    def test_safe_target_path_accepts_normal_relative_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "instance" / ".minecraft"
            target = self.importer.safe_target_path(base, "mods/example.jar")

            self.assertEqual(target, (base / "mods" / "example.jar").resolve())

    def test_safe_target_path_rejects_traversal_and_absolute_paths(self) -> None:
        bad_paths = [
            "",
            "../evil.jar",
            "mods/../../evil.jar",
            "/absolute/evil.jar",
            "\\absolute\\evil.jar",
            "C:/Windows/evil.dll",
            "C:\\Windows\\evil.dll",
            "\\\\server\\share\\evil.jar",
            "mods\\..\\evil.jar",
        ]

        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "instance" / ".minecraft"
            for bad_path in bad_paths:
                with self.subTest(path=bad_path):
                    with self.assertRaises(ModpackImportError):
                        self.importer.safe_target_path(base, bad_path)

    def test_copy_overrides_rejects_unsafe_member_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            archive_path = Path(tmp) / "pack.mrpack"
            minecraft_dir = Path(tmp) / "instance" / ".minecraft"

            with zipfile.ZipFile(archive_path, "w") as package:
                package.writestr("overrides/../evil.txt", "nope")

            with zipfile.ZipFile(archive_path, "r") as package:
                with self.assertRaises(ModpackImportError):
                    self.importer.copy_overrides(package, minecraft_dir)

            self.assertFalse((Path(tmp) / "instance" / "evil.txt").exists())

    def test_download_file_requires_sha512_and_allowed_https_host(self) -> None:
        sha512 = hashlib.sha512(b"payload").hexdigest()
        missing_hash = {
            "path": "mods/example.jar",
            "downloads": ["https://cdn.modrinth.com/data/example.jar"],
        }
        bad_host = {
            "path": "mods/example.jar",
            "downloads": ["https://example.com/example.jar"],
            "hashes": {"sha512": sha512},
        }
        bad_scheme = {
            "path": "mods/example.jar",
            "downloads": ["http://cdn.modrinth.com/data/example.jar"],
            "hashes": {"sha512": sha512},
        }

        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / ".minecraft"
            for file_entry in (missing_hash, bad_host, bad_scheme):
                with self.subTest(file_entry=file_entry):
                    with self.assertRaises(ModpackImportError):
                        self.importer.download_files([file_entry], base)

    def test_download_one_removes_file_when_sha512_mismatches(self) -> None:
        payload = b"payload"
        bad_sha512 = hashlib.sha512(b"other").hexdigest()
        file_entry = {"hashes": {"sha512": bad_sha512}}

        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "mods" / "example.jar"
            target.parent.mkdir(parents=True)

            with patch("mods.modpack_importer.requests.get", return_value=FakeResponse(payload)):
                with self.assertRaises(ModpackImportError):
                    self.importer.download_one("https://cdn.modrinth.com/data/example.jar", target, file_entry)

            self.assertFalse(target.exists())


class ModUpdateWorkerSignalTests(unittest.TestCase):
    def test_mod_all_update_worker_does_not_shadow_qthread_finished(self) -> None:
        from ui.pages.instance_detail_page import _ModAllUpdateWorker

        self.assertNotIn("finished", _ModAllUpdateWorker.__dict__)
        self.assertIn("completed", _ModAllUpdateWorker.__dict__)

    def test_instance_detail_page_uses_completed_for_results_and_finished_for_cleanup(self) -> None:
        source = Path("ui/pages/instance_detail_page.py").read_text(encoding="utf-8")

        self.assertIn("worker.completed.connect(self._on_mod_all_updated)", source)
        self.assertIn("worker.finished.connect(worker.deleteLater)", source)
        self.assertIn("self._mod_all_update_worker and self._mod_all_update_worker.isRunning()", source)
        self.assertIn("self._mod_update_worker and self._mod_update_worker.isRunning()", source)
        self.assertNotIn(".finished.connect(self._on_mod_all_updated)", source)


if __name__ == "__main__":
    unittest.main()
