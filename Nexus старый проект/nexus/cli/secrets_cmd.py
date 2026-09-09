"""User-facing API secret commands for Nexus OS V2."""

from __future__ import annotations

import typer

from nexus.cli.display import console, print_api_keys
from nexus.cli.provider_wizard import print_key_storage_notice
from nexus.cli.secure_input import read_api_key
from nexus.core.runtime import get_runtime


secret_app = typer.Typer(help="Manage API keys stored by Nexus")


def _manager():
    return get_runtime().models


@secret_app.callback(invoke_without_command=True)
def secret_main(ctx: typer.Context):
    if ctx.invoked_subcommand is None:
        console.print("Use: nexus secret list|add|show|remove")


@secret_app.command("list")
def secret_list():
    manager = _manager()
    items = []
    for account in manager.list_provider_accounts():
        value = manager.accounts.get_api_key(account.id)
        items.append(
            {
                "model_id": account.id,
                "provider": account.provider,
                "configured": value is not None,
                "source": "secure-store" if account.api_key_ref else None,
                "value": manager._mask_api_key(value),
            }
        )
    print_api_keys(items)


@secret_app.command("add")
def secret_add(account_id: str = typer.Argument(...)):
    manager = _manager()
    if manager.accounts.get(account_id) is None:
        console.print(f"[red]AI service not found: {account_id}[/red]")
        raise typer.Exit(1)
    print_key_storage_notice(manager)
    manager.set_provider_api_key(account_id, read_api_key(f"API key for {account_id}: "))
    console.print(f"[green]Secret saved for {account_id}[/green]")


@secret_app.command("show")
def secret_show(account_id: str = typer.Argument(...)):
    manager = _manager()
    try:
        value = manager.accounts.get_api_key(account_id)
    except KeyError as exc:
        console.print(f"[red]AI service not found: {account_id}[/red]")
        raise typer.Exit(1) from exc
    if value is None:
        console.print(f"[yellow]No secret saved for {account_id}[/yellow]")
    else:
        console.print(f"{account_id}: {manager._mask_api_key(value)}")


@secret_app.command("remove")
def secret_remove(account_id: str = typer.Argument(...)):
    manager = _manager()
    try:
        deleted = manager.delete_provider_api_key(account_id)
    except KeyError as exc:
        console.print(f"[red]AI service not found: {account_id}[/red]")
        raise typer.Exit(1) from exc
    if deleted:
        console.print(f"[green]Secret removed for {account_id}[/green]")
    else:
        console.print(f"[yellow]No secret saved for {account_id}[/yellow]")


__all__ = ["secret_app"]
