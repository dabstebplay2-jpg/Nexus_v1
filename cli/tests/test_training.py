from __future__ import annotations

import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from training.dataset import discover_jsonl, validate_jsonl
from training.manager import MANIFEST_SCHEMA, TrainingManager


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def write_dataset(path: Path, *, count: int = 2) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    records = [
        {
            "messages": [
                {"role": "user", "content": f"question {index}"},
                {"role": "assistant", "content": f"answer {index}"},
            ]
        }
        for index in range(count)
    ]
    path.write_text(
        "\n".join(json.dumps(item) for item in records) + "\n",
        encoding="utf-8",
    )
    return path


class Settings:
    def __init__(self, **options):
        self.options = options

    def train_options(self):
        return self.options

    def get(self, _key, default=None):
        return default


class FakeProcess:
    def __init__(self, pid=424242):
        self.pid = pid
        self.return_code = None
        self.signals = []

    def poll(self):
        return self.return_code

    def send_signal(self, value):
        self.signals.append(value)


class FakeRunner:
    def __init__(self, events=None):
        self.events = events if events is not None else []
        self.process = FakeProcess()
        self.popen_calls = []
        self.run_calls = []

    def Popen(self, argv, **kwargs):
        self.events.append("spawn")
        self.popen_calls.append((argv, kwargs))
        return self.process

    def run(self, argv, **kwargs):
        self.run_calls.append((argv, kwargs))
        payload = {
            "python_version": "3.13.15",
            "torch_version": "2.10.0+cu130",
            "cuda_available": True,
            "gpu_name": "NVIDIA GeForce RTX 3060",
            "packages": {"unsloth": "2026.8.19"},
        }
        return SimpleNamespace(
            returncode=0,
            stdout="noise\n__MINICURSOR_DOCTOR__" + json.dumps(payload) + "\n",
            stderr="",
        )


@pytest.fixture
def manager_factory(tmp_path):
    def build(*, settings=None, runner=None):
        project = tmp_path / "project"
        home = tmp_path / "home"
        python = home / "train-env" / "python.exe"
        worker = project / "training" / "worker.py"
        python.parent.mkdir(parents=True, exist_ok=True)
        python.touch()
        worker.parent.mkdir(parents=True, exist_ok=True)
        worker.touch()
        manager = TrainingManager(
            settings or Settings(base_model="cached/base"),
            project_root=project,
            home=home,
            path=python,
            worker_path=worker,
            runner=runner or FakeRunner(),
            now=lambda: datetime(2026, 8, 21, 8, 30, tzinfo=timezone.utc),
        )
        return manager

    return build


def test_validate_strict_conversational_jsonl(tmp_path):
    valid_path = write_dataset(tmp_path / "valid.jsonl")
    valid = validate_jsonl(valid_path)

    assert valid.valid
    assert valid.record_count == 2
    assert valid.errors == ()

    invalid_path = tmp_path / "invalid.jsonl"
    invalid_path.write_text(
        json.dumps(
            {
                "messages": [
                    {"role": "tool", "content": "result"},
                    {"role": "user", "content": "   "},
                ]
            }
        )
        + "\n\n",
        encoding="utf-8",
    )
    invalid = validate_jsonl(invalid_path)

    assert not invalid.valid
    assert invalid.record_count == 1
    assert any("role must be one of" in error for error in invalid.errors)
    assert any("content must be a non-empty string" in error for error in invalid.errors)
    assert any("final message" in error for error in invalid.errors)
    assert any("blank lines" in error for error in invalid.errors)
    assert any("at least 2 records" in error for error in invalid.errors)


def test_discovery_deduplicates_and_assigns_stable_ids(tmp_path):
    write_dataset(tmp_path / "zeta.jsonl")
    write_dataset(tmp_path / "Alpha.jsonl")

    first = discover_jsonl((('one', tmp_path), ('duplicate-root', tmp_path)))
    second = discover_jsonl((('one', tmp_path), ('duplicate-root', tmp_path)))

    assert [(item.id, item.name) for item in first] == [
        ("D1", "Alpha"),
        ("D2", "zeta"),
    ]
    assert [(item.id, item.path) for item in first] == [
        (item.id, item.path) for item in second
    ]


