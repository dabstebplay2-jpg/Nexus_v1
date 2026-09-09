# Nexus — монорепозиторий

Единый GitHub: [dabstebplay2-jpg/Nexus](https://github.com/dabstebplay2-jpg/Nexus)

| Папка | Деплой |
|-------|--------|
| `frontend/` | Vercel |
| `nexus-cloud-server/` | Render |
| `backend/` | только локально |
| `nexus-desktop/` | локальная сборка |

## Локальный запуск

```powershell
cd C:\nexus   # или путь к клону
.\scripts\nexus.ps1 install
.\scripts\nexus.ps1 start
```

Коротко: `nexus.bat start` / `nexus.bat stop` / `nexus.bat diagnose` / `nexus.bat admin`

Порты: frontend **5173**, backend **8000**, cloud **8080**, admin **8790**.

## После правок

```powershell
cd C:\nexus
git checkout -b feature/my-change
git add -A
git commit -m "описание"
git push -u origin feature/my-change
# → Pull Request в main на GitHub
```

## Устаревшее (не использовать)

- `nexus-backend/` — старый прототип auth
- `nexus-frontend/`, `portal/` — заглушки

## Документация

- `nexus-cloud-server/docs/DEPLOYMENT_RU.md`
- `docs/RENDER_SETUP_RU.md`, `docs/DEPLOY_VERCEL.md`
- `nexus-cloud-server/docs/ADMIN_RENDER_RU.md`
