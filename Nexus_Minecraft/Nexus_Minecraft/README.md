# Nexus Launcher

**Nexus Launcher** — открытый desktop-лаунчер для Minecraft на Python/PySide6 для Windows. Он управляет отдельными сборками, версиями Minecraft, loader-ами, Java/RAM, контентом Modrinth, аккаунтами, загрузками, обновлениями и релизным сайтом.

- **Репозиторий:** https://github.com/dabstebplay2-jpg/Nexus_mincraft_laucher
- **Сайт:** https://dabstebplay2-jpg.github.io/Nexus_mincraft_laucher/
- **Последний релиз:** https://github.com/dabstebplay2-jpg/Nexus_mincraft_laucher/releases/latest
- **Лицензия:** MIT — проект можно свободно форкать, изменять и распространять

Текущая версия задаётся в `core/app_info.py` и автоматически синхронизируется с сайтом через `tools/generate_website_release.py`.

## Участие в разработке

Проект полностью открыт. Чтобы начать:

1. Сделайте [fork](https://github.com/dabstebplay2-jpg/Nexus_mincraft_laucher/fork).
2. Клонируйте репозиторий и установите зависимости (см. раздел «Разработка» ниже).
3. Внесите изменения и откройте Pull Request.

Подробнее: [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Возможности

- Создание и запуск отдельных Minecraft-сборок.
- Поддержка Vanilla, Fabric, Forge, NeoForge и Quilt через общий loader manager.
- Поиск и установка модов, шейдеров, ресурспаков и модпаков из Modrinth.
- Импорт `.mrpack`, история загрузок и локальная библиотека контента.
- Настройки Java, RAM, разрешения окна и папок данных.
- Offline, Microsoft и Ely.by аккаунты.
- Discord Rich Presence.
- Проверка обновлений лаунчера через GitHub Releases и `website/release.json`.
- Статический сайт для скачивания installer и portable ZIP.

---

## Структура

```text
C:\Nexus
├─ app/                 # Главное окно и маршрутизация страниц
├─ auth/                # Аккаунты и авторизация
├─ core/                # Запуск Minecraft, updater, Java, loader-ы, настройки
├─ mods/                # Modrinth, установка контента, совместимость
├─ storage/             # Пути и JSON-хранилище
├─ ui/                  # PySide6-компоненты, страницы и стили
├─ website/             # Продакшен-сайт GitHub Pages
├─ website-next/        # Черновой React/Vite scaffold, не используется в деплое
├─ installer/           # Inno Setup installer
├─ scripts/             # Build/release PowerShell scripts
├─ tools/               # Диагностика, QA и генерация metadata
├─ tests/               # Базовые unittest-проверки проекта
├─ main.py              # Точка входа GUI
└─ requirements.txt     # Python-зависимости
```

---

## Требования

- Windows 10/11.
- Python 3.12+.
- Интернет для загрузки Minecraft, loader-ов, модов и релизов.
- Java 17+ для старых версий Minecraft, Java 21+ для новых версий.
- Inno Setup требуется только для сборки installer.

---

## Разработка

```powershell
cd C:\Nexus
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Запуск лаунчера:

```powershell
.\.venv\Scripts\python.exe main.py
```

Диагностика окружения:

```powershell
.\.venv\Scripts\python.exe main.py --diagnose
.\.venv\Scripts\python.exe tools\diagnose_nexus.py
```

Локальные данные при запуске из Python хранятся в проекте: `data/`, `instances/`, `logs/`. Собранный `.exe` использует `%APPDATA%\NexusLauncher`.

---

## Проверки

Перед релизом запускай:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
.\.venv\Scripts\python.exe tools\deep_qa.py
.\.venv\Scripts\python.exe tools\full_audit.py
```

`deep_qa.py` проверяет обязательные файлы, синтаксис Python, `.gitignore`, `core/app_info.py`, release metadata сайта и базовый full audit без UI smoke. `full_audit.py` дополнительно проверяет импорты, темы, loader API, локальные сборки и headless UI.

CI на GitHub Actions использует Python 3.12, устанавливает `requirements.txt`, компилирует Python-файлы, запускает `unittest` и `deep_qa.py`.

---

## Сайт

Продакшен-сайт находится в `website/` и деплоится как статический GitHub Pages artifact. Активные ассеты:

- `website/index.html`
- `website/styles.css`
- `website/script.js`
- `website/release.json`
- `website/downloads/release.json`

Локальный preview:

```powershell
cd C:\Nexus\website
..\.venv\Scripts\python.exe -m http.server 8080
```

Обновить release metadata:

```powershell
cd C:\Nexus
.\.venv\Scripts\python.exe tools\generate_website_release.py --version 1.0.2 --repo dabstebplay2-jpg/Nexus_mincraft_laucher
```

`website-next/` пока остаётся черновиком будущей React-миграции. Не переключай Pages на него, пока Vite-проект не будет доведён до полноценной сборки и проверки.

---

## Сборка релиза

Основные команды:

```powershell
cd C:\Nexus
.\scripts\build_release.ps1
.\scripts\build_installer.ps1
.\scripts\build_full_release.ps1
```

Результаты попадают в `release/`: installer, portable ZIP и SHA256-файлы. Публикация GitHub Release выполняется через `scripts\publish_release.ps1` или tag workflow `v*`.

---

## Частые проблемы

### Сборки не видны в `.exe`

Python-запуск и `.exe` используют разные хранилища. Проверь `%APPDATA%\NexusLauncher\data\instances.json`.

### Моды не устанавливаются

Проверь выбранную сборку, loader, совместимость версии Minecraft, интернет и `logs/latest.log`.

### Minecraft не запускается из-за Java

Проверь `java -version`, выбранный путь Java в настройках и `logs/latest.log`.

### Сайт показывает старую ссылку

Перегенерируй release metadata через `tools\generate_website_release.py`, проверь `website/release.json` и убедись, что GitHub Release содержит файлы с текущей версией.

---

## Важно

Nexus Launcher — неофициальный open-source проект под лицензией MIT. Он не связан с Mojang, Microsoft, Fabric, Forge, NeoForge, Quilt, Modrinth или Discord. Minecraft является товарным знаком Mojang/Microsoft.

Исходный код, CI, сайт, скрипты сборки и документация находятся в этом репозитории. Собранные `.exe` и installer публикуются в GitHub Releases, а не хранятся в git — это сделано специально, чтобы репозиторий оставался лёгким для клонирования и форков.