def test_manager_discovers_project_and_unsloth_datasets(manager_factory):
    manager = manager_factory()
    write_dataset(manager.data_root / "project.jsonl")
    write_dataset(manager.unsloth_data_root / "studio.jsonl")

    records = manager.datasets()

    assert {record.source for record in records} == {"project", "Unsloth Studio"}
    assert [record.id for record in records] == ["D1", "D2"]
    assert "Status: READY" in manager.format_datasets()


def test_adapter_discovery_reads_progress_and_resume_safety(manager_factory):
    manager = manager_factory()

    imported = manager.unsloth_outputs_root / "imported-complete"
    write_json(
        imported / "adapter_config.json",
        {
            "base_model_name_or_path": "unsloth/Qwen3.5-9B",
            "peft_type": "LORA",
            "r": 16,
            "lora_alpha": 16,
        },
    )
    (imported / "adapter_model.safetensors").touch()
    write_json(
        imported / "checkpoint-10" / "trainer_state.json",
        {"global_step": 10, "max_steps": 10},
    )
    (imported / "checkpoint-10" / "adapter_config.json").touch()

    run = manager.runs_root / "qlora-incomplete"
    write_json(
        run / "manifest.json",
        {
            "schema": MANIFEST_SCHEMA,
            "run_id": "qlora-incomplete",
            "method": "qlora",
            "load_in_4bit": True,
            "base_model": "cached/base",
            "dataset": "unused.jsonl",
            "training": {},
        },
    )
    write_json(
        run / "checkpoint-5" / "adapter_config.json",
        {"base_model_name_or_path": "cached/base", "peft_type": "LORA", "r": 8},
    )
    (run / "checkpoint-5" / "adapter_model.safetensors").touch()
    write_json(
        run / "checkpoint-5" / "trainer_state.json",
        {"global_step": 5, "max_steps": 10},
    )
    (run / "checkpoint-final").mkdir()

    records = {record.name: record for record in manager.adapters()}

    assert records["imported-complete"].status == "COMPLETE"
    assert records["imported-complete"].imported
    assert not records["imported-complete"].resumable
    assert records["qlora-incomplete"].checkpoint_steps == (5,)
    assert records["qlora-incomplete"].latest_checkpoint.name == "checkpoint-5"
    assert records["qlora-incomplete"].status == "INCOMPLETE"
    assert records["qlora-incomplete"].resumable


def test_plan_is_read_only_and_validates_dataset(manager_factory):
    runner = FakeRunner()
    manager = manager_factory(runner=runner)
    dataset = write_dataset(manager.data_root / "train.jsonl")
    unloaded = []

    before = set(manager.project_root.rglob("*"))
    plan = manager.plan(dataset)
    after = set(manager.project_root.rglob("*"))

    assert plan["ready"]
    assert plan["method"] == "qlora"
    assert plan["load_in_4bit"] is True
    assert plan["dataset"]["record_count"] == 2
    assert before == after
    assert runner.popen_calls == []
    assert runner.run_calls == []
    assert unloaded == []


def test_plan_rejects_gguf_as_training_base(manager_factory):
    manager = manager_factory(settings=Settings(base_model=r"C:\models\base.gguf"))
    dataset = write_dataset(manager.data_root / "train.jsonl")

    plan = manager.plan(dataset)

    assert not plan["ready"]
    assert any("cannot be trained directly" in error for error in plan["errors"])


def test_manager_accepts_validated_settings_manager(tmp_path):
    from config.settings import SettingsManager

    project = tmp_path / "project"
    home = tmp_path / "home"
    python = home / "train-env" / "python.exe"
    worker = project / "training" / "worker.py"
    python.parent.mkdir(parents=True)
    python.touch()
    worker.parent.mkdir(parents=True)
    worker.touch()
    dataset = write_dataset(project / "training" / "data" / "train.jsonl")
    settings = SettingsManager(tmp_path / "settings.json")
    settings.set("train.base_model", "cached/base")
    settings.set("train.dataset", str(dataset))
    manager = TrainingManager(
        settings,
        project_root=project,
        home=home,
        path=python,
        worker_path=worker,
        runner=FakeRunner(),
    )

    plan = manager.plan()

    assert plan["ready"]
    assert plan["base_model"] == "cached/base"
    assert plan["dataset"]["path"] == str(dataset.resolve())
    assert plan["training"]["per_device_train_batch_size"] == 1


