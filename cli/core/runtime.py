from __future__ import annotations

import json
import shlex
from typing import Any, Callable

from config.settings import SettingsManager
from models.manager import ModelManager
from training.manager import TrainingManager

COMMANDS = (
    "models, load <id>, reload, status, chat, unload, config, train, "
    "adapters, help, exit"
)


def split_command(command: str) -> list[str]:
    """Split a Windows command line while preserving backslashes in paths."""

    lexer = shlex.shlex(command, posix=False)
    lexer.whitespace_split = True
    lexer.commenters = ""
    parts = list(lexer)
    return [
        part[1:-1]
        if len(part) >= 2 and part[0] == part[-1] and part[0] in {'"', "'"}
        else part
        for part in parts
    ]


class MiniCursor:
    def __init__(
        self,
        *,
        models: ModelManager | None = None,
        settings: SettingsManager | None = None,
        training: TrainingManager | None = None,
        input_fn: Callable[[str], str] = input,
        output_fn: Callable[..., None] = print,
    ) -> None:
        self.settings = settings or SettingsManager()
        self.models = models or ModelManager(settings=self.settings)
        self.training = training or TrainingManager(self.settings)
        self.input = input_fn
        self.output = output_fn

    def start(self) -> None:
        self.output("MiniCursor Runtime")
        self.output(f"Commands: {COMMANDS}")
        try:
            running = True
            while running:
                try:
                    command = self.input("> ").strip()
                except EOFError:
                    break
                except KeyboardInterrupt:
                    self.output("")
                    break
                if not command:
                    continue
                running = self.handle_command(command)
        finally:
            self.models.unload()

    def handle_command(self, command: str) -> bool:
        try:
            parts = split_command(command)
        except ValueError as exc:
            self.output(f"Error: invalid quoting ({exc})")
            return True
        if not parts:
            return True
        name = parts[0].lower()
        try:
            if name == "models" and len(parts) == 1:
                self.models.scan()
                self.output(self.models.format_models())
            elif name == "load":
                if len(parts) != 2:
                    raise ValueError("Usage: load <id>")
                try:
                    model_id = int(parts[1])
                except ValueError as exc:
                    raise ValueError("Model id must be an integer") from exc
                self.models.load(model_id, progress=self.output)
                self.output(self.format_status(self.models.status()))
            elif name == "reload" and len(parts) == 1:
                reload_model = getattr(self.models, "reload", None)
                if not callable(reload_model):
                    raise RuntimeError("The active model manager cannot reload")
                reload_model(progress=self.output)
                self.output(self.format_status(self.models.status()))
            elif name == "status" and len(parts) == 1:
                self.output(self.format_status(self.models.status()))
            elif name == "chat" and len(parts) == 1:
                self.chat_mode()
            elif name == "unload" and len(parts) == 1:
                result = self.models.unload()
                if result.get("was_loaded"):
                    freed = result.get("vram_freed_mib")
                    suffix = f" ({freed} MiB VRAM freed)" if freed is not None else ""
                    self.output(f"Model unloaded{suffix}")
                else:
                    self.output("No model is loaded")
            elif name == "config":
                self.handle_config(parts[1:])
            elif name == "train":
                self.handle_train(parts[1:])
            elif name == "adapters" and len(parts) == 1:
                self.output(self.training.format_adapters())
            elif name == "help" and len(parts) == 1:
                self.output(self.help_text())
            elif name == "exit" and len(parts) == 1:
                return False
            else:
                self.output("Unknown command. Type 'help' for available commands.")
        except (RuntimeError, ValueError) as exc:
            self.output(f"Error: {exc}")
        return True

    @staticmethod
    def help_text() -> str:
        return "\n".join(
            [
                f"Commands: {COMMANDS}",
                "  config show [load|generation|chat|train]",
                "  config get <key> | config set <key> <value>",
                "  config reset [key|all] | config profiles",
                "  config profile use|save|delete <name>",
                "  train doctor | train datasets | train validate <D-id|path>",
                "  train plan [D-id|path] | train start [D-id|path] [--dry-run|--yes]",
                "  train adapters | train status | train logs [lines] | train stop",
                "  train resume <A-id> [--dry-run|--yes]",
                "  train export <A-id> [f16|bf16|q8_0] [--use]",
                "Chat commands: /clear, /continue, /exit",
            ]
        )

    def handle_config(self, args: list[str]) -> None:
        if not args or args[0].lower() == "show":
            if len(args) > 2:
                raise ValueError("Usage: config show [load|generation|chat|train]")
            section = args[1] if len(args) == 2 else None
            self.output(self.settings.format(section))
            return

        action = args[0].lower()
        if action == "get" and len(args) == 2:
            value = self.settings.get(args[1])
            self.output(f"{args[1]} = {json.dumps(value, ensure_ascii=False)}")
        elif action == "set" and len(args) >= 3:
            key = args[1]
            raw_value = " ".join(args[2:])
            reload_required = self.settings.set(key, raw_value)
            value = self.settings.get(key)
            self.output(f"Saved: {key} = {json.dumps(value, ensure_ascii=False)}")
            if reload_required and self.models.status().get("loaded"):
                self.output("This load setting will take effect after 'reload'.")
            elif not reload_required:
                self.output("The new value applies to the next response.")
        elif action == "reset" and len(args) <= 2:
            target = args[1] if len(args) == 2 else None
            reload_required = self.settings.reset(
                None if target is None or target.lower() == "all" else target
            )
            self.output("Settings reset")
            if reload_required and self.models.status().get("loaded"):
                self.output("Run 'reload' to apply the reset load settings.")
        elif action in {"profiles", "profile-list"} and len(args) == 1:
            self.output("Profiles: " + ", ".join(self.settings.profile_names()))
        elif action == "profile" and len(args) == 3:
            operation, profile_name = args[1].lower(), args[2]
            if operation == "use":
                reload_required = self.settings.use_profile(profile_name)
                self.output(f"Profile applied: {profile_name}")
                if reload_required and self.models.status().get("loaded"):
                    self.output("Run 'reload' to apply its load settings.")
            elif operation == "save":
                self.settings.save_profile(profile_name)
                self.output(f"Profile saved: {profile_name}")
            elif operation == "delete":
                self.settings.delete_profile(profile_name)
                self.output(f"Profile deleted: {profile_name}")
            else:
                raise ValueError("Usage: config profile use|save|delete <name>")
        else:
            raise ValueError(
                "Usage: config show|get|set|reset|profiles|profile ..."
            )

    @staticmethod
    def format_dataset_validation(result: Any) -> str:
        lines = [
            f"Dataset: {result.path}",
            f"Records: {result.record_count}",
            f"Status: {'READY' if result.valid else 'INVALID'}",
        ]
        lines.extend(f"Error: {error}" for error in result.errors)
        return "\n".join(lines)

    @staticmethod
    def format_training_plan(plan: dict[str, Any]) -> str:
        dataset = plan.get("dataset") or {}
        training = plan.get("training") or {}
        lines = [
            f"Training plan: {'READY' if plan.get('ready') else 'BLOCKED'}",
            f"Mode: {plan.get('mode')}",
            "Method: QLoRA 4-bit (experimental for Qwen3.5-9B on 12 GiB)",
            f"Base: {plan.get('base_model') or 'not configured'}",
            f"Dataset: {dataset.get('path', 'not selected')}",
            f"Records: {dataset.get('record_count', 'unavailable')}",
            f"Sequence length: {training.get('max_seq_length', 'unavailable')}",
            f"Batch / accumulation: "
            f"{training.get('per_device_train_batch_size', 'unavailable')} / "
            f"{training.get('gradient_accumulation_steps', 'unavailable')}",
            f"Epochs / max steps: {training.get('num_train_epochs', 'unavailable')} / "
            f"{training.get('max_steps', 'unavailable')}",
            f"LoRA r / alpha: {training.get('lora_r', 'unavailable')} / "
            f"{training.get('lora_alpha', 'unavailable')}",
        ]
        if plan.get("resume_from_checkpoint"):
            lines.append(f"Resume: {plan['resume_from_checkpoint']}")
        lines.extend(f"Warning: {item}" for item in plan.get("warnings", []))
        lines.extend(f"Error: {item}" for item in plan.get("errors", []))
        return "\n".join(lines)

    def _confirm_training(self) -> bool:
        try:
            answer = self.input(
                "Type YES to start experimental QLoRA and use the GPU: "
            ).strip()
        except (EOFError, KeyboardInterrupt):
            self.output("")
            return False
        return answer == "YES"

    def _unload_for_training(self) -> None:
        status = self.models.status()
        if not status.get("loaded"):
            return
        result = self.models.unload()
        if result.get("was_loaded"):
            freed = result.get("vram_freed_mib")
            suffix = f" ({freed} MiB VRAM freed)" if freed is not None else ""
            self.output(f"Inference model unloaded for training{suffix}")

    @staticmethod
    def _extract_flags(args: list[str]) -> tuple[list[str], bool, bool]:
        dry_run = "--dry-run" in args
        confirmed = "--yes" in args
        positional = [item for item in args if item not in {"--dry-run", "--yes"}]
        return positional, dry_run, confirmed

    def handle_train(self, args: list[str]) -> None:
        if not args:
            self.output(self.settings.format("train"))
            return
        action = args[0].lower()
        rest = args[1:]

        if action == "doctor" and not rest:
            self.output(self.training.format_doctor())
        elif action == "datasets" and not rest:
            self.output(self.training.format_datasets())
        elif action == "validate" and len(rest) == 1:
            self.output(
                self.format_dataset_validation(
                    self.training.validate_dataset(rest[0])
                )
            )
        elif action in {"adapters", "list"} and not rest:
            self.output(self.training.format_adapters())
        elif action == "config" and not rest:
            self.output(self.settings.format("train"))
        elif action == "plan":
            if len(rest) > 1:
                raise ValueError("Usage: train plan [D-id|dataset-path]")
            plan = self.training.plan(rest[0] if rest else None)
            self.output(self.format_training_plan(plan))
        elif action == "start":
            positional, dry_run, confirmed = self._extract_flags(rest)
            if len(positional) > 1:
                raise ValueError(
                    "Usage: train start [D-id|dataset-path] [--dry-run|--yes]"
                )
            dataset_ref = positional[0] if positional else None
            plan = self.training.plan(dataset_ref)
            self.output(self.format_training_plan(plan))
            if dry_run:
                self.output("Dry run only: nothing was created, loaded, or unloaded.")
                return
            if not plan.get("ready"):
                raise RuntimeError("Fix the blocked training plan before starting")
            if not confirmed and not self._confirm_training():
                self.output("Training cancelled; nothing was started.")
                return
            result = self.training.start(
                dataset_ref,
                confirmed=True,
                unload_callback=self._unload_for_training,
            )
            self.output(
                f"Training started: {result.get('run_id')} (PID {result.get('pid')})\n"
                f"Log: {result.get('log')}"
            )
        elif action == "resume":
            positional, dry_run, confirmed = self._extract_flags(rest)
            if len(positional) != 1:
                raise ValueError("Usage: train resume <A-id> [--dry-run|--yes]")
            adapter_ref = positional[0]
            plan = self.training.plan(resume_ref=adapter_ref)
            self.output(self.format_training_plan(plan))
            if dry_run:
                self.output("Dry run only: nothing was created, loaded, or unloaded.")
                return
            if not plan.get("ready"):
                raise RuntimeError("This run cannot be resumed")
            if not confirmed and not self._confirm_training():
                self.output("Resume cancelled; nothing was started.")
                return
            result = self.training.resume(
                adapter_ref,
                confirmed=True,
                unload_callback=self._unload_for_training,
            )
            self.output(
                f"Training resumed: {result.get('run_id')} (PID {result.get('pid')})"
            )
        elif action == "export":
            use_after_export = "--use" in rest
            positional = [item for item in rest if item != "--use"]
            if len(positional) not in {1, 2}:
                raise ValueError(
                    "Usage: train export <A-id> [f16|bf16|q8_0] [--use]"
                )
            result = self.training.export_adapter(
                positional[0], outtype=positional[1] if len(positional) == 2 else "f16"
            )
            self.output(
                f"GGUF LoRA {'already exists' if result.get('cached') else 'exported'}: "
                f"{result['path']} "
                f"({result['size_bytes'] / (1024 ** 2):.2f} MiB)"
            )
            if use_after_export:
                self.settings.set("load.lora_path", result["path"])
                self.output("GGUF LoRA selected in load.lora_path")
                if self.models.status().get("loaded"):
                    self.output("Run 'reload' to activate it.")
        elif action == "status" and not rest:
            self.output(self.training.format_status())
        elif action == "logs":
            if len(rest) > 2:
                raise ValueError("Usage: train logs [run-id] [lines]")
            run_ref: str | None = None
            lines = 60
            if rest:
                if rest[0].isdigit():
                    lines = int(rest[0])
                else:
                    run_ref = rest[0]
            if len(rest) == 2:
                if not rest[1].isdigit():
                    raise ValueError("Log line count must be an integer")
                lines = int(rest[1])
            self.output(self.training.logs(lines=lines, run_ref=run_ref))
        elif action == "stop" and not rest:
            result = self.training.stop()
            self.output(
                f"Graceful stop requested for {result.get('run_id', 'training run')}"
            )
        else:
            raise ValueError("Unknown train command. Type 'help' for usage.")

    def chat_mode(self) -> None:
        if not self.models.status().get("loaded"):
            self.output("Error: load a model before starting chat")
            return

        system_prompt = self.settings.system_prompt()
        messages = [{"role": "system", "content": system_prompt}]
        self.output("Chat started. Use /clear, /continue, or /exit.")
        while True:
            try:
                prompt = self.input("you> ").strip()
            except EOFError:
                self.output("")
                return
            except KeyboardInterrupt:
                self.output("\nGeneration interrupted")
                continue

            if not prompt:
                continue
            if prompt.lower() == "/exit":
                return
            if prompt.lower() == "/clear":
                messages = [{"role": "system", "content": system_prompt}]
                self.output("Chat history cleared")
                continue

            if prompt.lower() == "/continue":
                if not any(item.get("role") == "assistant" for item in messages):
                    self.output("There is no previous answer to continue")
                    continue
                prompt = "Continue exactly where your previous answer stopped."

            messages.append({"role": "user", "content": prompt})
            response_parts: list[str] = []
            self.output("MiniCursor> ", end="", flush=True)
            try:
                for token in self.models.chat(messages):
                    response_parts.append(token)
                    self.output(token, end="", flush=True)
            except KeyboardInterrupt:
                self.output("\nGeneration interrupted")
                messages.pop()
                continue
            except RuntimeError as exc:
                self.output(f"\nError: {exc}")
                messages.pop()
                continue

            self.output("")
            response = "".join(response_parts).strip()
            if response:
                messages.append({"role": "assistant", "content": response})
                finish_reason_fn = getattr(self.models, "finish_reason", None)
                finish_reason = (
                    finish_reason_fn() if callable(finish_reason_fn) else None
                )
                if (
                    finish_reason == "length"
                    and self.settings.get("chat.show_truncation_notice")
                ):
                    self.output(
                        "[Answer reached max_tokens; use /continue or increase "
                        "generation.max_tokens.]"
                    )
            else:
                messages.pop()
                self.output("Error: the model returned an empty response")

    @staticmethod
    def format_status(status: dict[str, Any]) -> str:
        if not status.get("loaded"):
            return "Status: no model loaded"

        gpu_layers = status.get("n_gpu_layers")
        gpu_layers_text = "all" if gpu_layers == -1 else str(gpu_layers)
        delta = status.get("vram_delta_mib")
        delta_text = f"{delta:+} MiB" if delta is not None else "unavailable"
        load_parameters = status.get("load_parameters") or {}
        lines = [
                "Status: READY",
                f"Model: {status.get('model_name')}",
                f"Backend: {status.get('backend')}",
                f"Device: {status.get('device')} ({status.get('gpu_name')})",
                f"Context: {status.get('n_ctx')}",
                f"GPU layers: {gpu_layers_text}",
                f"VRAM change: {delta_text}",
                f"Path: {status.get('model_path')}",
            ]
        if load_parameters:
            lines.extend(
                [
                    f"Batch / micro-batch: {load_parameters.get('n_batch')} / "
                    f"{load_parameters.get('n_ubatch')}",
                    f"Flash attention: {load_parameters.get('flash_attn')}",
                ]
            )
            if load_parameters.get("lora_path"):
                lines.append(
                    f"GGUF LoRA: {load_parameters['lora_path']} "
                    f"(scale {load_parameters.get('lora_scale')})"
                )
        if status.get("reload_required"):
            lines.append("Configuration: reload required")
        return "\n".join(lines)
