# Nexus Launcher — EXE, GitHub и автообновления

## Что уже подготовлено

В проект добавлено:

- `build/Nexus_mincraft_laucher-OneFile.spec` — сборка одного `Nexus_mincraft_laucher.exe`;
- `build/Nexus_mincraft_laucher-Portable.spec` — portable-папка `dist/Nexus_mincraft_laucher/`;
- `scripts/build_exe.ps1` — локальная сборка EXE;
- `scripts/build_release.ps1` — сборка release-артефактов;
- `.github/workflows/ci.yml` — проверка Python-файлов;
- `.github/workflows/release.yml` — GitHub Actions сборка Windows EXE и публикация релиза;
- `core/updater.py` — проверка GitHub Releases и скачивание обновления;
- панель `Настройки → Обновления Nexus`;
- проверка новой версии при запуске лаунчера.

## Перед публикацией на GitHub

Открой `core/app_info.py` и поставь свои данные:

```python
GITHUB_OWNER = os.environ.get("NEXUS_GITHUB_OWNER", "dabstebplay2-jpg")
GITHUB_REPO = os.environ.get("NEXUS_GITHUB_REPO", "Nexus_mincraft_laucher")
```

Или не меняй код, а GitHub Actions сам подставит:

```yaml
NEXUS_GITHUB_OWNER: ${{ github.repository_owner }}
NEXUS_GITHUB_REPO: ${{ github.event.repository.name }}
```

## Локальная сборка EXE на Windows

В PowerShell:

```powershell
cd C:\Nexus_minecraft_launcher
.\scripts\build_release.ps1
```

После сборки появится папка:

```text
release\
```

В ней будут:

```text
Nexus_mincraft_laucher-0.7.0-win-x64.exe
Nexus_mincraft_laucher-0.7.0-win-x64-portable.zip
*.sha256
```

## Публикация на GitHub

```powershell
cd C:\Nexus_minecraft_launcher

git init
git add .
git commit -m "Initial Nexus Launcher release-ready build"

git branch -M main
git remote add origin https://github.com/dabstebplay2-jpg/Nexus_mincraft_laucher.git
git push -u origin main
```

## Создание релиза

```powershell
git tag v0.7.0
git push origin v0.7.0
```

После push тега GitHub Actions автоматически:

1. установит Python;
2. поставит зависимости;
3. соберёт EXE;
4. соберёт portable ZIP;
5. создаст GitHub Release;
6. прикрепит `.exe`, `.zip`, `.sha256`.

## Как работает автообновление

Nexus обращается к:

```text
https://api.github.com/repos/<owner>/<repo>/releases/latest
```

Если версия релиза выше, чем `APP_VERSION`, лаунчер показывает уведомление.

Потом можно скачать asset в:

```text
%APPDATA%\Nexus_mincraft_laucher\data\updates
```

Если скачан `.exe`, Nexus предложит открыть его.
Если скачан `.zip`, пользователь распаковывает portable-версию.

## Важное ограничение

Полностью тихое самообновление running `.exe` сложнее, потому что Windows не даёт заменить запущенный exe-файл. Поэтому текущая безопасная схема такая:

1. лаунчер проверяет GitHub;
2. скачивает новый `.exe` или `.zip`;
3. предлагает открыть файл;
4. пользователь закрывает Nexus и запускает обновление.

Следующий этап — отдельный `NexusUpdater.exe`, который будет закрывать лаунчер, заменять файлы и запускать новую версию автоматически.


## Установщик с ярлыком на рабочий стол

Добавлена сборка установщика через Inno Setup:

```text
NexusLauncherSetup-<version>-win-x64.exe
```

Установщик:
- ставит лаунчер в `%LOCALAPPDATA%\Programs\Nexus Launcher`;
- создаёт ярлык в меню Пуск;
- предлагает создать ярлык на рабочем столе;
- предлагает запустить Nexus после установки.

Локальная сборка полного релиза:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_full_release.ps1
```

Только установщик:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_installer.ps1 -SkipReleaseBuild
```
