"""CLI boundary for Nexus Model System V6."""

from __future__ import annotations

import asyncio

import typer

from nexus.cli.display import (
    console,
    print_current_model,
    print_discovered_models,
    print_model_table,
)
from nexus.core.async_utils import run_async
from nexus.core.runtime import get_runtime
from nexus.models.manager import ModelManager


models_app = typer.Typer(help="Manage AI models through ModelManager")


def _manager() -> ModelManager:
    return get_runtime().models


def _marker(symbol: str, fallback: str) -> str:
    encoding = getattr(console.file, "encoding", None) or "utf-8"
    try:
        symbol.encode(encoding)
    except (LookupError, UnicodeEncodeError):
        return fallback
    return symbol


def _print_doctor(result: dict) -> None:
    labels = {
        "config": "Config",
        "registry": "Registry",
        "providers": "Providers",
        # Kept for the deprecated `nexus models doctor` output contract.
        "current_model": "Current model",
    }
    for key, label in labels.items():
        ok = result["checks"].get(key, False)
        marker = _marker("✓", "OK") if ok else _marker("✗", "FAILED")
        style = "green" if ok else "red"
        console.print(f"[{style}]{marker} {label} {'OK' if ok else 'FAILED'}[/{style}]")
    for warning in result.get("warnings", []):
        console.print(f"[yellow]{_marker('⚠', 'WARNING')} {warning}[/yellow]")
    for model_id, error in result.get("provider_errors", {}).items():
        console.print(f"[red]{model_id}: {error}[/red]")


@models_app.callback(invoke_without_command=True)
def models_main(ctx: typer.Context):
    """Show configured models."""
    if ctx.invoked_subcommand is None:
        manager = _manager()
        if ctx.info_name == "model":
            print_current_model(manager.get_current())
        else:
            asyncio.run(manager.refresh_status())
            print_model_table(manager.list(), current_id=manager.current_id())


@models_app.command("list")
def models_list():
    """List models from the canonical models.yaml registry."""
    manager = _manager()
    asyncio.run(manager.refresh_status())
    print_model_table(manager.list(), current_id=manager.current_id())


@models_app.command("add")
def models_add(
    model_id: str = typer.Option(..., "--id", help="Unique model id"),
    name: str = typer.Option(..., "--name", help="Display name"),
    provider: str = typer.Option(..., "--provider", help="Provider name"),
    model: str = typer.Option(..., "--model", help="Provider model identifier"),
    model_type: str = typer.Option("cloud", "--type", help="cloud or local"),
    capabilities: str = typer.Option("", "--capabilities"),
    context_length: int = typer.Option(0, "--context-length"),
    base_url: str = typer.Option(None, "--base-url"),
    api_key_env: str = typer.Option(None, "--api-key-env"),
):
    """Add a model to models.yaml."""
    entry = ModelManager.build_entry(
        model_id=model_id,
        name=name,
        provider=provider,
        model=model,
        model_type=model_type,
        capabilities=[item.strip() for item in capabilities.split(",") if item.strip()],
        context_length=context_length,
        base_url=base_url,
        api_key_env=api_key_env,
    )
    try:
        _manager().add(entry)
    except ValueError as exc:
        console.print(f"[red]Error: {exc}[/red]")
        raise typer.Exit(1) from exc
    console.print(f"[green]OK Model added: {entry.name} ({entry.id})[/green]")


@models_app.command("remove")
def models_remove(model_id: str = typer.Argument(...)):
    """Remove a model from models.yaml."""
    if not _manager().remove(model_id):
        console.print(f"[red]Model not found: {model_id}[/red]")
        raise typer.Exit(1)
    console.print(f"[green]OK Model removed: {model_id}[/green]")


@models_app.command("test")
def models_test(
    model_id: str = typer.Argument(None),
    prompt: str = typer.Option("Hello", "--prompt"),
):
    """Run a mocked/provider-backed connection and generation test."""
    result = run_async(_manager().test(model_id, prompt))
    if not result.get("ok"):
        console.print(f"[red]FAILED {result.get('error', 'Model test failed')}[/red]")
        raise typer.Exit(1)
    console.print(f"[green]OK {result['model_id']}: connected[/green]")
    if result.get("response"):
        console.print(result["response"])


