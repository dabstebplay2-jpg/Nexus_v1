import asyncio
import time

from rich.align import Align
from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.table import Table

from nexus.core.runtime import get_runtime
from nexus.version import CODENAME, VERSION

console = Console()


def _build_status_table(status: dict) -> Table:
    table = Table(title=f"Nexus {VERSION} — {CODENAME}", expand=True)
    table.add_column("System")
    table.add_column("Status")

    table.add_row("Kernel", status.get("kernel", "OFFLINE"))
    table.add_row("Agents", str(status.get("agents", 0)))
    table.add_row("Memory", status.get("memory", "OFFLINE"))
    table.add_row("Tools", str(status.get("tools", 0)))
    table.add_row("Models", ", ".join(status.get("models", [])) or "none")
    table.add_row("Security", "ONLINE")

    return table


async def _get_runtime_status() -> dict:
    runtime = get_runtime()
    await runtime.boot()
    return runtime.status()


def create_dashboard() -> Table:
    status = asyncio.run(_get_runtime_status())
    return _build_status_table(status)


def show_dashboard():
    status = asyncio.run(_get_runtime_status())

    console.clear()
    console.print(
        Panel(
            Align.center(
                f"""
        ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗
        ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝
        ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗
        ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║
        ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║
        ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝


              NEXUS {VERSION.upper()}
              {CODENAME.upper()}
                """
            ),
            border_style="cyan",
        )
    )

    with Live(_build_status_table(status), refresh_per_second=4):
        for _ in range(5):
            time.sleep(1)


def render_dashboard():
    show_dashboard()
