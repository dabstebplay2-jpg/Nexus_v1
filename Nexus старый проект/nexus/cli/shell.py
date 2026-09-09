import asyncio

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.text import Text

from nexus.cli.display import (
    boot_and_status,
    print_agents,
    print_api_keys,
    print_current_model,
    print_discovered_models,
    print_doctor_report,
    print_memory,
    print_model_table,
    print_plugins,
    print_provider_accounts,
    print_status,
    print_task_result,
    print_tools,
)
from nexus.cli.provider_wizard import ProviderSetupWizard, print_key_storage_notice
from nexus.cli.secure_input import read_api_key
from nexus.core.runtime import get_runtime
from nexus.diagnostics.doctor import NexusDoctor
from nexus.models.types import ProviderAccount
from nexus.ui.animations import boot_sequence
from nexus.version import CODENAME, VERSION

console = Console()


def _read_shell_api_key(prompt: str) -> str:
    try:
        return read_api_key(prompt)
    except OSError:
        # Test/captured consoles may deliberately disable stdin. This fallback
        # remains a normal (non-getpass) prompt and therefore keeps paste support.
        return Prompt.ask(prompt)

COMMAND_NAMES = {
    "status",
    "agents",
    "memory",
    "model",
    "models",
    "providers",
    "provider",
    "use",
    "keys",
    "key",
    "secret",
    "system",
    "doctor",
    "plugins",
    "tools",
    "debug",
    "task",
    "help",
    "clear",
    "exit",
    "quit",
}


def _is_bare_command(cmd: str) -> bool:
    return bool(cmd) and not cmd.startswith("/") and cmd.split(maxsplit=1)[0].lower() in COMMAND_NAMES


def _run_orchestra_task(runtime, prompt: str) -> dict:
    """Route shell tasks through the top-level Orchestra runtime."""
    return asyncio.run(runtime.run_task(prompt))

BANNER = f"""
███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗
████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝
██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗
██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║
██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║
╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝

          NEXUS {VERSION.upper()}
       {CODENAME.upper()}
"""


def _handle_key_command(runtime, arg: str) -> None:
    parts = arg.split()
    if not parts:
        console.print("[yellow]Usage: /key set|show|delete <model-id> [--reveal][/yellow]")
        return

    action = parts[0].lower()
    model_id = next((item for item in parts[1:] if not item.startswith("--")), None)
    if not model_id:
        console.print(f"[yellow]Usage: /key {action} <model-id>[/yellow]")
        return

    try:
        if action == "set":
            print_key_storage_notice(runtime.models, console.print)
            api_key = _read_shell_api_key(f"API key for {model_id}: ")
            info = runtime.models.set_api_key(model_id, api_key)
            console.print(
                f"[green]API key saved for {model_id}:[/green] {info['value']}"
            )
        elif action == "show":
            reveal = "--reveal" in parts
            info = runtime.models.api_key_info(model_id, reveal=reveal)
            if not info["configured"]:
                console.print(f"[yellow]API key is not configured for {model_id}[/yellow]")
                return
            label = "API key (revealed)" if reveal else "API key"
            console.print(f"[bold]{label} for {model_id}:[/bold]", Text(info["value"]))
        elif action == "delete":
            if runtime.models.delete_api_key(model_id):
                console.print(f"[green]API key deleted for {model_id}[/green]")
            else:
                console.print(f"[yellow]No saved API key for {model_id}[/yellow]")
        else:
            console.print("[yellow]Usage: /key set|show|delete <model-id> [--reveal][/yellow]")
    except (KeyError, ValueError) as exc:
        console.print(f"[red]{exc}[/red]")


def _handle_model_discovery(runtime, arg: str) -> None:
    parts = arg.split()
    if parts and parts[0].lower() == "refresh":
        account_id = parts[1] if len(parts) == 2 else None
        if len(parts) > 2:
            console.print("[yellow]Usage: /models refresh [provider-account][/yellow]")
            return
        try:
            models = asyncio.run(runtime.models.refresh_catalog(account_id))
        except Exception as exc:
            console.print(f"[red]Model refresh failed: {exc}[/red]")
            return
        console.print(f"[green]Catalog refreshed: {len(models)} model(s)[/green]")
        for account_id, error in runtime.models.catalog_errors.items():
            console.print(f"[yellow]{account_id}: {error}[/yellow]")
        print_model_table(models, current_id=runtime.models.current_id())
        return
    if len(parts) != 2 or parts[0].lower() != "discover":
        console.print("[yellow]Usage: /models discover <provider-account>[/yellow]")
        return
    model_id = parts[1]
    try:
        models = asyncio.run(runtime.models.discover_and_register_models(model_id))
    except Exception as exc:
        console.print(f"[red]Model discovery failed: {exc}[/red]")
        return
    print_discovered_models(models)
    if not models:
        return

    choice = Prompt.ask("Select model number (0 to cancel)", default="0")
    try:
        index = int(choice)
        if index == 0:
            return
        selected = models[index - 1]
    except (ValueError, IndexError):
        console.print("[red]Invalid model number[/red]")
        return

    entry = runtime.models.use(selected.id)
    console.print(
        f"[green]Active AI model:[/green] [bold]{entry.name}[/bold] "
        f"({entry.id}, provider model: {entry.model})"
    )


