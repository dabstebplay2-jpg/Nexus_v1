"""Provider Account CLI for Model Architecture V7."""

from __future__ import annotations

import typer

from nexus.cli.display import console, print_provider_accounts
from nexus.cli.provider_wizard import ProviderSetupWizard, print_key_storage_notice
from nexus.cli.secure_input import read_api_key
from nexus.core.async_utils import run_async
from nexus.core.runtime import get_runtime
from nexus.models.types import ProviderAccount


providers_app = typer.Typer(help="Manage connected AI services and credentials")
provider_app = typer.Typer(help="Connect and configure an AI service")


def _manager():
    return get_runtime().models


@providers_app.callback(invoke_without_command=True)
def providers_main(ctx: typer.Context):
    """List connected AI services."""
    if ctx.invoked_subcommand is None:
        manager = _manager()
        print_provider_accounts(manager.list_provider_accounts(), manager)


@providers_app.command("list")
def providers_list():
    manager = _manager()
    print_provider_accounts(manager.list_provider_accounts(), manager)


@providers_app.command("info")
def providers_info(account_id: str = typer.Argument(...)):
    from rich.panel import Panel

    manager = _manager()
    account = manager.accounts.get(account_id)
    if account is None:
        console.print(f"[red]AI service not found: {account_id}[/red]")
        raise typer.Exit(1)
    key_set = manager.accounts.get_api_key(account.id) is not None
    console.print(
        Panel(
            f"ID: {account.id}\n"
            f"Type: {account.provider}\n"
            f"Endpoint: {account.base_url or 'default'}\n"
            f"Secret: {'configured' if key_set else 'not set'}\n"
            f"Status: {account.status}",
            title=f"[bold cyan]{account.name}[/bold cyan]",
        )
    )


@providers_app.command("add")
def providers_add(
    account_id: str = typer.Option(..., "--id", help="Unique provider account id"),
    provider: str = typer.Option(..., "--provider", help="openai, anthropic, gemini, ollama, or openai_compatible"),
    name: str | None = typer.Option(None, "--name"),
    base_url: str | None = typer.Option(None, "--base-url"),
    api_key_env: str | None = typer.Option(None, "--api-key-env"),
    set_key: bool = typer.Option(False, "--set-key", help="Prompt securely for an API key"),
):
    if set_key:
        print_key_storage_notice(_manager())
        api_key = read_api_key("API key: ")
    else:
        api_key = None
    account = ProviderAccount(
        id=account_id,
        name=name or account_id,
        provider=provider,
        base_url=base_url,
        api_key_env=api_key_env,
    )
    try:
        _manager().add_provider_account(account, api_key=api_key)
    except ValueError as exc:
        console.print(f"[red]Error: {exc}[/red]")
        raise typer.Exit(1) from exc
    console.print(f"[green]OK Provider account added: {account.id}[/green]")


@providers_app.command("test")
def providers_test(account_id: str = typer.Argument(...)):
    result = run_async(_manager().test_provider_account(account_id))
    if not result.get("ok"):
        console.print(f"[red]FAILED {result.get('error') or result.get('status')}[/red]")
        raise typer.Exit(1)
    console.print(f"[green]OK {account_id}: connected[/green]")


@providers_app.command("remove")
def providers_remove(
    account_id: str = typer.Argument(...),
    delete_key: bool = typer.Option(False, "--delete-key"),
):
    if not _manager().remove_provider_account(
        account_id,
        delete_key=delete_key,
        remove_models=True,
    ):
        console.print(f"[red]Provider account not found: {account_id}[/red]")
        raise typer.Exit(1)
    console.print(f"[green]OK Provider account removed: {account_id}[/green]")


@providers_app.command("key-set")
def providers_key_set(account_id: str = typer.Argument(...)):
    print_key_storage_notice(_manager())
    api_key = read_api_key("API key: ")
    _manager().set_provider_api_key(account_id, api_key)
    console.print(f"[green]OK API key saved for {account_id}[/green]")


@providers_app.command("key-delete")
def providers_key_delete(account_id: str = typer.Argument(...)):
    if not _manager().delete_provider_api_key(account_id):
        console.print(f"[yellow]No saved API key for {account_id}[/yellow]")
        return
    console.print(f"[green]OK API key deleted for {account_id}[/green]")


def _run_setup() -> None:
    run_async(ProviderSetupWizard(_manager()).run())


@providers_app.command("setup")
def providers_setup():
    """Run the user-friendly provider setup wizard."""
    _run_setup()


@provider_app.command("setup")
def provider_setup():
    """Run the user-friendly provider setup wizard."""
    _run_setup()


__all__ = ["provider_app", "providers_app"]
