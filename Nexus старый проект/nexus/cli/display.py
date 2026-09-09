from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from nexus.version import CODENAME, VERSION

if TYPE_CHECKING:
    from nexus.core.runtime import NexusRuntime

console = Console()


def _terminal_safe(value: str) -> str:
    """Keep rich output usable in legacy Windows code pages."""
    encoding = getattr(console.file, "encoding", None) or "utf-8"
    try:
        value.encode(encoding)
    except (LookupError, UnicodeEncodeError):
        return value.replace("✓", "+")
    return value


def print_version() -> None:
    console.print(f"[bold cyan]Nexus {VERSION}[/bold cyan] — {CODENAME}")


def print_status(status: dict) -> None:
    table = Table(title=f"Nexus {VERSION} — System Status", expand=True, border_style="cyan")
    table.add_column("Component", style="bold")
    table.add_column("Status")

    kernel_ok = status.get("kernel") == "ONLINE"
    memory_ok = status.get("memory") == "ONLINE"

    table.add_row("Version", status.get("version", VERSION))
    table.add_row("Codename", status.get("codename", CODENAME))
    table.add_row("State", status.get("state", "UNKNOWN"))
    table.add_row("Kernel", _status_text(status.get("kernel", "OFFLINE"), kernel_ok))
    table.add_row("Agents", str(status.get("agents", 0)))
    table.add_row("Tools", str(status.get("tools", 0)))
    table.add_row("Plugins", str(status.get("plugins", 0)))
    table.add_row("Memory", _status_text(status.get("memory", "OFFLINE"), memory_ok))

    models_summary = status.get("models", {})
    if isinstance(models_summary, dict):
        current = status.get("current_model") or models_summary.get("current")
        count = models_summary.get("count", 0)
        table.add_row("Models", f"{count} configured" + (f" (current: {current})" if current else ""))
    elif isinstance(models_summary, list):
        table.add_row("Models", ", ".join(str(m) for m in models_summary) if models_summary else "none")
    else:
        table.add_row("Models", "none")

    console.print(table)


def print_agents(runtime: NexusRuntime) -> None:
    agents = runtime.agents.list()
    activity = runtime.agent_activity

    table = Table(title="Nexus Agent Society", expand=True, border_style="cyan")
    table.add_column("Agent", style="bold cyan")
    table.add_column("Status")
    table.add_column("Action")

    for agent in agents:
        name = agent.name
        is_active = activity.get("agent") == name
        status = activity.get("status", getattr(agent, "status", "READY")) if is_active else getattr(agent, "status", "READY")
        action = activity.get("action", "—") if is_active else "—"
        table.add_row(name, status, action)

    console.print(table)
    console.print(f"[dim]{len(agents)} agent(s) loaded[/dim]")


def print_tools(runtime: NexusRuntime) -> None:
    names = runtime.tools.list()
    table = Table(title="Nexus Tool Registry", expand=True, border_style="cyan")
    table.add_column("Tool", style="bold green")
    table.add_column("Status")

    for name in names:
        table.add_row(name, "READY")

    if not names:
        table.add_row("—", "[dim]Boot runtime to load defaults[/dim]")

    console.print(table)


def print_memory(stats: dict) -> None:
    online = stats.get("online", False)
    table = Table(title="Nexus Memory System", expand=True, border_style="cyan")
    table.add_column("Store", style="bold")
    table.add_column("Items")
    table.add_column("Status")

    table.add_row("Short Term", str(stats.get("short_term_items", 0)), _status_text("ONLINE" if online else "OFFLINE", online))
    table.add_row("Long Term", str(stats.get("long_term_items", 0)), _status_text("ONLINE" if online else "OFFLINE", online))
    table.add_row("Projects", str(stats.get("projects", 0)), _status_text("ONLINE" if online else "OFFLINE", online))

    console.print(table)


def print_models(models) -> None:
    """Legacy wrapper — accepts list of strings or ModelEntry list."""
    from nexus.models.types import ModelEntry

    if models and isinstance(models[0], ModelEntry):
        print_model_table(models)
    elif models and isinstance(models[0], dict):
        entries = [ModelEntry.from_dict(m) for m in models]
        print_model_table(entries)
    else:
        table = Table(title="Available Models", expand=True, border_style="cyan")
        table.add_column("Model", style="bold magenta")
        for model in models:
            table.add_row(str(model))
        if not models:
            table.add_row("[dim]No models configured[/dim]")
        console.print(table)


