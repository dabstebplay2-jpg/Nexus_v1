from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from pathlib import Path

from storage.paths import DATA_DIR

logger = logging.getLogger(__name__)

# ВАЖНО: в приложении создаётся несколько DownloadManager:
# - страница «Загрузки»;
# - поток запуска Minecraft;
# - поток установки модов.
# Раньше каждый экземпляр имел свой RLock и все они писали в один downloads.json,
# из-за чего Windows иногда ловил PermissionError на os.replace(...downloads.json.tmp -> downloads.json).
# Этот lock общий для всего процесса.
_FILE_LOCK = threading.RLock()


class DownloadManager:
    def __init__(self):
        self._lock = _FILE_LOCK
        self.data_dir = DATA_DIR
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.file_path = self.data_dir / "downloads.json"

        if not self.file_path.exists():
            self.save({"tasks": []})

    def _normalize(self, data):
        if not isinstance(data, dict):
            data = {"tasks": []}
        if not isinstance(data.get("tasks"), list):
            data["tasks"] = []
        return data

    def load(self):
        with self._lock:
            for attempt in range(8):
                try:
                    if not self.file_path.exists():
                        return {"tasks": []}
                    data = json.loads(self.file_path.read_text(encoding="utf-8"))
                    return self._normalize(data)
                except (PermissionError, OSError) as error:
                    if attempt >= 7:
                        logger.warning("Failed to read downloads file: %s", error)
                        return {"tasks": []}
                    time.sleep(0.05 * (attempt + 1))
                except Exception as error:
                    logger.warning("Invalid downloads.json, using empty task list: %s", error)
                    return {"tasks": []}

    def save(self, data):
        data = self._normalize(data)

        with self._lock:
            self.data_dir.mkdir(parents=True, exist_ok=True)

            # Уникальный tmp-файл нужен, чтобы два потока/экземпляра не дрались за один
            # downloads.json.tmp. На Windows это частая причина WinError 5.
            tmp = self.data_dir / f"{self.file_path.name}.{os.getpid()}.{threading.get_ident()}.{uuid.uuid4().hex}.tmp"
            payload = json.dumps(data, ensure_ascii=False, indent=2)

            try:
                tmp.write_text(payload, encoding="utf-8")

                last_error = None
                for attempt in range(12):
                    try:
                        os.replace(str(tmp), str(self.file_path))
                        return
                    except (PermissionError, OSError) as error:
                        last_error = error
                        time.sleep(0.06 * (attempt + 1))

                raise last_error or PermissionError(f"Cannot replace {self.file_path}")

            finally:
                try:
                    if tmp.exists():
                        tmp.unlink()
                except Exception:
                    pass

    def list_tasks(self):
        with self._lock:
            return list(self.load().get("tasks", []))

    def add_task(self, title, kind="download", status="Готово", progress=100, state="completed", subtitle=""):
        with self._lock:
            data = self.load()

            task = {
                "id": str(uuid.uuid4()),
                "kind": kind,
                "title": title,
                "subtitle": subtitle,
                "status": status,
                "progress": int(progress),
                "state": state,
                "created_at": int(time.time()),
                "updated_at": int(time.time()),
                "finished_at": int(time.time()) if state != "active" else None,
                "error": None,
            }

            data["tasks"].insert(0, task)
            self.save(data)
            return task

    def clear_all(self):
        with self._lock:
            data = self.load()
            count = len(data.get("tasks", []))
            data["tasks"] = []
            self.save(data)
            return count

    def clear_completed(self):
        with self._lock:
            data = self.load()
            before = len(data.get("tasks", []))
            data["tasks"] = [task for task in data["tasks"] if task.get("state") == "active"]
            self.save(data)
            return before - len(data["tasks"])

    def seed_demo_if_empty(self):
        if self.list_tasks():
            return

        self.add_task(
            title="Центр загрузок подключён",
            kind="system",
            status="Раздел «Загрузки» теперь работает",
            progress=100,
            state="completed",
            subtitle="Nexus Downloads Center",
        )

    @staticmethod
    def time_text(ts):
        if not ts:
            return "—"
        try:
            return time.strftime("%d.%m.%Y %H:%M", time.localtime(int(ts)))
        except Exception:
            return "—"

    def start_task(self, kind, title, subtitle="", total=100, metadata=None):
        with self._lock:
            data = self.load()
            task_id = str(uuid.uuid4())
            task = {
                "id": task_id,
                "kind": kind,
                "title": title,
                "subtitle": subtitle,
                "status": "Начинается...",
                "progress": 0,
                "total": int(total),
                "state": "active",
                "created_at": int(time.time()),
                "updated_at": int(time.time()),
                "finished_at": None,
                "error": None,
                "metadata": metadata or {},
            }
            data["tasks"].insert(0, task)
            self.save(data)
            return task_id

    def update_task(self, task_id, status=None, progress=None, downloaded_bytes=None, total_bytes=None, speed_bps=None):
        if not task_id:
            return None

        with self._lock:
            data = self.load()
            for task in data["tasks"]:
                if task.get("id") == task_id:
                    changed = False

                    if status is not None and task.get("status") != str(status):
                        task["status"] = str(status)
                        changed = True
                    if progress is not None:
                        new_progress = int(progress)
                        if task.get("progress") != new_progress:
                            task["progress"] = new_progress
                            changed = True
                    if downloaded_bytes is not None:
                        new_downloaded = int(downloaded_bytes)
                        if task.get("downloaded_bytes") != new_downloaded:
                            task["downloaded_bytes"] = new_downloaded
                            changed = True
                    if total_bytes is not None:
                        new_total = int(total_bytes)
                        if task.get("total_bytes") != new_total:
                            task["total_bytes"] = new_total
                            changed = True
                    if speed_bps is not None:
                        new_speed = int(speed_bps)
                        if task.get("speed_bps") != new_speed:
                            task["speed_bps"] = new_speed
                            changed = True

                    if changed:
                        task["updated_at"] = int(time.time())
                        self.save(data)

                    return task
            return None

    def finish_task(self, task_id, status="Завершено"):
        if not task_id:
            return None

        with self._lock:
            data = self.load()
            for task in data["tasks"]:
                if task.get("id") == task_id:
                    task["status"] = str(status)
                    task["progress"] = task.get("total", 100)
                    task["state"] = "completed"
                    task["updated_at"] = int(time.time())
                    task["finished_at"] = int(time.time())
                    self.save(data)
                    return task
            return None

    def fail_task(self, task_id, error, status="Ошибка"):
        if not task_id:
            return None

        with self._lock:
            data = self.load()
            for task in data["tasks"]:
                if task.get("id") == task_id:
                    task["status"] = str(status)
                    task["state"] = "failed"
                    task["error"] = str(error)
                    task["updated_at"] = int(time.time())
                    task["finished_at"] = int(time.time())
                    self.save(data)
                    return task
            return None

    @staticmethod
    def icon(kind):
        kind = (kind or "").lower()

        if kind == "minecraft":
            return "▣"
        if kind == "mod":
            return "✥"
        if kind == "java":
            return "☕"
        if kind == "skin":
            return "▧"
        if kind == "system":
            return "✓"

        return "↓"