def test_start_unloads_first_and_writes_worker_contract(manager_factory):
    events = []
    runner = FakeRunner(events)
    manager = manager_factory(runner=runner)
    dataset = write_dataset(manager.data_root / "train.jsonl")

    result = manager.start(
        dataset,
        confirmed=True,
        unload_callback=lambda: events.append("unload"),
    )

    assert events == ["unload", "spawn"]
    manifest_path = Path(result["run_dir"]) / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["schema"] == MANIFEST_SCHEMA
    assert manifest["method"] == "qlora"
    assert manifest["load_in_4bit"] is True
    assert manifest["base_model"] == "cached/base"
    assert manifest["dataset"] == str(dataset.resolve())
    assert manifest["dataset_sha256"] == hashlib.sha256(dataset.read_bytes()).hexdigest()
    assert manifest["output_dir"] == str(Path(result["run_dir"]))
    assert manifest["state_path"].endswith("state.json")
    assert manifest["resume_from_checkpoint"] is None
    from training.worker import load_manifest, validate_manifest

    worker_spec = validate_manifest(load_manifest(manifest_path))
    assert worker_spec.base_model == "cached/base"
    assert worker_spec.sample_count == 2
    argv, kwargs = runner.popen_calls[0]
    assert argv == [
        str(manager.training_python),
        str(manager.worker_path),
        "--manifest",
        str(manifest_path),
    ]
    assert kwargs["shell"] is False
    assert manager.status()["status"] == "RUNNING"

    with pytest.raises(RuntimeError, match="already active"):
        manager.start(dataset, confirmed=True)


def test_start_requires_confirmation_without_unloading(manager_factory):
    manager = manager_factory()
    dataset = write_dataset(manager.data_root / "train.jsonl")
    unloads = []

    with pytest.raises(RuntimeError, match="Confirm"):
        manager.start(dataset, confirmed=False, unload_callback=lambda: unloads.append(1))

    assert unloads == []
    assert not manager.runs_root.exists()


def test_doctor_uses_isolated_python_subprocess(manager_factory):
    runner = FakeRunner()
    manager = manager_factory(runner=runner)

    info = manager.doctor()

    assert info["available"]
    assert info["gpu_name"] == "NVIDIA GeForce RTX 3060"
    argv, kwargs = runner.run_calls[0]
    assert argv[0] == str(manager.training_python)
    assert argv[1] == "-c"
    assert kwargs["shell"] is False


def test_imported_adapter_resume_is_refused(manager_factory):
    manager = manager_factory()
    imported = manager.unsloth_outputs_root / "imported"
    write_json(imported / "adapter_config.json", {"peft_type": "LORA"})
    (imported / "adapter_model.safetensors").touch()
    write_json(
        imported / "checkpoint-1" / "trainer_state.json",
        {"global_step": 1, "max_steps": 2},
    )

    adapter = manager.adapters()[0]
    plan = manager.plan(resume_ref=adapter)

    assert not plan["ready"]
    assert any("Imported adapters cannot be resumed" in error for error in plan["errors"])
    with pytest.raises(RuntimeError, match="Imported adapters cannot be resumed"):
        manager.resume(adapter, confirmed=True)