def print_model_table(models, current_id: str | None = None) -> None:
    from nexus.models.types import ModelEntry, ModelStatus

    table = Table(title="Nexus Models", expand=True, border_style="cyan")
    table.add_column("ID", style="cyan")
    table.add_column("Name", style="bold magenta")
    table.add_column("Provider")
    table.add_column("Type")
    table.add_column("Capabilities")
    table.add_column("Status")

    for entry in models:
        if not isinstance(entry, ModelEntry):
            entry = ModelEntry.from_dict(entry) if isinstance(entry, dict) else ModelEntry(
                id=str(entry), name=str(entry), provider="unknown", model=str(entry)
            )
        is_current = current_id and entry.id == current_id
        name = f"* {entry.name}" if is_current else entry.name
        status_style = "green" if entry.status == ModelStatus.CONNECTED.value else "red"
        table.add_row(
            entry.id,
            name,
            entry.provider_name,
            entry.type_name,
            entry.capabilities_text,
            Text(entry.status, style=status_style),
        )

    if not models:
        table.add_row("—", "[dim]No models configured[/dim]", "-", "-", "-", "-")

    console.print(table)


def print_current_model(entry) -> None:
    from nexus.models.types import ModelEntry

    if entry is None:
        console.print("[yellow]No AI model selected.[/yellow] Use [bold]/model use <id>[/bold].")
        return
    if not isinstance(entry, ModelEntry):
        console.print(f"[bold cyan]Active AI model:[/bold cyan] {entry}")
        return
    console.print(
        Panel(
            f"[bold]{entry.name}[/bold]\n"
            f"Provider: {entry.provider_name}\n"
            f"Type: {entry.type_name}\n"
            f"Status: {entry.status}",
            title="[bold cyan]Active AI model[/bold cyan]",
            border_style="cyan",
        )
    )


def print_api_keys(items: list[dict]) -> None:
    table = Table(title="Nexus API Keys", expand=True, border_style="cyan")
    table.add_column("Model", style="bold")
    table.add_column("Provider")
    table.add_column("Status")
    table.add_column("Source")
    table.add_column("Key")
    for item in items:
        configured = item.get("configured", False)
        table.add_row(
            str(item.get("model_id", "—")),
            str(item.get("provider", "—")),
            Text("SET" if configured else "NOT SET", style="green" if configured else "yellow"),
            str(item.get("source") or "—"),
            str(item.get("value") or "—"),
        )
    console.print(table)


def print_discovered_models(models) -> None:
    table = Table(title="Provider Models", expand=True, border_style="cyan")
    table.add_column("#", justify="right")
    table.add_column("Select ID", style="bold magenta")
    table.add_column("Provider model")
    table.add_column("Name")
    table.add_column("Context")
    for index, model in enumerate(models, 1):
        table.add_row(
            str(index),
            str(model.id),
            str(getattr(model, "model", model.id)),
            str(model.name),
            str(model.context_length or "—"),
        )
    if not models:
        table.add_row("—", "No models returned", "—", "—", "—")
    console.print(table)


def print_provider_accounts(accounts, manager=None) -> None:
    table = Table(title="Connected AI Services", expand=True, border_style="cyan")
    table.add_column("Account", style="bold cyan")
    table.add_column("Provider")
    table.add_column("Endpoint")
    table.add_column("Key")
    table.add_column("Status")
    for account in accounts:
        configured = False
        if manager is not None:
            try:
                configured = manager.accounts.get_api_key(account.id) is not None
            except KeyError:
                configured = False
        table.add_row(
            account.id,
            account.provider,
            account.base_url or "default",
            "configured" if configured else (f"env:{account.api_key_env}" if account.api_key_env else "not required" if account.provider == "ollama" else "not set"),
            account.status,
        )
    if not accounts:
        table.add_row("—", "No AI services connected", "—", "—", "—")
    console.print(table)


