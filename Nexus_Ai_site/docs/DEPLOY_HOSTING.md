# Вывод Nexus Pro на хост

## Схема

| Компонент | Где | Порт |
|-----------|-----|------|
| **frontend** | Vercel | 443 |
| **backend** | VPS / Railway / Render | 8000 (публичный) |
| **nexus-cloud-server** | тот же VPS (внутренняя сеть Docker) | 8080 |

Браузер ходит только на `VITE_API_BASE` → backend `/api/*` → cloud `/v1/*`.

---

## 1. VPS (рекомендуется: один сервер)

### Требования

- Ubuntu 22+ / Debian, Docker + Docker Compose
- Домен `api.ваш-домен.ru` → A-запись на IP сервера
- HTTPS (Caddy / nginx / Certbot)

### Шаги

```bash
git clone <ваш-репозиторий> /opt/nexus-ide
cd /opt/nexus-ide
cp deploy/env.example deploy/.env
nano deploy/.env   # секреты, CORS, ROUTER_AI_MASTER_KEY
docker compose up -d --build
curl http://127.0.0.1:8000/docs   # backend жив
```

### Reverse proxy (Caddy пример)

```caddy
api.ваш-домен.ru {
    reverse_proxy localhost:8000
}
```

Проверка: `https://api.ваш-домен.ru` — не должен открываться cloud :8080 снаружи.

### Vercel (фронт)

В **Settings → Environment Variables**:

```env
VITE_API_BASE=https://api.ваш-домен.ru/api
```

Пересоберите деплой: `cd frontend && vercel deploy --prod`.

В `deploy/.env` на сервере:

```env
NEXUS_CORS_ORIGINS=https://ваш-проект.vercel.app
```

---

## 2. Проверка после деплоя

1. `https://ваш-проект.vercel.app` — логин / регистрация  
2. DevTools → Network: запросы на `https://api.../api/`, не `127.0.0.1`  
3. Чат на платном тарифе (тестовая оплата)  
4. **IDE** (`/ide`) — файлы и терминал работают только если backend доступен; cloud нужен для ИИ-агента  

---

## 3. Защита вашего кошелька RouterAI

Настроено в cloud:

| Правило | Смысл |
|---------|--------|
| **Мастер-ключ** | Только создание/лимиты ключей, не чат |
| **Free** | Личный ключ **не создаётся** при регистрации |
| **Платный тариф** | Личный ключ с лимитом ≈ дневная квота |
| **Исчерпана квота** | Ключ **пауза** (disabled), без списания с мастера |
| **Понижение на Free** | Ключ отключается, secret удаляется из БД |
| `ROUTER_AI_ALLOW_PLATFORM_INFERENCE=false` | Запрет чата с вашего мастер-ключа |

В `deploy/.env`:

```env
ROUTER_AI_ALLOW_PLATFORM_INFERENCE=false
```

После обновления cloud перезапустите контейнер — при старте Free-пользователи с старыми ключами будут отключены.

---

## 4. Альтернативы VPS

- **Railway / Render**: два сервиса (cloud + backend), persistent disk для SQLite cloud  
- **Fly.io**: два `fly.toml` или один процесс + supervisor  

Логика та же: cloud не публикуйте в интернет без необходимости; backend — единственная публичная точка для API.

---

## 5. Дальше

- [PAYMENTS_RU.md](./PAYMENTS_RU.md) — ЮKassa  
- [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md) — только фронт  
