# Nexus Launcher — установщик и ярлык на рабочем столе

Теперь кроме обычного `.exe` можно собрать нормальный установщик:

```text
NexusLauncherSetup-0.7.1-win-x64.exe
```

Что делает установщик:

- устанавливает Nexus Launcher в:

```text
%LOCALAPPDATA%\Programs\Nexus Launcher
```

- добавляет пункт в меню Пуск;
- создаёт ярлык на рабочем столе, если галочка включена;
- после установки предлагает сразу запустить лаунчер;
- при удалении оставляет пользовательские данные в:

```text
%APPDATA%\NexusLauncher
```

Это сделано специально, чтобы не удалить сборки Minecraft, аккаунты, моды, логи и настройки.

## Что нужно установить для локальной сборки установщика

Нужен Inno Setup 6.

Можно поставить через PowerShell:

```powershell
winget install JRSoftware.InnoSetup
```

или через Chocolatey:

```powershell
choco install innosetup -y
```

## Сборка полного релиза

```powershell
cd C:\Nexus_minecraft_launcher
powershell -ExecutionPolicy Bypass -File .\scripts\build_full_release.ps1
```

После сборки файлы будут в:

```text
C:\Nexus_minecraft_launcher\release
```

Ожидаемые файлы:

```text
NexusLauncher-0.7.1-win-x64.exe
NexusLauncher-0.7.1-win-x64-portable.zip
NexusLauncherSetup-0.7.1-win-x64.exe
*.sha256
```

## Сборка только установщика

Если обычный exe уже собран:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_installer.ps1 -SkipReleaseBuild
```

## GitHub Actions

Workflow `.github/workflows/release.yml` теперь сам:

1. собирает обычный `.exe`;
2. собирает portable `.zip`;
3. ставит Inno Setup;
4. собирает `NexusLauncherSetup-<version>-win-x64.exe`;
5. прикрепляет всё к GitHub Release.
