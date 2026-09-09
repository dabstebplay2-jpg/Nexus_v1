import ctypes
import platform


MB = 1024 * 1024


class MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_ulong),
        ("dwMemoryLoad", ctypes.c_ulong),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]

    def __init__(self):
        super().__init__()
        self.dwLength = ctypes.sizeof(self)


def get_memory_status():
    status = MEMORYSTATUSEX()

    try:
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status))
        return status
    except Exception:
        return None


def get_total_ram_mb():
    status = get_memory_status()

    if not status:
        return 8192

    return int(status.ullTotalPhys // MB)


def get_available_ram_mb():
    status = get_memory_status()

    if not status:
        return 4096

    return int(status.ullAvailPhys // MB)


def get_used_ram_mb():
    return max(0, get_total_ram_mb() - get_available_ram_mb())


def get_memory_load_percent():
    status = get_memory_status()

    if not status:
        return 0

    return int(status.dwMemoryLoad)


def round_to_step(value, step=512):
    value = int(value)
    return max(step, int(round(value / step) * step))


def get_safe_max_ram_mb():
    total = get_total_ram_mb()

    if total <= 4096:
        return 2048

    # Оставляем Windows минимум 2 GB
    safe = total - 2048
    return round_to_step(max(2048, safe), 512)


def get_recommended_ram_mb():
    total = get_total_ram_mb()

    if total <= 4096:
        return 2048

    if total <= 8192:
        return 4096

    if total <= 12288:
        return 4096

    if total <= 16384:
        return 6144

    if total <= 24576:
        return 8192

    if total <= 32768:
        return 12288

    return 16384


def clamp_ram_mb(value):
    value = round_to_step(value, 512)
    return max(1024, min(value, get_safe_max_ram_mb()))


def format_ram_gb(mb):
    gb = mb / 1024

    if abs(gb - round(gb)) < 0.05:
        return f"{int(round(gb))} GB"

    return f"{gb:.1f} GB"


def format_ram_gb_short(mb):
    gb = mb / 1024
    return f"{gb:.1f}"


def get_pc_summary():
    total = get_total_ram_mb()
    available = get_available_ram_mb()
    used = get_used_ram_mb()
    load = get_memory_load_percent()
    safe_max = get_safe_max_ram_mb()
    recommended = get_recommended_ram_mb()

    return {
        "platform": platform.platform(),
        "total_ram_mb": total,
        "available_ram_mb": available,
        "used_ram_mb": used,
        "memory_load_percent": load,
        "safe_max_ram_mb": safe_max,
        "recommended_ram_mb": recommended,
        "total_ram_text": format_ram_gb(total),
        "available_ram_text": format_ram_gb(available),
        "used_ram_text": format_ram_gb(used),
        "safe_max_ram_text": format_ram_gb(safe_max),
        "recommended_ram_text": format_ram_gb(recommended),
        "hero_ram_text": f"{format_ram_gb_short(used)} / {format_ram_gb_short(total)} GB",
    }
