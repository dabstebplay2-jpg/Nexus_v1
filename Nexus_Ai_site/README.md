# Nexus

Монорепозиторий: сайт (Vercel), облачный API (Render), локальный прокси IDE.

| Папка | Назначение | Деплой |
|-------|------------|--------|
| [`frontend/`](frontend/) | React/Vite — чат, тарифы, настройки | [Vercel](https://nexus-zeta-ruby-12.vercel.app) |
| [`nexus-cloud-server/`](nexus-cloud-server/) | FastAPI — auth, billing, Polza, админка | [Render](https://nexus-cloud-bxcc.onrender.com) |
| [`nexus-desktop/`](nexus-desktop/) | Десктопная сборка IDE | локально |
| [`backend/`](backend/) | Локальный прокси для IDE (не в проде) | — |

**Прод:** настраивается после деплоя (см. [`docs/SOLO_HOSTING_RU.md`](docs/SOLO_HOSTING_RU.md))

## Локальный запуск (Windows)

Требования: Node.js 22.12+ и Python 3.10+.

Один CLI для зависимостей, старта сервисов и диагностики:

```powershell
git clone https://github.com/dabstebplay2-jpg/Nexus.git
cd Nexus

.\scripts\nexus.ps1 install    # pip + npm (один раз)
.\scripts\nexus.ps1 start      # cloud :8080 + backend :8000 + frontend :5173
```

Или двойной клик / из cmd:

```bat
nexus.bat install
nexus.bat start
nexus.bat stop
nexus.bat diagnose
nexus.bat admin
```

Отдельные сервисы:

```powershell
.\scripts\nexus.ps1 start -Cloud      # только API :8080
.\scripts\nexus.ps1 start -Backend    # только прокси :8000
.\scripts\nexus.ps1 start -Frontend   # только UI :5173
```

Сайт: http://localhost:5173  
Локальная админка: `nexus.bat admin` → http://127.0.0.1:8790/local-admin/

## Git workflow

1. Ветка `feature/...` от `main`
2. PR в `main` (даже вдвоём — для ревью и истории)
3. Один push — и фронт, и API в одном PR, если фича сквозная

## Деплой

- **Vercel:** Root Directory = `frontend` (см. корневой `vercel.json`)
- **Render:** `rootDir: nexus-cloud-server` (см. `render.yaml`)

Подробнее: [`nexus-cloud-server/docs/DEPLOYMENT_RU.md`](nexus-cloud-server/docs/DEPLOYMENT_RU.md)

## Секреты

Не коммитить: `.env`, `discord-*.local.json`, ключи Polza/ЮKassa. Шаблоны — `*.env.example`.
