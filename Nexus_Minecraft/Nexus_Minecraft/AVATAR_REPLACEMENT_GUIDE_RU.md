# Как быстро менять аватарку Nexus Launcher

## Что уже подключено

Новая аватарка проекта лежит в нескольких местах:

- `assets/nexus.ico` — иконка EXE и установщика.
- `assets/nexus.png` — большая PNG-версия.
- `assets/icons/nexus.png` — логотип в левом меню лаунчера.
- `website/assets/logo.png` — логотип сайта.
- `website/assets/favicon.png` — favicon сайта.
- `website/assets/og-cover.png` — картинка для превью сайта.

Код уже обновлён:
- `ui/icon_utils.py` теперь сначала ищет PNG/ICO, потом SVG.
- `main.py` ставит иконку приложения.
- `app/window.py` ставит иконку главного окна.
- сайт использует PNG-логотип.

## Быстрая замена аватарки

Положи новую картинку, например:

```text
C:\Users\dobrynya\Downloads\new_avatar.png
```

Потом в PowerShell или CMD из папки проекта:

```bat
cd C:\Nexus\Nexus_mincraft_laucher-git
python -m pip install pillow
python tools\replace_project_avatar.py C:\Users\dobrynya\Downloads\new_avatar.png
```

После этого проверь лаунчер:

```bat
.\.venv\Scripts\python.exe main.py
```

Если всё нормально — собери EXE:

```bat
powershell -ExecutionPolicy Bypass -File .\scripts\build_release.ps1
```

Если нужен установщик:

```bat
powershell -ExecutionPolicy Bypass -File .\scripts\build_installer.ps1 -SkipReleaseBuild
```

## Что коммитить

```bat
git add assets website ui/icon_utils.py main.py app/window.py tools/replace_project_avatar.py AVATAR_REPLACEMENT_GUIDE_RU.md
git commit -m "Update Nexus project avatar"
git push
```

## Важно

Для лучшего результата используй квадратную картинку 1024x1024 или 512x512.
