# Установка Nexus IDE Desktop

Полноценный IDE на базе VSCodium (VS Code) + OpenVSX + встроенные расширения Nexus.

## Быстрый путь (без сборки 15 GB)

1. Установите [VSCodium](https://vscodium.com/) для Windows.
2. В PowerShell из репозитория:

```powershell
cd nexus-desktop
.\scripts\package-extensions.ps1
.\scripts\quick-install-vscodium.ps1
```

3. В IDE: **Nexus: Sign In** → панель **AI Chat**.

## Скачать готовый Nexus IDE (после релиза)

1. Откройте [страницу релизов](https://github.com/nexus-ide/nexus-ide/releases) или кнопку «Скачать» на сайте (`/ide`).
2. Скачайте **`NexusIDE-win32-x64.zip`** (portable) или installer, если он есть в релизе.
3. Распакуйте ZIP в удобную папку (например `C:\Apps\NexusIDE`).
4. Запустите **`Nexus IDE.exe`** (или `Code.exe` внутри portable-папки — имя зависит от сборки VSCodium).

## Первый запуск

1. **Nexus: Sign In** — войдите email/паролем облака.
2. Проверьте настройки (**File → Preferences → Settings** → `nexus`):
   - `nexus.cloudUrl` — по умолчанию `https://nexus-cloud-bxcc.onrender.com/v1`
   - `nexus.webAppUrl` — веб-приложение (чат, тарифы): `https://nexus-zeta-ruby-12.vercel.app`
3. Откройте панель **Nexus → AI Chat**, выберите модель, отправьте сообщение.
4. Расширения: **Ctrl+Shift+X** → поиск на [Open VSX](https://open-vsx.org) (Prettier, ESLint, Python, GitLens).

## Сборка из исходников

См. [NEXUS_DESKTOP_BUILD.md](./NEXUS_DESKTOP_BUILD.md).

После `build.ps1`:

```powershell
cd nexus-desktop
.\scripts\package-release.ps1
```

Артефакт: `nexus-desktop/dist/NexusIDE-win32-x64.zip`.

## Релиз для maintainers

```bash
git tag desktop-v0.1.0
git push origin desktop-v0.1.0
```

GitHub Actions (workflow `Nexus Desktop`) соберёт Windows x64 и прикрепит ZIP к Release.

## Smoke-тест

Чеклист: [DESKTOP_SMOKE_CHECKLIST.md](./DESKTOP_SMOKE_CHECKLIST.md).