def test_resume_uses_latest_numeric_checkpoint(manager_factory):
    runner = FakeRunner()
    manager = manager_factory(runner=runner)
    dataset = write_dataset(manager.data_root / "train.jsonl")
    run = manager.runs_root / "existing-run"
    write_json(
        run / "manifest.json",
        {
            "schema": MANIFEST_SCHEMA,
            "run_id": "existing-run",
            "method": "qlora",
            "load_in_4bit": True,
            "base_model": "cached/base",
            "dataset": str(dataset),
            "dataset_sha256": hashlib.sha256(dataset.read_bytes()).hexdigest(),
            "output_dir": str(run),
            "state_path": str(run / "state.json"),
            "training": {"max_seq_length": 512},
        },
    )
    for step in (2, 10):
        write_json(
            run / f"checkpoint-{step}" / "adapter_config.json",
            {"peft_type": "LORA"},
        )
        write_json(
            run / f"checkpoint-{step}" / "trainer_state.json",
            {"global_step": step, "max_steps": 20},
        )

    adapter = manager.adapters()[0]
    result = manager.resume(adapter, confirmed=True, unload_callback=lambda: None)
    manifest = json.loads((run / "manifest.json").read_text(encoding="utf-8"))

    assert result["status"] == "RUNNING"
    assert manifest["resume_from_checkpoint"].endswith("checkpoint-10")


def test_resume_blocks_a_changed_dataset(manager_factory):
    manager = manager_factory()
    dataset = write_dataset(manager.data_root / "train.jsonl")
    run = manager.runs_root / "changed-run"
    write_json(
        run / "manifest.json",
        {
            "schema": MANIFEST_SCHEMA,
            "run_id": "changed-run",
            "method": "qlora",
            "load_in_4bit": True,
            "base_model": "cached/base",
            "dataset": str(dataset),
            "dataset_sha256": hashlib.sha256(dataset.read_bytes()).hexdigest(),
            "output_dir": str(run),
            "state_path": str(run / "state.json"),
            "training": {"max_seq_length": 512},
        },
    )
    write_json(
        run / "checkpoint-2" / "trainer_state.json",
        {"global_step": 2, "max_steps": 20},
    )
    write_json(
        run / "checkpoint-2" / "adapter_config.json",
        {"peft_type": "LORA"},
    )
    dataset.write_text(
        dataset.read_text(encoding="utf-8").replace("question 0", "changed question"),
        encoding="utf-8",
    )

    plan = manager.plan(resume_ref=manager.adapters()[0])

    assert not plan["ready"]
    assert any("Dataset changed" in error for error in plan["errors"])


def test_export_adapter_uses_converter_argv_without_shell(manager_factory):
    class ExportRunner(FakeRunner):
        def run(self, argv, **kwargs):
            self.run_calls.append((argv, kwargs))
            output = Path(argv[argv.index("--outfile") + 1])
            output.write_bytes(b"GGUF" + b"x" * 2048)
            return SimpleNamespace(returncode=0, stdout="", stderr="")

    runner = ExportRunner()
    manager = manager_factory(runner=runner)
    converter = manager.home / ".unsloth" / "llama.cpp" / "convert_lora_to_gguf.py"
    converter.parent.mkdir(parents=True)
    converter.touch()
    base = manager.home / "base"
    base.mkdir()
    write_json(base / "config.json", {"model_type": "qwen3_5"})
    adapter_dir = manager.runs_root / "exportable"
    write_json(
        adapter_dir / "adapter_config.json",
        {"base_model_name_or_path": str(base), "peft_type": "LORA", "r": 8},
    )
    (adapter_dir / "adapter_model.safetensors").write_bytes(b"adapter")

    result = manager.export_adapter("A1")

    assert Path(result["path"]).is_file()
    argv, kwargs = runner.run_calls[-1]
    assert argv[0] == str(manager.training_python)
    assert "--outfile" in argv
    assert kwargs["shell"] is False


def test_logs_status_completion_and_graceful_stop(manager_factory):
    runner = FakeRunner()
    manager = manager_factory(runner=runner)
    dataset = write_dataset(manager.data_root / "train.jsonl")
    result = manager.start(dataset, confirmed=True)
    run_dir = Path(result["run_dir"])
    (run_dir / "train.log").write_text("one\ntwo\nthree\n", encoding="utf-8")

    assert manager.logs(lines=2) == "two\nthree"
    stopped = manager.stop()
    assert stopped["status"] == "STOPPING"
    assert len(runner.process.signals) == 1

    # Simulate a worker that exits cleanly after processing the graceful signal.
    runner.process.return_code = 0
    completed = manager.status()
    assert completed["status"] == "COMPLETED"
    assert completed["return_code"] == 0
