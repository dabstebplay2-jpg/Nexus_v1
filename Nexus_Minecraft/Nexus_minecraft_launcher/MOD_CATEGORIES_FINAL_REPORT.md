# Nexus Launcher — Mod Categories Final

Добавлено в каталог Modrinth:
- разделы контента:
  - Моды (`project_type:mod`)
  - Модпаки (`project_type:modpack`)
  - Ресурспаки (`project_type:resourcepack`)
  - Шейдеры (`project_type:shader`)
- категории внутри каждого раздела:
  - моды: оптимизация, библиотеки/API, утилиты, геймплей, приключения, мобы, магия, технологии, мир/генерация, декор, еда, снаряжение, транспорт;
  - модпаки: оптимизация, квесты, приключения, магия, технологии, мультиплеер, Vanilla+, хоррор, сложность;
  - ресурспаки: vanilla-like, realistic, simplistic, themed, animated, modded, 16x, 32x, 64x, 128x+;
  - шейдеры: Iris, OptiFine, Canvas, realistic, fantasy, path tracing, low-end.
- фильтры:
  - сторона: любая, клиент, сервер, клиент+сервер;
  - сортировка: скачивания, релевантность, обновления, новые, подписчики.
- поиск теперь передаёт в Modrinth facets:
  - project_type
  - versions
  - categories
  - client_side/server_side
- loader-фильтр применяется только там, где он уместен: моды и модпаки.
- карточки и детали получают правильный project_type, поэтому ссылки открываются в правильных разделах Modrinth:
  - /mod/
  - /modpack/
  - /resourcepack/
  - /shader/
- модпаки пока доступны как просмотр/открытие на Modrinth, без авто-импорта .mrpack, чтобы не ломать сборки.

Проверка:
- весь проект проверен через py_compile;
- Python-файлов: 61;
- ошибок: 0.
