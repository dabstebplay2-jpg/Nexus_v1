# Nexus Launcher — Installer + Desktop Shortcut

Сделано:
- добавлен Inno Setup installer script:
  - `installer/NexusLauncher.iss`
- добавлен локальный билд установщика:
  - `scripts/build_installer.ps1`
- добавлен полный билд релиза:
  - `scripts/build_full_release.ps1`
- GitHub Actions release workflow теперь:
  - собирает обычный exe;
  - собирает portable zip;
  - устанавливает Inno Setup;
  - собирает setup installer;
  - публикует все файлы в GitHub Release.
- установщик создаёт:
  - shortcut в Start Menu;
  - shortcut на Desktop через task `desktopicon`;
  - uninstall entry;
  - post-install launch checkbox.
- установка идёт в `%LOCALAPPDATA%\Programs\Nexus Launcher`, чтобы не требовать админ-права.
- пользовательские данные в `%APPDATA%\NexusLauncher` при удалении не стираются.
- добавлен `INSTALLER_GUIDE_RU.md`.

Проверка:
- добавленные файлы подготовлены к локальной сборке и GitHub Actions.
