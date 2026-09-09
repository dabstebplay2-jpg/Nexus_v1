# Nexus AI

Облачный чат Nexus в боковой панели IDE: стриминг, веб-поиск, режим мышления, агенты и локальный **режим агента** (файлы, терминал, диагностика).

## Требования

- Расширение **Nexus Account** (`nexus.nexus-auth`) — вход тем же аккаунтом, что на сайте.
- Тариф **Hobby** или выше для облачных моделей (Free — IDE без ИИ).

## Быстрый старт

1. **Nexus: Sign In** — Google или код на email.
2. Откройте панель **Nexus → AI Chat**.
3. Выберите модель; при необходимости включите **🌐 Поиск** или **⚡ Агент**.

## Режим агента

Инструменты: `list_dir`, `read_file`, `write_file`, `delete_path`, `search_workspace`, `run_terminal`, `get_diagnostics`. Опасные команды и удаление — с подтверждением.

Настройка `nexus.ai.confirmWrites` — diff перед записью файла.

## Команды

| Команда | Назначение |
|---------|------------|
| `Nexus: Open AI Chat` | Открыть чат |
| `Nexus: Add Selection to AI Chat` | Добавить выделение |
| `Nexus: Apply Last AI Code Block` | Применить последний блок кода |
| `Nexus: Clear AI Chat` | Очистить чат |
| `Nexus: Show AI Extension Info` | Версия и путь расширения |

## Обновление

**Extensions → Install from VSIX…** — файл с [сайта Nexus](https://nexus-zeta-ruby-12.vercel.app/extensions/nexus-ai.vsix) или из релиза Desktop.
