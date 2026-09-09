from core.logger import get_latest_log_path


def explain_error(error_text: str) -> str:
    text = error_text or ""
    lower = text.lower()
    log_path = get_latest_log_path()

    if "java" in lower and "нужна java" in lower:
        return f"{text}\n\nПодробный лог:\n{log_path}"

    if "unrecognized option" in lower or "--sun-misc-unsafe-memory-access" in lower:
        return (
            "Текущая Java не подходит для выбранной версии Minecraft.\n\n"
            "Новая версия Minecraft использует JVM-аргументы, которые не поддерживаются твоей Java.\n"
            "Поставь более новую Java или выбери более старую версию Minecraft.\n\n"
            f"Подробный лог:\n{log_path}"
        )

    if "connecttimeout" in lower or "timed out" in lower or "timeout" in lower or "10060" in lower:
        return (
            "Скачивание не успело завершиться.\n\n"
            "Проверь интернет, VPN/прокси и попробуй снова.\n"
            "Иногда Mojang CDN отвечает медленно, особенно при скачивании runtime или assets.\n\n"
            f"Подробный лог:\n{log_path}"
        )

    if "missing dependencies for socks support" in lower:
        return (
            "Проблема с SOCKS-прокси/VPN.\n\n"
            "Python пытается скачать файлы через SOCKS-прокси, но не установлена поддержка SOCKS.\n\n"
            "Исправление:\n"
            'python -m pip --isolated install "requests[socks]" PySocks\n\n'
            f"Подробный лог:\n{log_path}"
        )

    if "winerror 2" in lower:
        return (
            "Windows не нашёл нужный файл для запуска.\n\n"
            "Чаще всего причина — не найден java.exe или путь к нему неправильный.\n\n"
            "Проверь:\n"
            "java -version\n\n"
            f"Подробный лог:\n{log_path}"
        )

    if "java не найдена" in lower or "java not found" in lower:
        return (
            "Java не найдена.\n\n"
            "Установи Java 17+ и перезапусти лаунчер.\n\n"
            f"Подробный лог:\n{log_path}"
        )

    if "ssl" in lower or "certificate" in lower:
        return (
            "Проблема с SSL-сертификатом или HTTPS-соединением.\n\n"
            "Часто это бывает из-за VPN, прокси, антивируса или фильтрации сети.\n\n"
            f"Подробный лог:\n{log_path}"
        )

    if "permission denied" in lower or "winerror 5" in lower:
        return (
            "Нет прав на доступ к файлу или папке.\n\n"
            "Попробуй запустить лаунчер от имени администратора или проверь права на папку проекта.\n\n"
            f"Подробный лог:\n{log_path}"
        )

    return (
        "Не удалось выполнить действие.\n\n"
        f"Краткая ошибка:\n{text}\n\n"
        f"Подробный лог:\n{log_path}"
    )