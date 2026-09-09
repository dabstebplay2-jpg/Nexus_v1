
import asyncio
from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.text import Text


console = Console()


SPINNER = [
    "?",
    "?",
    "?",
    "?"
]


async def thinking(text="Nexus ??????..."):

    index = 0

    with Live(
        "",
        console=console,
        refresh_per_second=8
    ) as live:

        while True:
            live.update(
                Panel(
                    f"{SPINNER[index % len(SPINNER)]} {text}",
                    border_style="cyan"
                )
            )

            index += 1

            await asyncio.sleep(
                0.12
            )


def show_message(role, text):

    console.print(
        Panel(
            text,
            title=role,
            border_style="green"
        )
    )


def banner(model):

    console.print(
        Panel(
            f"""
?? Nexus AI

Model:
[cyan]{model}[/]

Interactive mode

??????? exit ??? ??????
""",
            title="NEXUS",
            border_style="cyan"
        )
    )
