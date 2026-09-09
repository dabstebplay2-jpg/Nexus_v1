# Nexus Launcher — EXE / GitHub / Auto Update Ready

Сделано в этом этапе:
- подготовлена сборка настоящего Windows `.exe` через PyInstaller;
- добавлен `assets/nexus.ico`;
- добавлены PyInstaller spec-файлы:
  - `build/NexusLauncher-OneFile.spec`
  - `build/NexusLauncher-Portable.spec`
- добавлены PowerShell build-скрипты:
  - `scripts/build_exe.ps1`
  - `scripts/build_release.ps1`
  - `scripts/init_github_repo.ps1`
- добавлены GitHub Actions:
  - `.github/workflows/ci.yml`
  - `.github/workflows/release.yml`
- при push тега `v*` GitHub Actions собирает:
  - `NexusLauncher-<version>-win-x64.exe`
  - `NexusLauncher-<version>-win-x64-portable.zip`
  - SHA256-файлы;
- добавлена публикация assets в GitHub Release;
- обновлён `core/app_info.py`:
  - версия поднята до `0.7.0`;
  - добавлены `GITHUB_OWNER` и `GITHUB_REPO`;
- обновлён `core/updater.py`:
  - проверка `/releases/latest`;
  - выбор preferred asset;
  - скачивание обновления;
  - SHA256;
  - открытие скачанного файла;
- добавлена панель `Настройки → Обновления Nexus`;
- добавлена проверка обновлений при запуске;
- добавлен подробный файл `GITHUB_EXE_RELEASE_GUIDE_RU.md`;
- обновлён `.gitignore`.

Проверка:
- Python-файлов: 64;
- py_compile ошибок: 0;
- YAML workflow-файлы успешно парсятся.

Важно:
- В этой среде Linux нельзя корректно собрать настоящий Windows exe так же надёжно, как на Windows.
- Поэтому проект подготовлен под локальную сборку на Windows и автоматическую сборку через GitHub Actions `windows-latest`.
