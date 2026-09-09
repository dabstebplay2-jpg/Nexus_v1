# Участие в разработке Nexus Launcher

Спасибо, что хотите помочь проекту. Репозиторий полностью открыт: вы можете форкнуть его, вносить изменения и отправлять pull request.

## Быстрый старт

1. Сделайте fork: https://github.com/dabstebplay2-jpg/Nexus_mincraft_laucher/fork
2. Клонируйте свой fork:

```powershell
git clone https://github.com/<ваш-логин>/Nexus_mincraft_laucher.git
cd Nexus_mincraft_laucher
```

3. Создайте виртуальное окружение и установите зависимости:

```powershell
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

4. Запустите лаунчер:

```powershell
.\.venv\Scripts\python.exe main.py
```

## Перед отправкой PR

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
.\.venv\Scripts\python.exe tools\deep_qa.py
```

CI на GitHub Actions запускает те же проверки автоматически.

## Что можно менять

- UI и страницы: `ui/`, `app/`
- Логика запуска Minecraft: `core/`
- Авторизация: `auth/`
- Modrinth и контент: `mods/`
- Сайт: `website/`
- Сборка и CI: `scripts/`, `.github/workflows/`

## Что не нужно коммитить

- `.venv/`, `__pycache__/`, `build/pyinstaller/`, `dist/`, `release/`
- Локальные данные: `data/`, `logs/`, `instances/`
- Секреты: `.env`, `auth/oauth_config.local.py`, `data/oauth_settings.json`

## Ветки и PR

1. Создайте ветку от `main`: `git checkout -b feature/my-change`
2. Делайте небольшие, понятные коммиты
3. Откройте Pull Request в `main` с описанием изменений и шагами проверки

## Сборка релиза

Для maintainer-ов:

```powershell
.\scripts\build_full_release.ps1
```

Публикация на GitHub Releases выполняется тегом `v*` (например `v1.1.4`).

## Вопросы

Если что-то непонятно — откройте Issue в репозитории с описанием задачи или проблемы.
