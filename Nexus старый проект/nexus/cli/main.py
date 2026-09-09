import typer

from nexus.cli.display import (
    print_agents,
    print_doctor,
    print_doctor_report,
    print_memory,
    print_model_table,
    print_plugins,
    print_status,
    print_task_result,
    print_tools,
    print_version,
    run_boot_status,
)
from nexus.cli.models_cmd import models_app
from nexus.cli.providers_cmd import providers_app
from nexus.cli.secrets_cmd import secret_app
from nexus.cli.shell import start_shell
from nexus.core.runtime import get_runtime
from nexus.diagnostics.doctor import NexusDoctor
from nexus.ui.dashboard import show_dashboard

app = typer.Typer(help="Nexus 5.0 — Ultimate AI OS")
app.add_typer(models_app, name="models")
app.add_typer(models_app, name="model")
app.add_typer(providers_app, name="providers")
app.add_typer(providers_app, name="provider")
app.add_typer(secret_app, name="secret")


def _runtime():
    return get_runtime()


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context):
    """Launch Nexus interactive environment."""
    if ctx.invoked_subcommand is None:
        start_shell()


@app.command()
def version():
    print_version()


@app.command()
def launch():
    """Запуск Nexus UI dashboard."""
    show_dashboard()


@app.command()
def doctor():
    runtime = _runtime()
    run_boot_status(runtime)
    print_doctor_report(NexusDoctor(runtime).run())


@app.command()
def kernel():
    status = run_boot_status(_runtime())
    print_status({"version": status["version"], "codename": status["codename"], "state": status["state"], "kernel": status["kernel"], "agents": 0, "tools": 0, "plugins": 0, "memory": "OFFLINE", "models": {}})


@app.command()
def status():
    print_status(run_boot_status(_runtime()))


@app.command()
def agents():
    runtime = _runtime()
    run_boot_status(runtime)
    print_agents(runtime)


@app.command()
def tools():
    runtime = _runtime()
    run_boot_status(runtime)
    print_tools(runtime)


@app.command()
def memory():
    runtime = _runtime()
    run_boot_status(runtime)
    print_memory(runtime.memory.stats())


@app.command()
def plugins():
    runtime = _runtime()
    run_boot_status(runtime)
    print_plugins(runtime.plugins.list())


@app.command()
def skills():
    from nexus.cli.display import console
    console.print("\n[dim]Skills system: not configured yet (Phase 6).[/dim]\n")


@app.command()
def projects():
    from nexus.cli.display import console
    runtime = _runtime()
    projects_list = runtime.memory.project.projects
    console.print(f"\n[bold]Projects:[/bold] {len(projects_list)}\n")
    for name in projects_list:
        console.print(f"  [green]✓[/green] {name}")


@app.command()
def debug():
    from nexus.cli.display import console
    runtime = _runtime()
    run_boot_status(runtime)
    console.print({
        "events": runtime.events.count(),
        "event_types": {event["name"] for event in runtime.events.history()},
        "tasks": len(runtime.tasks.list()),
        "security_audit": len(runtime.security.history()),
        "changes": runtime.changes.summary(),
        "agent_activity": runtime.agent_activity,
        "models": runtime.models.summary(),
    })


@app.command()
def diagnose():
    doctor()


@app.command()
def task(prompt: str):
    import asyncio
    from nexus.cli.display import print_agent_activity

    runtime = _runtime()
    result = asyncio.run(runtime.run_task(prompt))
    print_agent_activity(runtime.agent_activity)
    print_task_result(result)


@app.command()
def chat(
    prompt: str | None = None,
    model: str | None = None
):

    import asyncio

    from nexus.models.manager import ModelManager

    manager = ModelManager()


    if prompt:

        asyncio.run(
            manager.chat(
                prompt,
                model
            )
        )

    else:

        asyncio.run(
            manager.nexus_terminal_chat()
        )



@app.command()
def hardware():

    from nexus.models.hardware import detect_hardware
    from rich.console import Console
    import json


    console = Console()


    data = detect_hardware()


    console.print(
        json.dumps(
            data,
            indent=2,
            ensure_ascii=False
        )
    )



@app.command()
def system():

    from nexus.models.hardware import detect_hardware
    from rich.console import Console
    from rich.panel import Panel
    import json


    console = Console()


    data = detect_hardware()


    console.print(
        Panel(
            json.dumps(
                data,
                indent=2,
                ensure_ascii=False
            ),
            title="Nexus Hardware Intelligence",
            border_style="cyan"
        )
    )


if __name__ == "__main__":
    app()

