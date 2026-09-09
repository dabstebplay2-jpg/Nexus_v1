# Nexus Launcher — Tracked Runtime Hook Fix 0.7.10

Проблема в GitHub Actions:
- `build/pyi_runtime_hook.py` отсутствовал в репозитории во время сборки.
- Причина вероятнее всего в том, что `build/` обычно игнорируется `.gitignore`, поэтому runtime hook не попал в commit.
- PyInstaller падал на этапе:
  `FileNotFoundError: build\pyi_runtime_hook.py`

Исправлено:
- версия поднята до `0.7.10`;
- runtime hook перенесён из `build/pyi_runtime_hook.py` в `tools/pyi_runtime_hook.py`;
- spec-файлы теперь ссылаются на tracked path:
  `tools/pyi_runtime_hook.py`;
- в `scripts/build_release.ps1` добавлена preflight-проверка runtime hook;
- сборка больше не должна падать из-за отсутствующего файла hook.

Что делать:
1. Скопировать фикс.
2. Проверить, что `tools/pyi_runtime_hook.py` виден в `git status --short`.
3. Закоммитить.
4. Создать тег `v0.7.10`.
5. Не пересобирать `v0.7.9`, потому что он уже упал.
