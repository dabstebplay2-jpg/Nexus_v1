# Nexus Launcher — Build Spec Fix

Исправлено:
- PyInstaller spec-файлы больше не ищут `build/main.py`;
- `main.py` передаётся в Analysis абсолютным путём от корня проекта;
- build-скрипты теперь сразу останавливаются, если PyInstaller упал;
- добавлена проверка, что `dist/NexusLauncher.exe` реально создан;
- версия поднята до `0.7.1`, потому что тег `v0.7.0` уже был отправлен до фикса;
- `.gitignore` теперь полностью игнорирует `data/`, `data_backup_before_*/`, `dist/`, `release/`, `.venv/`.

Причина ошибки:
PyInstaller запускал spec из папки `build`, поэтому относительный путь `main.py` превращался в `build/main.py`.
