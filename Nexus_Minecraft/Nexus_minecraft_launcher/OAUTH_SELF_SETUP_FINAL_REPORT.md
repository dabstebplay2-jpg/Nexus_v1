# Nexus Launcher — OAuth Self Setup Final

Что сделано:
- Nexus больше не требует обязательно задавать OAuth через переменные окружения;
- добавлено сохранение OAuth-настроек в `data/oauth_settings.json`;
- `auth/oauth_config.py` теперь читает настройки из:
  1. переменных окружения;
  2. `data/oauth_settings.json`;
  3. стандартных redirect URI;
- добавлены функции:
  - `load_oauth_settings`
  - `save_oauth_settings`
  - `update_oauth_settings`
  - динамические getters для Microsoft/Ely.by;
- `auth/microsoft_auth.py` и `auth/ely_auth.py` больше не используют устаревшие константы при запуске, а читают актуальные значения;
- во вкладке `Аккаунты` кнопки `Настроить` для Microsoft и Ely.by теперь открывают встроенные диалоги;
- Microsoft:
  - пользователь вставляет Application (client) ID;
  - redirect URI сохраняется;
  - вход запускается без ручной вставки redirect URL;
- Ely.by:
  - пользователь вставляет clientId;
  - пользователь вставляет clientSecret;
  - secret вводится в password-mode;
  - redirect URI сохраняется;
  - вход запускается без ручной вставки redirect URL;
- callback server уже ловит localhost redirect автоматически;
- аккаунт после входа автоматически становится активным.

Важно:
- Сам Nexus не может создать Azure App или Ely.by OAuth application без аккаунта пользователя.
- Это ограничение OAuth-платформ, а не лаунчера.
- Но теперь пользователю не нужно лезть в PowerShell и setx: достаточно один раз вставить client ID/secret в UI.

Проверка:
- весь проект проверен через py_compile;
- Python-файлов: 64;
- ошибок: 0.
