
from rich.console import Console
from rich.panel import Panel

console = Console()


def show_model_header(model, provider):

    console.print(
        Panel(
            f"""
?? Nexus AI

Model:
[cyan]{model}[/]

Provider:
[green]{provider}[/]

Status:
?? Connected
""",
            title="NEXUS",
            border_style="cyan"
        )
    )


def print_response(text):

    console.print()

    console.print(
        Panel(
            text,
            title="Nexus",
            border_style="green"
        )
    )
