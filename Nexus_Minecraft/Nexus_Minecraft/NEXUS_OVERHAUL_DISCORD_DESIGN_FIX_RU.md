# Nexus Overhaul: Discord + Catalog + Design + Taskbar Icon

Что исправлено и добавлено:

## Discord Rich Presence
- Добавлен модуль `core/discord_presence.py`.
- В настройках появилась панель `Discord Rich Presence`.
- Можно включить Discord-статус и указать Discord Application Client ID.
- Когда открыт лаунчер: Discord показывает раздел Nexus.
- Когда запускается Minecraft: Discord показывает сборку, версию Minecraft и loader.
- Когда Minecraft закрывается: статус возвращается к лаунчеру.
- Если Discord закрыт или Client ID не указан, Nexus не ломается.

Важно:
Discord Rich Presence требует Discord Application Client ID. Его надо создать/скопировать в Discord Developer Portal.

## Иконка на панели задач Windows
- Добавлен `core/windows_app_id.py`.
- При старте Nexus вызывает Windows AppUserModelID, чтобы приложение отображалось как Nexus Launcher, а не как python.exe.
- Также выставляются `ApplicationName`, `ApplicationDisplayName`, `OrganizationName`.

## Каталог модов
- Каталог/фильтры теперь можно сворачивать кнопкой `Показать каталог / Скрыть каталог`.
- По умолчанию каталог берёт состояние из настроек.
- Большие карточки статистики из каталога убраны, чтобы вкладка «Моды» стала компактнее.
- `Тип проекта` убран из фильтров: теперь раздел выбирается только верхними вкладками.
- Метка типа проекта убрана из карточки проекта.
- Карточки проектов стали чуть компактнее.

## Дизайн
- Добавлен финальный слой QSS-полировки `NEXUS_OVERHAUL_POLISH_STYLE`.
- Немного уплотнены карточки, вкладки, панель фильтров и нижняя строка.
- Светлая тема по-прежнему не ломает читаемость, так как ранее была отключена в пользу dark/AMOLED.
