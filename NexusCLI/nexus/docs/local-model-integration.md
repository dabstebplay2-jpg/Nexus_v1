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

The Web form saves one validated configuration before Discover/Probe. A discovered
ID is selected with a dropdown, with explicit manual input available. Any edit
invalidates the displayed connection status. Unsaved edits and in-flight checks
disable task submission. Reload restores saved settings but does not falsely
restore a previous Connected status.

The existing HTTP provider adapter now accepts an environment map (defaulting to
the real process environment). This small infrastructure change fixes an observed
dependency-injection mismatch: server diagnostics previously used `options.env`,
while task inference always read `process.env`. Both now receive the same map.
Raw backend errors are scrubbed of that exact key before entering Core events.
Agent Core, completion, verification and domain remain unchanged.

## Web tooling

The browser tsconfig already had no `extends`. The warning came from Vite's
esbuild configuration bundler traversing the surrounding upstream tsconfig.
Using Vite's module runner for dev/build/preview isolates config loading without
editing the upstream snapshot or importing Bun types into the browser.

`npm audit` identified Vite 7.1.3 as the one high-severity dependency, including
development-server file-read / filesystem-deny bypass advisories. Updated within
major 7 to 7.3.6; audit then reported zero vulnerabilities. No force upgrade.
The dev server has the exposure; production uses the built static assets served
by the Nexus HTTP server. Playwright is a development-only regression dependency.

## Real validation and limits

On this machine Studio was restarted using its installed CLI:
`unsloth.exe studio --api-only -H 127.0.0.1 -p 8888`.
`GET /v1/models` then returned Ornith with `loaded:false`. Chat returned 400:
no model loaded. Its model-load management route returned 401. No authentication
settings were changed and no credentials were extracted. Thus discovery against
Unsloth itself is proven; inference through the Studio facade is NOT proven.
Load the model through the authenticated Desktop UI before using this preset.

A separate instance of the already installed llama-server was started using the
existing Ornith Q8_0 GGUF, explicit loopback port 8080, context 8192, one slot,
`--gpu-layers 99 --flash-attn off --jinja --reasoning off`. No model was downloaded.
Its `/v1/models` returns the full GGUF filename as the ID; Nexus uses that exact
discovered ID without hardcoding an alias.

Important Windows runtime detail: launching this Unsloth-provided binary outside
Studio initially gave `--list-devices: (none)` and CPU inference. Adding the
installed environment's `Lib/site-packages/torch/lib` to PATH for that child
exposed CUDA0 / RTX 3060. The first coding trial timed out after 110 seconds on
CPU. No Core timeouts were changed to hide this failure.

After CUDA was available:

- Real Chromium discovery, selection, Probe, reload and coding-task submission
  reached Agent Core and streamed its events into the page. Ornith read files,
  edited `a - b` into `a + b`, and passed the protected goal check. It then
  repeatedly called read/verify, exhausted Fast's 12 turns and ended FAILED.
  Run `0b597932-f4f8-450d-99c8-98285eb159f7`. Coding task completion is NOT claimed.
- A minimal informational task used the same real model and product server,
  with a browser `fetch` to create the answer-only task and a real browser
  `EventSource` to consume events. It ended COMPLETED in one turn with verified
  final text `NEXUS_LOCAL_OK`. Run `5edf9107-9b58-4fad-af93-2115c0f286fe`.
  Events included created, model_request, completion and run_finished.
- The ordinary server on port 4319 also passed actual discovery/Probe against
  the same 8080 backend. The existing Nexus_Test_Project configuration now uses
  this discovered model with context 8192 and no key. Its previous registry was
  backed up as `.nexuscli/projects.before-v0.2.1-local-model-fix.json`.

Browser regression commands (run after `bun run web:build`):

```powershell
Set-Location C:\Nexus_History\NexusCLI\nexus\apps\web
npm run test:e2e
# All three tests above use a FAKE backend by default.

# Explicit real-model informational test (backend must already be running):
$env:NEXUS_E2E_BASE_URL = 'http://127.0.0.1:8080/v1'
npm run test:e2e -- --grep 'informational task'
Remove-Item Env:NEXUS_E2E_BASE_URL
```

For a new machine, install the development dependencies and Playwright Chromium
(`npm exec playwright install chromium`) first. Browser fixtures use a temporary
workspace/data directory and port 4321; they do not edit user projects.

Reproduce this machine's standalone backend launch in PowerShell (keep the shell
running; stop this instance before attempting to run another one on port 8080):

```powershell
$runtime = "$env:USERPROFILE\.unsloth\studio\unsloth_studio"
$env:PATH = "$runtime\Lib\site-packages\torch\lib;$env:PATH"
$server = "$env:USERPROFILE\.unsloth\llama.cpp\build\bin\Release\llama-server.exe"
$model = "$env:USERPROFILE\.cache\huggingface\hub\models--ornith-ai--Ornith-1.5-9B-GGUF\snapshots\abdd624b12ebf020b767fff532ff44fe552b28c3\Ornith-1.5-9B-Q8_0.gguf"
& $server --list-devices
& $server -m $model --host 127.0.0.1 --port 8080 --ctx-size 8192 --parallel 1 --gpu-layers 99 --flash-attn off --jinja --reasoning off
```

These are the observed local paths, not required model names or hardcoded product
settings. Any compatible backend/model can be selected through discovery.

## Final regression gate

- `bun run check`: all 7 checks PASS (typecheck, boundaries, 107 tests, bench,
  build, standalone smoke, product smoke).
- `bun test ./test`: 107 pass, 0 fail; all original 81 remain unchanged, plus
  26 local-model cases including preset mapping, editable normalization,
  unsupported discovery, unavailable network, invalid URLs, missing models,
  malformed responses, HTTP errors, optional/required keys, exact secret
  redaction, restart persistence and Core/SSE over actual fixture sockets.
- Browser suite: 3 pass with an explicitly FAKE backend. Separate real
  informational test: 1 pass against Ornith. Real coding test limit is above.
- Web build succeeds without the upstream tsconfig warning; `npm audit`
  reports zero vulnerabilities.

Changed source areas: `apps/shared/{models,projects,protocol}.ts`,
`apps/server/{models,http,index}.ts`, `apps/web/src/{App,api,styles}` and
`components/ModelBar.tsx`; `src/llm/openai-compatible.ts` contains only environment
injection and exact-key error redaction. Test/tooling additions are
`test/local-models.test.ts`, `script/browser-fixture.ts`, Web Playwright config
and specs, Web package/lock and ignored test artifacts. This document records
the findings. Protected Core directories and the upstream reference are unchanged.

For Unsloth use its Studio API address (observed `http://127.0.0.1:8888/v1`),
not its private changing llama-server port. Start Studio, load a model and enable
its API access. If it requires a key, set `UNSLOTH_API_KEY` in the environment
of the Nexus server, then restart Nexus. Authentication is never bypassed.