def print_plugins(plugins: list) -> None:
    table = Table(title="Nexus Plugins", expand=True, border_style="cyan")
    table.add_column("Plugin", style="bold yellow")

    for plugin in plugins:
        name = plugin.get("name", plugin) if isinstance(plugin, dict) else str(plugin)
        table.add_row(name)

    if not plugins:
        table.add_row("[dim]No plugins loaded[/dim]")

    console.print(table)


def print_doctor(status: dict) -> None:
    healthy = status.get("kernel") == "ONLINE" and status.get("memory") == "ONLINE"
    health_label = "OK" if healthy else "DEGRADED"
    health_style = "green" if healthy else "yellow"

    lines = [
        f"Core:     {status.get('state', 'UNKNOWN')}",
        f"Kernel:   {status.get('kernel', 'OFFLINE')}",
        f"Agents:   {status.get('agents', 0)} loaded",
        f"Memory:   {status.get('memory', 'OFFLINE')}",
        f"Tools:    {status.get('tools', 0)} loaded",
        f"Plugins:  {status.get('plugins', 0)} loaded",
        f"Security: ONLINE",
        "",
        f"System Health: [{health_style}]{health_label}[/{health_style}]",
    ]
    console.print(Panel("\n".join(lines), title="[bold cyan]Nexus Doctor[/bold cyan]", border_style="cyan"))


def print_doctor_report(report) -> None:
    data = report.to_dict() if hasattr(report, "to_dict") else report
    console.print("\n[bold cyan]Nexus Doctor[/bold cyan]\n")
    for name, ok in data.get("checks", {}).items():
        marker = _terminal_safe("✓" if ok else "✗")
        style = "green" if ok else "red"
        console.print(f"[{style}]{name:<18} {marker}[/{style}]")
    warnings = data.get("warnings", [])
    if warnings:
        console.print("\n[bold yellow]Warnings:[/bold yellow]\n")
        for warning in warnings:
            console.print(f"[yellow]- {warning}[/yellow]")


def print_agent_activity(activity: dict) -> None:
    if not activity:
        return
    lines = [
        f"Agent:\n{activity.get('agent', '—')}",
        "",
        f"Status:\n{activity.get('status', '—')}",
        "",
        f"Action:\n{activity.get('action', '—')}",
    ]
    console.print(Panel("\n".join(lines), title="[bold]Active Agent[/bold]", border_style="green"))


def print_task_result(result: dict) -> None:
    """Render the Orchestra execution trace and final answer."""
    execution = result.get("result", {})
    activity = result.get("activity", [])
    if activity:
        from nexus.activity.renderer import ActivityRenderer

        console.print()
        for line in ActivityRenderer().render(activity):
            console.print(_terminal_safe(line))

    orchestra_trace = execution.get("orchestra_trace", []) if isinstance(execution, dict) else []
    for item in ([] if activity else orchestra_trace):
        if item == "[NEXUS ORCHESTRA]":
            console.print("\n[bold cyan][NEXUS ORCHESTRA][/bold cyan]")
        elif item.startswith("✓") or item == "PASS":
            console.print(f"[green]{_terminal_safe(item)}[/green]")
        elif item == "REPAIR_REQUIRED":
            console.print(f"[yellow]{item}[/yellow]")
        else:
            console.print(item)

    trace = execution.get("trace", []) if isinstance(execution, dict) else []
    worker_trace = [] if activity else (trace[len(orchestra_trace):] if orchestra_trace else trace)
    for item in worker_trace:
        if item == "Completed":
            console.print("[green]Completed[/green]")
        elif item.startswith("Tool:"):
            console.print(f"[yellow]{item}[/yellow]")
        else:
            console.print(item)

    answer = execution.get("answer") if isinstance(execution, dict) else execution
    if answer:
        console.print(Panel(str(answer), title="[bold cyan]Agent response[/bold cyan]"))


async def boot_and_status(runtime: NexusRuntime) -> dict:
    await runtime.boot()
    return runtime.status()


def run_boot_status(runtime: NexusRuntime) -> dict:
    return asyncio.run(boot_and_status(runtime))


def _status_text(label: str, ok: bool) -> Text:
    style = "green" if ok else "red"
    return Text(label, style=style)
