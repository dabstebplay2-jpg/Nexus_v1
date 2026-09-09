# Nexus Launcher — Shader Download Final

Сделано:
- шейдеры теперь не просто ищутся, а полноценно устанавливаются;
- раздел `Шейдеры` во вкладке `Моды` скачивает .zip shader pack в `.minecraft/shaderpacks`;
- кнопка установки для шейдеров теперь называется `Установить шейдер`;
- progress/download center теперь показывает `Установка шейдера`, а не `Установка мода`;
- запись в `mods_index.json` сохраняет:
  - project_type=shader
  - install_dir=shaderpacks
  - version_id/version_number
  - Minecraft version
  - files/file_names
- добавлен `mods/shader_support.py`;
- после установки shader pack Nexus проверяет, есть ли Iris/Oculus/OptiFine;
- если shader loader не найден, Nexus предлагает установить рекомендуемый:
  - Fabric/Quilt -> Iris Shaders
  - Forge/NeoForge -> Oculus
  - Vanilla -> предупреждение, что нужен Iris/OptiFine/Oculus;
- библиотека теперь показывает не только моды, а все проекты:
  - моды
  - ресурспаки
  - шейдеры
- библиотека показывает папку установки:
  - mods
  - resourcepacks
  - shaderpacks
- поиск в библиотеке теперь ищет по типу проекта;
- сообщения установки и ошибок стали универсальными: проект/мод/ресурспак/шейдер.

Проверка:
- весь проект проверен через py_compile;
- Python-файлов: 64;
- ошибок: 0.
