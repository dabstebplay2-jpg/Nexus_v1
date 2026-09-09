from pathlib import Path

from nexus.models.manager import ModelManager
from nexus.models.model_router import ModelRouter


def test_model_router_is_separate_from_manager(tmp_path: Path):
    config = tmp_path / "models.yaml"
    config.write_text(
        """
current: qwen
models:
  - id: qwen
    name: Qwen
    provider: ollama
    model: qwen
    type: local
    capabilities: [chat, fast]
    context_length: 4096
  - id: claude
    name: Claude
    provider: anthropic
    model: claude
    type: cloud
    capabilities: [coding, reasoning]
    context_length: 200000
""",
        encoding="utf-8",
    )
    manager = ModelManager(config)
    router = ModelRouter(manager)

    assert router.choose("write Python code").id == "claude"
    assert router.choose("use a fast model").id == "qwen"
    assert manager.current_id() == "qwen"