def _handle_providers(runtime, arg: str) -> None:
    parts = arg.split()
    if not parts or parts[0].lower() == "list":
        print_provider_accounts(runtime.models.list_provider_accounts(), runtime.models)
        return
    action = parts[0].lower()
    try:
        if action == "setup":
            asyncio.run(ProviderSetupWizard(runtime.models).run())
        elif action == "add":
            if len(parts) not in {3, 4}:
                console.print(
                    "[yellow]Usage: /providers add <id> <provider> [base-url][/yellow]"
                )
                return
            account_id, provider = parts[1:3]
            base_url = parts[3] if len(parts) == 4 else None
            api_key = None
            if provider not in {"ollama", "lmstudio"}:
                print_key_storage_notice(runtime.models, console.print)
                api_key = _read_shell_api_key(
                    f"API key for {account_id} (Enter — пропустить): "
                ) or None
            runtime.models.add_provider_account(
                ProviderAccount(
                    id=account_id,
                    name=account_id,
                    provider=provider,
                    base_url=base_url,
                ),
                api_key=api_key,
            )
            console.print(f"[green]Provider account added: {account_id}[/green]")
        elif action == "test" and len(parts) == 2:
            result = asyncio.run(runtime.models.test_provider_account(parts[1]))
            style = "green" if result.get("ok") else "red"
            console.print(f"[{style}]{parts[1]}: {result.get('status')}[/{style}]")
        elif action == "remove" and len(parts) == 2:
            if runtime.models.remove_provider_account(parts[1], delete_key=True):
                console.print(f"[green]Provider account removed: {parts[1]}[/green]")
            else:
                console.print(f"[yellow]Provider account not found: {parts[1]}[/yellow]")
        elif action == "key" and len(parts) == 3 and parts[1].lower() == "set":
            print_key_storage_notice(runtime.models, console.print)
            api_key = _read_shell_api_key(f"API key for {parts[2]}: ")
            runtime.models.set_provider_api_key(parts[2], api_key)
            console.print(f"[green]API key saved for {parts[2]}[/green]")
        else:
            console.print(
                "[yellow]Usage: /providers [setup|list|add <id> <provider> [base-url]|remove <id>|test <id>][/yellow]"
            )
    except (KeyError, ValueError) as exc:
        console.print(f"[red]{exc}[/red]")


def _handle_model(runtime, arg: str) -> None:
    parts = arg.split()
    if not parts:
        print_current_model(runtime.models.get_current())
        return
    action = parts[0].lower()
    try:
        if action == "list" and len(parts) == 1:
            print_model_table(runtime.models.list(), current_id=runtime.models.current_id())
        elif action == "use" and len(parts) == 2:
            entry = runtime.models.use(parts[1])
            console.print(f"[green]✓[/green] Active AI model: [bold]{entry.name}[/bold] ({entry.id})")
        elif action == "discover" and len(parts) == 2:
            models = asyncio.run(runtime.models.discover_and_register_models(parts[1]))
            print_discovered_models(models)
            console.print(f"[green]Discovered: {len(models)} model(s)[/green]")
        elif action == "refresh" and len(parts) in {1, 2}:
            models = asyncio.run(
                runtime.models.refresh_catalog(parts[1] if len(parts) == 2 else None)
            )
            print_model_table(models, current_id=runtime.models.current_id())
            for account_id, error in runtime.models.catalog_errors.items():
                console.print(f"[yellow]{account_id}: {error}[/yellow]")
        elif action == "info" and len(parts) == 2:
            entry = runtime.models.get(parts[1])
            if entry is None:
                raise KeyError(f"Model not found: {parts[1]}")
            account = runtime.models.account_for_model(entry)
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
        else:
            console.print(
                "[yellow]Usage: /model [list|use <id>|discover <provider>|refresh [provider]|info <id>][/yellow]"
            )
    except (KeyError, ValueError, RuntimeError) as exc:
        console.print(f"[red]{exc}[/red]")


