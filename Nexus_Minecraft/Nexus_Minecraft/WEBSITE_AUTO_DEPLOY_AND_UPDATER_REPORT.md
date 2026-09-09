# Nexus Launcher — Website Auto Deploy + In-App Updates

Что сделано:
- бесплатный хост выбран: GitHub Pages;
- сайт деплоится автоматически через GitHub Actions;
- после пуша тега `v*` workflow:
  1. собирает EXE;
  2. собирает portable ZIP;
  3. собирает Setup installer;
  4. публикует GitHub Release;
  5. генерирует `website/release.json`;
  6. деплоит сайт на GitHub Pages;
- сайт сам подтягивает последний GitHub Release через GitHub API;
- если GitHub API временно недоступен, сайт берёт данные из локального `release.json`;
- добавлен генератор `tools/generate_website_release.py`;
- лаунчер уже проверяет GitHub Releases при запуске и предлагает обновиться;
- версия поднята до `0.7.6`.

Итоговая схема:
- сайт: `https://dabstebplay2-jpg.github.io/Nexus_mincraft_laucher/`;
- metadata: `/release.json`;
- последний установщик: GitHub Releases `latest/download`;
- обновление из лаунчера: GitHub Releases -> скачать Setup -> закрыть Nexus -> запустить установщик.

Важно:
- в настройках GitHub репозитория нужно включить Pages source: GitHub Actions.
