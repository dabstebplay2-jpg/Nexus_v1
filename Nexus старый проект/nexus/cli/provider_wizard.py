"""Interactive Provider Setup Wizard V8."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from rich.prompt import Prompt

from nexus.cli.display import console, print_discovered_models
from nexus.cli.secure_input import read_api_key
from nexus.models.types import ProviderAccount


@dataclass(frozen=True, slots=True)
class ProviderChoice:
    label: str
    provider: str
    default_id: str
    default_url: str | None = None
    requires_key: bool = True


PROVIDER_CHOICES = (
    ProviderChoice("OpenAI", "openai", "openai"),
    ProviderChoice("Anthropic", "anthropic", "anthropic"),
    ProviderChoice("Gemini", "gemini", "gemini"),
    ProviderChoice("OpenAI Compatible", "openai_compatible", "compatible"),
    ProviderChoice("Ollama", "ollama", "ollama", "http://localhost:11434", False),
    ProviderChoice("LM Studio", "lmstudio", "lmstudio", "http://localhost:1234/v1", False),
)


def print_key_storage_notice(manager, printer=console.print) -> None:
    store = manager.accounts.secrets
    printer("[bold]API key storage:[/bold]")
    printer("\n[bold]Location:[/bold]")
    printer(str(store.storage_location()))
    printer("\n[bold]Encryption:[/bold]")
    printer(f"[cyan]{store.protection_method()}[/cyan]")
    printer("\n[bold]Usage:[/bold]")
    printer("Only Nexus AI provider requests")
    printer(
        "[dim]Nexus не отправляет ключ третьим сторонам и не записывает его в "
        "models.yaml/providers.yaml. Он используется только для запросов к выбранному API.[/dim]"
    )


class ProviderSetupWizard:
    def __init__(
        self,
        manager,
        *,
        ask: Callable[..., str] | None = None,
        secret_reader: Callable[..., str] | None = None,
        printer: Callable[..., None] | None = None,
        model_printer: Callable | None = None,
    ):
        self.manager = manager
        self.ask = ask or Prompt.ask
        self.secret_reader = secret_reader or read_api_key
        self.print = printer or console.print
        self.model_printer = model_printer or print_discovered_models

    def _choose_provider(self) -> ProviderChoice:
        self.print("[bold cyan]Nexus Provider Setup Wizard[/bold cyan]")
        for index, choice in enumerate(PROVIDER_CHOICES, 1):
            self.print(f"  {index}. {choice.label}")
        raw = self.ask("Выберите провайдера", default="1")
        try:
            return PROVIDER_CHOICES[int(raw) - 1]
        except (ValueError, IndexError) as exc:
            raise ValueError("Некорректный выбор провайдера") from exc

    async def run(self) -> dict:
        choice = self._choose_provider()
        account_id = self.ask("ID аккаунта", default=choice.default_id).strip()
        if not account_id or ":" in account_id:
            raise ValueError("ID аккаунта не должен быть пустым или содержать ':'")

        base_url = choice.default_url
        if choice.provider == "openai_compatible":
            base_url = self.ask("Base URL (например https://api.example.com/v1)").strip()
            if not base_url:
                raise ValueError("Base URL обязателен для OpenAI Compatible")
        elif choice.default_url:
            base_url = self.ask("Base URL", default=choice.default_url).strip()

        account = ProviderAccount(
            id=account_id,
            name=f"{choice.label} ({account_id})",
            provider=choice.provider,
            base_url=base_url,
        )
        existing = self.manager.accounts.get(account_id)
        if existing is None:
            self.manager.add_provider_account(account)
        else:
            self.manager.update_provider_account(
                account_id,
                name=account.name,
                provider=account.provider,
                base_url=account.base_url,
            )

        key_saved = False
        if choice.requires_key or choice.provider == "openai_compatible":
            print_key_storage_notice(self.manager, self.print)
            api_key = self.secret_reader("Вставьте API key (Enter — пропустить): ").strip()
            if api_key:
                self.manager.set_provider_api_key(account_id, api_key)
                key_saved = True
                self.print("[green]Ключ сохранен в защищенном хранилище.[/green]")

        self.print("Проверка соединения...")
        connection = await self.manager.test_provider_account(account_id)
        if connection.get("ok"):
            self.print("[green]Соединение установлено.[/green]")
        else:
            self.print(
                f"[yellow]Соединение не установлено: "
                f"{connection.get('error') or connection.get('status')}[/yellow]"
            )

        self.print("Поиск доступных моделей...")
        try:
            models = await self.manager.discover_and_register_models(account_id)
            discovery_error = None
        except Exception as exc:
            models = []
            discovery_error = str(exc)
            self.print(f"[yellow]Discovery завершился с ошибкой: {exc}[/yellow]")
        if models:
            self.model_printer(models)
            self.print(f"[green]Найдено моделей: {len(models)}[/green]")
        else:
            self.print("[yellow]Модели не найдены.[/yellow]")

        return {
            "account": self.manager.accounts.get(account_id),
            "key_saved": key_saved,
            "connection": connection,
            "models": models,
            "discovery_error": discovery_error,
        }


__all__ = [
    "PROVIDER_CHOICES",
    "ProviderChoice",
    "ProviderSetupWizard",
    "print_key_storage_notice",
]
