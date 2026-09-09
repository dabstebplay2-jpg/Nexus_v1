# Nexus IDE Desktop (Code-OSS + OpenVSX)

Десктопная сборка на базе [VSCodium](https://github.com/VSCodium/vscodium) (Code-OSS) с маркетплейсом **OpenVSX** и встроенными расширениями Nexus.

**Установка для пользователей:** [docs/DESKTOP_INSTALL.md](../docs/DESKTOP_INSTALL.md)  
**Smoke-тест перед релизом:** [docs/DESKTOP_SMOKE_CHECKLIST.md](../docs/DESKTOP_SMOKE_CHECKLIST.md)

## Быстрый старт (Windows)

```powershell
cd nexus-desktop
.\scripts\prepare.ps1
.\scripts\build.ps1
```

Первая сборка: 30–90 минут, ~15 GB на диске (исходники VS Code + node_modules).

## Структура

| Путь | Назначение |
|------|------------|
| `product/product.json` | Брендинг Nexus, OpenVSX gallery, data folder |
| `extensions/nexus-*` | Встроенные расширения (auth, AI, billing, welcome) |
| `scripts/` | Клон VSCodium, патчи, сборка |
| `icons/` | Иконки приложения (замените на финальные `.ico`/`.icns`) |

## OpenVSX

Расширения устанавливаются из [open-vsx.org](https://open-vsx.org) — см. [docs/EXTENSIONS.md](../docs/EXTENSIONS.md).

## Релиз (ZIP для GitHub)

После `build.ps1`:

```powershell
.\scripts\package-release.ps1
```

Тег `desktop-v0.1.0` → CI соберёт Windows и прикрепит `NexusIDE-win32-x64.zip` к Release.

## Облако

По умолчанию API: `https://nexus-cloud-bxcc.onrender.com/v1` (`nexus.cloudUrl` в Settings).  
Локальная разработка: `http://127.0.0.1:8080/v1`.

## AI Chat (расширение nexus-ai)

- SSE-стриминг (`/ai/chat/simple/stream`)
- Контекст активного файла и выделения
- **Nexus: Apply Last AI Code Block** — вставка из ответа
- **Nexus: Search Workspace for AI Context** — локальный поиск без backend :8000