def _handle_provider(runtime, arg: str) -> None:
    parts = arg.split()
    if not parts:
        console.print("[cyan]/provider[/cyan] — подключение и настройка AI сервисов")
        console.print("[dim]list · setup · add · test · remove · info[/dim]")
        return
    if parts[0].lower() == "info" and len(parts) == 2:
        account = runtime.models.accounts.get(parts[1])
        if account is None:
            console.print(f"[red]AI service not found: {parts[1]}[/red]")
            return
        key_set = runtime.models.accounts.get_api_key(account.id) is not None
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
        return
    _handle_providers(runtime, arg)


def _handle_secret(runtime, arg: str) -> None:
    parts = arg.split()
    if not parts:
        console.print("[cyan]/secret[/cyan] — управление API ключами")
        console.print("[dim]list · add <provider> · show <provider> · remove <provider>[/dim]")
        return
    action = parts[0].lower()
    if action == "list" and len(parts) == 1:
        items = []
        for account in runtime.models.list_provider_accounts():
            key = runtime.models.accounts.get_api_key(account.id)
            items.append(
                {
                    "model_id": account.id,
                    "provider": account.provider,
                    "configured": key is not None,
                    "source": "secure-store" if account.api_key_ref else (f"environment:{account.api_key_env}" if account.api_key_env else None),
                    "value": runtime.models._mask_api_key(key),
                }
            )
        print_api_keys(items)
        return
    if len(parts) != 2:
        console.print("[yellow]Usage: /secret list|add <provider>|show <provider>|remove <provider>[/yellow]")
        return
    account = runtime.models.accounts.get(parts[1])
    if account is None:
        console.print(f"[red]AI service not found: {parts[1]}[/red]")
        return
    try:
        if action == "add":
            print_key_storage_notice(runtime.models, console.print)
            key = _read_shell_api_key(f"API key for {account.id}: ")
            runtime.models.set_provider_api_key(account.id, key)
            console.print(f"[green]Secret saved for {account.id}[/green]")
        elif action == "show":
            key = runtime.models.accounts.get_api_key(account.id)
            if key is None:
                console.print(f"[yellow]No secret saved for {account.id}[/yellow]")
            else:
                console.print(f"{account.id}: {runtime.models._mask_api_key(key)}")
        elif action == "remove":
            if runtime.models.delete_provider_api_key(account.id):
                console.print(f"[green]Secret removed for {account.id}[/green]")
            else:
                console.print(f"[yellow]No secret saved for {account.id}[/yellow]")
        else:
            console.print("[yellow]Usage: /secret list|add <provider>|show <provider>|remove <provider>[/yellow]")
    except (KeyError, ValueError) as exc:
        console.print(f"[red]{exc}[/red]")


def _handle_task(runtime, arg: str) -> None:
    command = arg.strip()
    if not command:
        console.print("[yellow]Usage: /task <description>|history|status|cancel[/yellow]")
    elif command == "history":
        history = runtime.tasks.history()
        if not history:
            console.print("[dim]Task history is empty.[/dim]")
        for item in history:
            console.print(f"{item['id'][:8]}  {item['status']:<16} {item['prompt']}")
    elif command == "status":
        current = runtime.tasks.current()
        if current is None:
            console.print("[dim]No active tasks.[/dim]")
        else:
            console.print(f"{current.id}  {current.status}  {current.context.get('prompt')}")
    elif command == "cancel":
        if runtime.tasks.cancel():
            console.print("[yellow]Cancellation requested.[/yellow]")
        else:
            console.print("[dim]No cancellable task.[/dim]")
    else:
        result = _run_orchestra_task(runtime, command)
        print_task_result(result)


def _handle_system(runtime, arg: str) -> None:
    action = arg.strip().lower() or "status"
    asyncio.run(runtime.boot())
    if action == "status":
        print_status(runtime.status())
    elif action == "agents":
        print_agents(runtime)
    elif action == "tools":
        print_tools(runtime)
    elif action == "memory":
        print_memory(runtime.memory.stats())
    else:
        console.print("[yellow]Usage: /system status|agents|tools|memory[/yellow]")


def _print_help_v2() -> None:
    console.print(
        "\n[bold cyan]Nexus OS V2 Commands[/bold cyan]\n\n"
        "  [cyan]/model[/cyan]     — управление AI моделями\n"
        "  [cyan]/provider[/cyan]  — подключение и настройка AI сервисов\n"
        "  [cyan]/secret[/cyan]    — управление API ключами\n"
        "  [cyan]/task[/cyan]      — запуск автономной AI команды\n"
        "  [cyan]/doctor[/cyan]    — диагностика Nexus\n"
        "  [cyan]/system[/cyan]    — состояние ядра системы\n"
        "  [cyan]/agents[/cyan] · [cyan]/tools[/cyan] · [cyan]/memory[/cyan] · [cyan]/plugins[/cyan]\n"
        "  [cyan]/debug[/cyan] · [cyan]/clear[/cyan] · [cyan]/exit[/cyan]\n\n"
        "[dim]Используйте /model, /provider, /secret, /task или /system без аргументов для подсказки.[/dim]"
    )


