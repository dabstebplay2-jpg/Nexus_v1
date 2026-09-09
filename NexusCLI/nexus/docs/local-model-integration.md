# Local model integration — v0.2.1

## Observed root cause (Windows, 2026-09-09)

The actual checkout is `C:\Nexus_History\NexusCLI\nexus`, inside the Git root
`C:\Nexus_History`. Its starting branch was `nexus-v0.2`, HEAD
`62117aa63fc6bca329e8417f2f771e0e4c5ede25`; the working tree was clean.
Only the own Nexus package is changed, not the surrounding OpenCode reference.

The saved project's provider was `lmstudio`, endpoint `http://localhost:1234/v1`,
model `ornith-ai/Ornith-1.5-9B-GGUF`. Global `.nexuscli/config.json` instead had
`http://127.0.0.1:8888/v1`. Global configuration initializes new projects; persisted
project settings are authoritative for existing projects and are passed to Core.
There was no listener on 1234. Calling the original router reproduced HTTP 500:
`Unable to connect. Is the computer able to access the url?`

The old Probe only fetched `<baseUrl>/models`. A rejected fetch escaped to the
generic router catch (untyped error -> HTTP 500). Non-2xx or an invalid model list
became CONFIG -> HTTP 400. No chat request or selected-model validation happened.
The UI hid the URL in a button tooltip, exposed no endpoint/key editor, and used a
text input/datalist containing hardcoded suggestions plus results from Probe.
Per-keystroke persistence also made partial settings and racing requests possible.

Original preset URLs: LM Studio and Custom `http://localhost:1234/v1`, Ollama
`http://localhost:11434/v1`, llama.cpp `http://localhost:8080/v1`, vLLM
`http://localhost:8000/v1`. They are defaults, not detected running services.

Installed Unsloth Desktop is `0.1.806-beta`. Local installed code registers the
inference router under `/v1` with `/models` and `/chat/completions`. Its logs show
Studio bound to `127.0.0.1:8888`, Ornith Q8_0 loaded by an internal llama-server
on dynamic port 56686 (a previous run used 61422). The last original server log
ends in graceful shutdown at 21:33 Moscow time. At initial inspection no Unsloth,
Python or llama-server process/listener remained. Ollama on 11434 was running and
returned `qwen2.5:0.5b`. Loading a model earlier does not imply a current API server.

## Product contract

Preset -> editable normalized API base URL -> optional server environment-variable
name -> discovered model ID -> saved project settings -> modelConfigFor -> NexusAPI.
An origin-only URL gets `/v1`; explicit API paths are preserved. HTTP is loopback
only; remote endpoints require HTTPS, matching the Core transport policy. URL
credentials, query strings and fragments are rejected. Blank key variable means
no Authorization header. Keys are not sent to the browser or persisted in projects.

`POST /api/models/discover` and `/api/models/probe` accept `baseUrl`, `presetId`,
`apiKeyEnv`, and (for Probe) `model`. Diagnostic failures return HTTP 200 with
`ok:false`, `stage`, `baseUrl`, `provider`, optional upstream `statusCode`,
`message`, `suggestion`, `models`, `discovery`, and `keyConfigured`. Invalid JSON
also produces a configuration diagnostic. Backend bodies/exceptions are never
echoed; redirects are rejected; requests and response bodies are bounded.

Discovery validates `/models`. 404/405/501 permit explicit manual fallback;
authentication, invalid JSON and transport failures remain distinguishable.
Probe validates model membership when discovery is available, then sends a
32-token non-streaming Chat Completions request and checks for assistant text.
This proves basic inference, not tool-calling quality or task completion.

For Unsloth use its Studio API address (observed `http://127.0.0.1:8888/v1`),
not its private changing llama-server port. Start Studio, load a model and enable
its API access. If it requires a key, set `UNSLOTH_API_KEY` in the environment
of the Nexus server, then restart Nexus. Authentication is never bypassed.
