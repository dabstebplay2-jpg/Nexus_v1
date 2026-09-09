# Nexus Launcher

**Nexus Launcher** — это desktop-лаунчер для Minecraft на Python/PySide6 с поддержкой отдельных сборок, Fabric, Modrinth-модов, логов, настроек Java и локального сайта для скачивания лаунчера.

Проект находится в стадии рабочего MVP: базовый запуск Minecraft, создание сборок, установка модов и сборка `.exe` уже работают.

---

## Возможности

* Создание отдельных Minecraft-сборок
* Поддержка Vanilla и Fabric
* Запуск Minecraft из выбранной сборки
* Поиск и установка модов через Modrinth
* Удаление модов из сборки
* Просмотр логов лаунчера
* Проверка установленной Java
* Автоматический выбор подходящей версии Java
* Поддержка запуска из `.exe`
* Хранение пользовательских данных в AppData для `.exe`
* Локальный сайт для скачивания архива лаунчера

---

## Структура проекта

```text
Nexus_minecraft_launcher/
├─ app/                 # Главное окно приложения
├─ auth/                # Авторизация
├─ core/                # Основная логика лаунчера
├─ mods/                # Modrinth API и установка модов
├─ storage/             # Пути, файлы данных, настройки хранения
├─ ui/                  # Интерфейс PySide6
├─ website/             # Сайт для скачивания лаунчера
├─ logs/                # Логи лаунчера
├─ instances/           # Minecraft-сборки
├─ data/                # JSON-данные приложения
├─ main.py              # Точка входа
├─ requirements.txt     # Python-зависимости
└─ README.md
```

---

## Требования

* Windows 10/11
* Python 3.14+
* Java 17+ для старых версий Minecraft
* Java 21+ для новых версий Minecraft
* Java 25+ для Minecraft 26.x
* Интернет для загрузки Minecraft, Fabric и модов

---

## Установка зависимостей

В PowerShell:

```powershell
cd C:\Nexus_minecraft_launcher
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

---

## Запуск лаунчера в режиме разработки

```powershell
cd C:\Nexus_minecraft_launcher
.venv\Scripts\python.exe main.py
```

После запуска откроется окно Nexus Launcher.

Логи сохраняются в:

```text
C:\Nexus_minecraft_launcher\logs
```

Основной актуальный лог:

```text
C:\Nexus_minecraft_launcher\logs\latest.log
```

---

## Запуск локального сайта

Сайт находится в папке:

```text
C:\Nexus_minecraft_launcher\website
```

Запуск:

```powershell
cd C:\Nexus_minecraft_launcher\website
..\.venv\Scripts\python.exe -m http.server 8080
```

После этого сайт будет доступен в браузере:

```text
http://localhost:8080
```

или:

```text
http://127.0.0.1:8080
```

Чтобы остановить сайт, нажмите в PowerShell:

```text
Ctrl + C
```

---

## Сборка `.exe`

Для сборки используется PyInstaller.

Установка:

```powershell
cd C:\Nexus_minecraft_launcher
.venv\Scripts\activate
python -m pip install pyinstaller
```

Сборка папочной версии:

```powershell
python -m PyInstaller `
  --noconfirm `
  --clean `
  --windowed `
  --name "Nexus Launcher" `
  --collect-all PySide6 `
  --collect-all minecraft_launcher_lib `
  main.py
```

Готовый `.exe` будет находиться здесь:

```text
C:\Nexus_minecraft_launcher\dist\Nexus Launcher\Nexus Launcher.exe
```

Для распространения лучше архивировать всю папку:

```text
C:\Nexus_minecraft_launcher\dist\Nexus Launcher
```

а не только один `.exe`, потому что рядом с ним находятся нужные библиотеки.

---

## Создание архива для сайта

После сборки `.exe` можно создать архив для скачивания с сайта:

```powershell
Compress-Archive `
  -Path "C:\Nexus_minecraft_launcher\dist\Nexus Launcher\*" `
  -DestinationPath "C:\Nexus_minecraft_launcher\website\NexusLauncher_Windows.zip" `
  -Force
```

Файл должен лежать рядом с `index.html`:

```text
website/
├─ index.html
├─ style.css
├─ script.js
└─ NexusLauncher_Windows.zip
```

---

## Где хранятся данные

При запуске через Python данные хранятся внутри проекта:

```text
C:\Nexus_minecraft_launcher\data
C:\Nexus_minecraft_launcher\instances
C:\Nexus_minecraft_launcher\logs
```

При запуске через `.exe` данные хранятся в AppData:

```text
C:\Users\<USERNAME>\AppData\Roaming\NexusLauncher
```

Там находятся:

```text
data/
instances/
logs/
mods/
storage/
```

Это сделано для того, чтобы `.exe` мог нормально работать вне папки разработки.

---

## Работа с модами

Nexus Launcher использует Modrinth API.

Поддерживается:

* поиск модов
* установка `.jar` в выбранную сборку
* установка зависимостей
* удаление модов
* отображение информации о модах

Для корректной работы модов сборка должна использовать совместимый loader, например Fabric.

---

## Java

Лаунчер ищет установленные версии Java и выбирает подходящую.

Пример:

```text
Java 17 — подходит для Minecraft 1.20.1
Java 21 — подходит для Minecraft 1.21.x
Java 25 — подходит для Minecraft 26.x
```

Если нужная Java не найдена, лаунчер показывает сообщение и предлагает установить подходящую версию.

---

## Частые проблемы

### Лаунчер запускается, но сборки не отображаются в `.exe`

Причина: `.exe` использует AppData, а запуск через Python использует папку проекта.

Проверь файл:

```text
C:\Users\<USERNAME>\AppData\Roaming\NexusLauncher\data\instances.json
```

---

### Моды не устанавливаются

Проверь:

* выбрана ли сборка
* установлен ли Fabric
* подходит ли версия Minecraft
* есть ли интернет
* есть ли ошибка в `logs/latest.log`

---

### Minecraft не запускается из-за Java

Проверь установленную Java:

```powershell
java -version
```

Также проверь логи лаунчера:

```text
logs/latest.log
```

---

### Сайт не открывается

Проверь, что сервер запущен:

```powershell
cd C:\Nexus_minecraft_launcher\website
..\.venv\Scripts\python.exe -m http.server 8080
```

Открой:

```text
http://localhost:8080
```

---

## Git

Перед коммитом не нужно добавлять тяжёлые папки:

```text
.venv/
dist/
build/
instances/
logs/
__pycache__/
```

Проверить статус:

```powershell
git status --short --untracked-files=all
```

Сделать коммит:

```powershell
git add .
git commit -m "Update Nexus Launcher"
```

---

## Текущий статус проекта

Работает:

* запуск лаунчера
* создание сборок
* запуск Minecraft
* установка Fabric
* поиск модов через Modrinth
* установка модов
* удаление модов
* логи
* запуск сайта
* сборка `.exe`

В планах:

* Microsoft-авторизация
* полноценный Download Manager
* улучшенная библиотека модов
* проверка совместимости модов
* обновление модов
* красивый экран настроек сборки
* автопроверка обновлений лаунчера
* публикация сайта
* релизная версия 1.0

---

## Важно

Nexus Launcher — неофициальный проект.

Проект не связан с Mojang, Microsoft, Fabric или Modrinth.
Minecraft является товарным знаком Mojang/Microsoft.
