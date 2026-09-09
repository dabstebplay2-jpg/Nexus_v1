# MiniCursor

Local CUDA GGUF chat and isolated QLoRA training for Windows/NVIDIA.

## Inference setup

Run from the project directory in PowerShell or CMD:

```powershell
uv python install 3.12
uv venv --python 3.12 .venv
uv pip install --python .venv\Scripts\python.exe -r requirements.txt
.venv\Scripts\python.exe scripts\prepare_windows_cuda.py
```

`requirements.txt` pins `llama-cpp-python==0.3.35` from the official CUDA
12.4 wheel repository and forbids a source-build fallback. The preparation
step installs the AVX2 `ggml-cpu.dll` from the matching official CPU wheel;
this is needed by the Ryzen 5 5600 while CUDA still performs the model work.

Start MiniCursor with:

```cmd
start.bat
```

or:

```cmd
.venv\Scripts\python.exe minicursor.py
```

## Inference commands

```text
models
load 1
status
chat
unload
exit
```

Inside chat, `/clear` clears in-memory history, `/continue` continues an answer
that reached its token limit, and `/exit` returns to the main prompt.

Settings are validated and persisted atomically in `config/settings.json`:

```text
config show
config show generation
config get generation.temperature
config set generation.temperature 0.4
config set generation.max_tokens 6144
config set chat.system_prompt "Ты локальный помощник по программированию."
config profiles
config profile use precise
config profile save my-coding
config reset generation.temperature
```

Generation settings apply to the next reply. Load settings are marked
`[reload]` and require `reload` when a model is active:

```text
config set load.n_ctx 16384
config set load.n_batch 512
config set load.n_ubatch 256
config set load.flash_attn true
config set load.n_threads 8
reload
```

The configurable llama.cpp fields include context, GPU layers, batch sizes,
threads, flash attention, K/Q/V offload, mmap/mlock, seed, KV types, chat
format, verbosity, and a GGUF LoRA path/scale. Sampling includes token limit,
temperature, top-p/top-k/min-p/typical-p, penalties, TFS, Mirostat, seed, and
stop strings. CPU-only loading remains disabled: `load.n_gpu_layers` must be
`-1` or a positive number.

A llama.cpp LoRA must already be converted to GGUF:

```text
config set load.lora_path "C:\models\adapter.gguf"
config set load.lora_scale 1.0
reload
```

PEFT `adapter_model.safetensors` files created by training are listed by
`adapters`; they cannot be passed directly to llama.cpp. Convert and select one
from MiniCursor with:

```text
train export A1 f16 --use
reload
```

The converter uses the locally cached Transformers base and writes a GGUF LoRA
beside the PEFT adapter. Automatic downloads during export are disabled.

## Training runtime

Training is deliberately isolated from `.venv`, so PyTorch/Unsloth cannot
replace the tested llama.cpp CUDA libraries. MiniCursor first uses
`.venv-train`; if it is absent, it uses the installed Unsloth Studio runtime.
On this machine the Studio runtime is already present and verified.

To create the optional project-local training environment:

```powershell
uv venv --python 3.12 .venv-train
uv pip install --python .venv-train\Scripts\python.exe -r requirements-train.txt
```

Verify it from MiniCursor:

```text
train doctor
```

## Training data and commands

Training accepts UTF-8 JSONL with at least two conversations. Every line must
end in a non-empty assistant message:

```json
{"messages":[{"role":"user","content":"Напиши функцию суммы."},{"role":"assistant","content":"def add(a, b): return a + b"}]}
```

Place files under `training/data`, or use an absolute quoted path. The existing
Unsloth Studio upload directory is scanned too.

```text
train datasets
train validate D5
train config
config set train.dataset D5
config set train.max_seq_length 1024
config set train.batch_size 1
config set train.gradient_accumulation_steps 8
config set train.learning_rate 0.00002
config set train.epochs 1
config set train.lora_r 16
config set train.lora_alpha 16
```

Always inspect a read-only plan first:

```text
train plan D5
train start D5 --dry-run
```

`--dry-run` does not create a run, start a process, load CUDA, download a
model, or unload the active GGUF. A real launch asks for `YES`; scripts may use
the explicit `--yes` flag:

```text
train start D5
train status
train logs 80
train stop
train adapters
train resume A1 --dry-run
train export A1 f16 --use
```

Before a real start/resume, MiniCursor unloads llama.cpp, checks the isolated
CUDA runtime, requires at least 8000 MiB free VRAM and 5 GiB free disk, then
starts one background worker. Runs are saved below
`training/runs/<run-id>` with a validated manifest, atomic state, log,
checkpoints, tokenizer, and final PEFT adapter. Stop requests are graceful;
checkpoints are not deleted.

The GGUF file itself is not trainable. Training uses the cached Transformers
base `unsloth/Qwen3.5-9B`, 4-bit QLoRA, LoRA target projections, assistant-only
loss, CUDA, and no CPU fallback. Qwen3.5-9B QLoRA on a 12 GiB RTX 3060 is
presented as experimental; full fine-tuning and ordinary bf16 LoRA are not
offered by this runtime.

## Verification

Run the offline unit suite and the GGUF CUDA smoke test:

```powershell
.venv\Scripts\python.exe -m pytest -q
.venv\Scripts\python.exe tests\hardware_smoke.py
```

The implemented training worker was also verified for one real QLoRA step on
the local RTX 3060. Its reproducible manifest, log, checkpoint, and adapter are
under `training/runs/hardware-smoke`. That adapter was exported to GGUF LoRA,
loaded together with the Q5_K_XL base by llama.cpp, answered a prompt, and was
unloaded successfully.