def _handle_command(cmd: str) -> bool:
    if not cmd.startswith("/"):
        return False
    runtime = get_runtime()
    parts = cmd.split(maxsplit=1)
    name = parts[0][1:].lower()
    arg = parts[1] if len(parts) > 1 else ""

    if name == "help":
        _print_help_v2()
    elif name == "model":
        asyncio.run(runtime.boot())
        _handle_model(runtime, arg)
    elif name == "provider":
        asyncio.run(runtime.boot())
        _handle_provider(runtime, arg)
    elif name == "secret":
        asyncio.run(runtime.boot())
        _handle_secret(runtime, arg)
    elif name == "task":
        _handle_task(runtime, arg)
    elif name == "system":
        _handle_system(runtime, arg)
    elif name == "doctor":
        asyncio.run(runtime.boot())
        print_doctor_report(NexusDoctor(runtime).run())
    elif name == "agents":
        _handle_system(runtime, "agents")
    elif name == "tools":
        _handle_system(runtime, "tools")
    elif name == "memory":
        _handle_system(runtime, "memory")
    elif name == "plugins":
        asyncio.run(runtime.boot())
        print_plugins(runtime.plugins.list())
    elif name == "debug":
        asyncio.run(runtime.boot())
        console.print({
            "events": runtime.events.count(),
            "activity": runtime.activity_api.snapshot(),
            "tasks": len(runtime.tasks.list()),
            "changes": runtime.changes.summary(),
            "models": runtime.models.summary(),
            "project": runtime.project_context.to_dict() if runtime.project_context else None,
        })
    elif name == "models":
        console.print("[dim]Deprecated: use /model.[/dim]")
        if arg:
            _handle_model_discovery(runtime, arg)
        else:
            _handle_model(runtime, "list")
    elif name == "providers":
        console.print("[dim]Deprecated: use /provider.[/dim]")
        _handle_providers(runtime, arg)
    elif name == "use":
        console.print("[dim]Deprecated: use /model use <id>.[/dim]")
        _handle_model(runtime, f"use {arg}" if arg else "use")
    elif name == "keys":
        console.print("[dim]Deprecated: use /secret list.[/dim]")
        _handle_secret(runtime, "list")
    elif name == "key":
        console.print("[dim]Deprecated: use /secret.[/dim]")
        _handle_key_command(runtime, arg)
    elif name == "status":
        console.print("[dim]Deprecated: use /system status.[/dim]")
        _handle_system(runtime, "status")
    else:
        return False
    return True


from nexus.chat.engine import ChatEngine


def start_shell():
    runtime = get_runtime()
    console.clear()
    boot_sequence()
    console.print(Panel(BANNER, border_style="cyan"))

    status = asyncio.run(boot_and_status(runtime))
    current = runtime.models.get_current()
    current_label = current.name if current else "none"

    console.print(
        f"[green]Kernel:[/green] {status['kernel']}  "
        f"[green]Agents:[/green] {status['agents']}  "
        f"[green]Memory:[/green] {status['memory']}  "
        f"[green]Tools:[/green] {status['tools']}"
    )
    console.print(f"[bold cyan]AI model:[/bold cyan] {current_label}")
    console.print("[dim]Commands: /model  /provider  /secret  /task  /system  /help  /exit[/dim]")
    console.print("[green]Nexus ready.[/green]")

    while True:
        try:
            cmd = Prompt.ask("[bold cyan]nexus>[/bold cyan]").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\nBye")
            break

        if not cmd:
            continue
        if cmd in ("/exit", "/quit"):
            break
        if cmd == "/help":
            _print_help_v2()
        elif cmd == "/clear":
            console.clear()
        elif cmd.startswith("/"):
            if not _handle_command(cmd):
                console.print(f"[red]Unknown command:[/red] {cmd.split()[0]}")
        elif _is_bare_command(cmd):
            console.print("[yellow]Commands must start with '/'. Try /help.[/yellow]")
        else:

            engine = ChatEngine(runtime)

            answer = asyncio.run(
                engine.ask(cmd)
            )

            console.print()

            console.print(
                "[cyan]Nexus:[/cyan]"
            )

            console.print(
                answer
            )