@models_app.command("use")
def models_use(model_id: str = typer.Argument(...)):
    """Set the active model."""
    try:
        entry = _manager().use(model_id)
    except KeyError as exc:
        console.print(f"[red]Error: {exc}[/red]")
        raise typer.Exit(1) from exc
    console.print(f"[green]OK Active AI model: {entry.name}[/green]")


@models_app.command("current")
def models_current():
    """Show the active model."""
    print_current_model(_manager().get_current())


@models_app.command("info")
def models_info(model_id: str = typer.Argument(...)):
    """Show provider, capabilities, context, and status for one model."""
    from rich.panel import Panel

    entry = _manager().get(model_id)
    if entry is None:
        console.print(f"[red]Model not found: {model_id}[/red]")
        raise typer.Exit(1)
    account = _manager().account_for_model(entry)
    console.print(
        Panel(
            f"ID: {entry.id}\n"
            f"Provider: {account.name if account else entry.provider_name}\n"
            f"Type: {entry.type_name}\n"
            f"Capabilities: {entry.capabilities_text or '—'}\n"
            f"Context: {entry.context_length or 'unknown'}\n"
            f"Status: {entry.status}",
            title=f"[bold cyan]{entry.name}[/bold cyan]",
        )
    )


@models_app.command("doctor")
def models_doctor():
    """Validate config, registry, providers and current model."""
    _print_doctor(_manager().doctor())


@models_app.command("diagnose")
def models_diagnose():
    """Run provider connectivity diagnostics."""
    console.print_json(data=run_async(_manager().diagnose()))


@models_app.command("scan")
def models_scan():
    """Discover models and import them through ModelManager."""
    models = _manager().scan()
    console.print(f"[cyan]Discovered models: {len(models)}[/cyan]")
    print_model_table(models)


@models_app.command("discover")
def models_discover(provider_account: str = typer.Argument(...)):
    """Discover and register models exposed by a provider account."""
    try:
        models = run_async(_manager().discover_and_register_models(provider_account))
    except (KeyError, RuntimeError, ValueError) as exc:
        console.print(f"[red]Discovery failed: {exc}[/red]")
        raise typer.Exit(1) from exc
    print_discovered_models(models)
    console.print(f"[green]OK Catalog models registered: {len(models)}[/green]")


@models_app.command("refresh")
def models_refresh(provider_account: str | None = typer.Argument(None)):
    """Refresh the dynamic model catalog from one or every provider account."""
    try:
        models = run_async(_manager().refresh_catalog(provider_account))
    except (KeyError, RuntimeError, ValueError) as exc:
        console.print(f"[red]Refresh failed: {exc}[/red]")
        raise typer.Exit(1) from exc
    console.print(f"[green]OK Catalog refreshed: {len(models)} model(s)[/green]")
    for account_id, error in _manager().catalog_errors.items():
        console.print(f"[yellow]{account_id}: {error}[/yellow]")
    print_model_table(models, current_id=_manager().current_id())


@models_app.command("registry-list", hidden=True)
def models_registry_list():
    """LEGACY command; now reads the canonical ModelManager registry."""
    console.print("[yellow]Deprecated: use 'nexus models list'.[/yellow]")
    manager = _manager()
    print_model_table(manager.list(), current_id=manager.current_id())


@models_app.command("select")
def models_select():
    """Interactive alias for ModelManager.use()."""
    manager = _manager()
    models = manager.list()
    if not models:
        console.print("[yellow]No models configured[/yellow]")
        return
    for index, entry in enumerate(models, 1):
        console.print(f"{index}. {entry.name} ({entry.id})")
    try:
        choice = int(input("\n> ")) - 1
        entry = manager.use(models[choice].id)
    except (ValueError, IndexError):
        console.print("[red]Wrong choice[/red]")
        raise typer.Exit(1)
    console.print(f"[green]OK Active AI model: {entry.name}[/green]")


@models_app.command("analyze")
def models_analyze():
    """Analyze canonical configured models."""
    for model in _manager().analyze():
        console.print(model)


@models_app.command("recommend")
def models_recommend():
    """Recommend from canonical configured models."""
    for score, model in _manager().recommend():
        console.print(f"{score}/100 {model['name']} ({model['provider']})")
