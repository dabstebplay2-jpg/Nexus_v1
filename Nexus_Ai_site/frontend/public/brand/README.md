# Бренд Nexus

Структура папок (меняете только файлы внутри):

| Папка | Назначение | Имя файла |
|-------|------------|-----------|
| `image/logo/` | Только знак | `brand.svg` или `brand.png` |
| `image/logo_and_name/` | Знак + название | `brand.svg` или `brand.png` |
| `image/only_name/` | Только название | `brand.svg` или `brand.png` |

Код читает ассеты из `src/config/brandAssets.js` — пути менять не нужно.

**Favicon:** скопируйте знак в `image/logo/brand.png` (512×512) — подключится в `index.html`.
