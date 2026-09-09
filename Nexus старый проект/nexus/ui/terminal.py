
from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
from rich.text import Text


console = Console()


def header(model, provider):

    console.print(
        Panel(
            "\n".join([
                "? Nexus AI",
                "",
                f"{model} ? {provider}",
                "",
                "Session: local",
                "Mode: Chat"
            ]),
            title="NEXUS",
            border_style="cyan"
        )
    )


def user_message(text):

    console.print(
        Text(
            f"\nYou > {text}",
            style="green"
        )
    )


def assistant_start():

    console.print(
        "\n[cyan]? Nexus >[/]"
    )


def assistant_text(text):

    console.print(
        Markdown(text)
    )


def status(model):

    console.print(
        Text(
            f"{model} | Local | Ready | /help /model /mode /exit",
            style="dim"
        )
    )


def thinking():

    console.print(
        Text(
            "? Nexus ??????...",
            style="cyan"
        )
    )
