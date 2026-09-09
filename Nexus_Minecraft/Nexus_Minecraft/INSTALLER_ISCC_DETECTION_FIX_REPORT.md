# Nexus Launcher — Inno Setup ISCC Detection Fix

Проблема:
- `winget install JRSoftware.InnoSetup` сообщал, что Inno Setup уже установлен.
- Но `scripts/build_installer.ps1` не находил `ISCC.exe`.
- Из-за этого обычный EXE и portable ZIP собирались, но `NexusLauncherSetup-0.7.2-win-x64.exe` не создавался.

Исправлено:
- `scripts/build_installer.ps1` теперь ищет `ISCC.exe`:
  - через `Get-Command`;
  - в Program Files;
  - в Program Files (x86);
  - в LocalAppData;
  - в AppData;
  - через registry uninstall keys;
  - через limited recursive search по известным папкам.
- Добавлен параметр `-ISCCPath`, чтобы можно было вручную указать путь к `ISCC.exe`.
- `scripts/build_full_release.ps1` теперь корректно останавливается, если сборка installer упала, а не пишет ложное `Full release ready`.

Команда:
`powershell -ExecutionPolicy Bypass -File .\scripts\build_installer.ps1 -SkipReleaseBuild`

Если не найдено:
`powershell -ExecutionPolicy Bypass -File .\scripts\build_installer.ps1 -SkipReleaseBuild -ISCCPath "C:\Path\To\ISCC.exe"`
