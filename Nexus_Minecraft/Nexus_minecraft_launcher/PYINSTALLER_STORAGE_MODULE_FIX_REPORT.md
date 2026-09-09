# Nexus Launcher — PyInstaller storage module fix 0.7.8

Проблема:
- скачанный EXE/Setup запускался с ошибкой:
  `ModuleNotFoundError: No module named 'storage'`
- ошибка возникала уже при импорте `core.logger`, потому что `core.logger` импортирует `storage.paths`.

Причина:
- после оптимизации PyInstaller spec-файлы явно собирали только часть hiddenimports;
- PyInstaller пропустил локальный пакет `storage`.

Что исправлено:
- версия поднята до `0.7.8`;
- в `build/NexusLauncher-OneFile.spec` и `build/NexusLauncher-Portable.spec` добавлен сбор всех локальных модулей:
  - app
  - auth
  - core
  - mods
  - storage
  - ui
  - tools
- release workflow оставлен без деплоя Pages из tag, чтобы не ловить environment protection error;
- сайт и release.json обновлены на `0.7.8`.

Что делать:
- закоммитить фикс;
- создать tag `v0.7.8`;
- дождаться зелёного Build Windows EXE and Release;
- скачать `NexusLauncherSetup-0.7.8-win-x64.exe`;
- старый `0.7.7` считать сломанным и не использовать.
