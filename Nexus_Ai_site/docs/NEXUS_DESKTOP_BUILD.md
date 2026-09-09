# Сборка Nexus IDE Desktop (Windows)

Десктоп основан на [VSCodium](https://github.com/VSCodium/vscodium) (Code-OSS) с `product.json` Nexus и встроенными расширениями в `nexus-desktop/extensions/`.

## Требования

| Компонент | Версия |
|-----------|--------|
| Windows | 10/11 x64 |
| Git | 2.x |
| Node.js | 20 LTS |
| Python | 3.11+ |
| Visual Studio Build Tools | 2022, workload «Desktop development with C++» |
| Git Bash | для скриптов VSCodium |

Ориентир по месту на диске: **15–20 GB** после первой сборки.

## Шаги

```powershell
cd c:\nexus-ide\nexus-desktop
.\scripts\prepare.ps1
.\scripts\build.ps1
```

`prepare.ps1`:

1. Клонирует `vscodium` (shallow) в `nexus-desktop/vscodium/`
2. Копирует [product/product.json](../nexus-desktop/product/product.json)
3. Копирует расширения `nexus-*` в `vscodium/builtin-extensions/`

`build.ps1` запускает `dev/build.sh` внутри VSCodium (долго).

## Результат

После успешной сборки ищите:

- `nexus-desktop/vscodium/VSCode-win32-x64/` — portable
- или артефакты NSIS в `release/` (зависит от версии скриптов VSCodium)

## Разработка расширений без полной сборки

1. Установите [VSCodium](https://vscodium.com/) или VS Code.
2. Откройте папку `nexus-desktop/extensions/nexus-auth` → F5 (Extension Development Host).
3. В `settings.json` хоста: `"nexus.cloudUrl": "http://127.0.0.1:8080/v1"`.
4. Запустите `nexus-cloud-server` на порту 8080.

## CI

Сборка в GitHub Actions: [.github/workflows/nexus-desktop.yml](../.github/workflows/nexus-desktop.yml).  
Полная компиляция может занимать >90 мин — workflow собирает VSIX расширений и валидирует `product.json`; полный installer — по тегу `desktop-v*`.

## OpenVSX

В `product.json` задана галерея OpenVSX. Microsoft Marketplace в Nexus IDE **не используется** (лицензия).

## Иконки

Замените файлы в [nexus-desktop/icons/](../nexus-desktop/icons/) и пересоберите (см. README в папке icons).
