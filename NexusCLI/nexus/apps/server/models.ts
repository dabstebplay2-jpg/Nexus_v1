import { z } from "zod"
import { endpointSchema, keyEnvSchema, modelPresets } from "../shared/models"
import type { ProbeResponse } from "../shared/protocol"

const inputSchema = z.object({
  baseUrl: endpointSchema,
  apiKeyEnv: keyEnvSchema.optional().default(""),
  presetId: z.string().optional().default("custom"),
  model: z.string().trim().optional(),
})
const listSchema = z.object({ data: z.array(z.object({ id: z.string().min(1) })) })
const chatSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ role: z.literal("assistant"), content: z.string().min(1) }),
        finish_reason: z.enum(["stop", "length"]),
      }),
    )
    .min(1),
})

async function readJson(response: Response) {
  if (!response.body) return undefined
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.length
      if (bytes > 1024 * 1024) return undefined
      parts.push(part.value)
    }
    return JSON.parse(await new Blob(parts).text()) as unknown
  } finally {
    await reader.cancel().catch(() => {})
  }
}

/** Backend failures are diagnostic values, not exceptions escaping into the HTTP 500 handler. */
export async function diagnoseModel(
  input: unknown,
  env: Record<string, string | undefined>,
  chat: boolean,
): Promise<ProbeResponse> {
  const parsed = inputSchema.safeParse(input)
  const result: ProbeResponse = {
    ok: false,
    stage: "config",
    provider: "custom",
    baseUrl: "",
    models: [],
    discovery: "failed",
    keyConfigured: false,
    message: "Invalid provider configuration.",
    suggestion:
      "Use an HTTP loopback or HTTPS API base URL without credentials, query or fragment; put the optional API key in a server environment variable.",
  }
  if (!parsed.success) return result
  const config = parsed.data
  const preset = modelPresets(env).find((item) => item.id === config.presetId)
  result.provider = preset?.id ?? "custom"
  result.baseUrl = config.baseUrl
  const key = config.apiKeyEnv ? env[config.apiKeyEnv] : undefined
  result.keyConfigured = Boolean(key)
  if (preset?.requiresKey && !key) {
    result.message = "This provider requires an API key."
    result.suggestion = "Set the selected environment variable on the Nexus server and restart it."
    return result
  }
  const headers = { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }
  const failHttp = (code: number, stage: "discovery" | "chat") => {
    result.stage = stage
    result.statusCode = code
    result.message = `Backend answered HTTP ${code} during ${stage}.`
    result.suggestion =
      code === 401 || code === 403
        ? "Configure the backend API key in the selected server environment variable, or enable keyless API access in the backend if appropriate."
        : code === 429
          ? "Backend is busy or rate limited. Retry later."
          : "Check the API base URL, model readiness and backend logs."
    return result
  }
  try {
    result.stage = "connect"
    const response = await fetch(`${config.baseUrl}/models`, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    })
    result.statusCode = response.status
    result.stage = "discovery"
    if ([404, 405, 501].includes(response.status)) {
      await response.body?.cancel()
      result.discovery = "unsupported"
      result.message = "Endpoint responds, but model discovery is unavailable."
      result.suggestion = "Check the API base URL. If correct, enter a model ID manually and run Probe."
    } else if (!response.ok) {
      await response.body?.cancel()
      return failHttp(response.status, "discovery")
    } else {
      const listed = listSchema.safeParse(await readJson(response).catch(() => undefined))
      if (!listed.success) {
        result.message = "The models endpoint did not return an OpenAI-compatible model list."
        result.suggestion = "Check the API base URL; this may be a web UI route instead of an API."
        return result
      }
      result.models = [...new Set(listed.data.data.map((item) => item.id))].sort()
      result.discovery = "available"
      result.ok = !chat
      result.message = result.models.length
        ? "Models discovered. Select a model and run Probe."
        : "Backend is reachable, but reports no models."
      result.suggestion = result.models.length
        ? "Discovery does not yet prove that Chat Completions works."
        : "Load or install a model in the backend, then discover again."
    }
    if (!chat) return result
    result.ok = false
    result.stage = "model"
    if (!config.model) {
      result.message = "Select a model before running Probe."
      result.suggestion = "Discover models or enter a manual model ID if discovery is unavailable."
      return result
    }
    if (result.discovery === "available" && !result.models.includes(config.model)) {
      result.message = "Backend is reachable, but the selected model was not found."
      result.suggestion = "Select one of the discovered models, or load the desired model and discover again."
      return result
    }
    result.stage = "chat"
    const completion = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: config.model,
        stream: false,
        max_tokens: 32,
        messages: [{ role: "user", content: "Reply with OK." }],
      }),
    })
    if (!completion.ok) {
      await completion.body?.cancel()
      return failHttp(completion.status, "chat")
    }
    result.statusCode = completion.status
    if (!chatSchema.safeParse(await readJson(completion).catch(() => undefined)).success) {
      result.message = "Chat Completions returned no valid assistant text."
      result.suggestion =
        "Check backend compatibility and model readiness. A successful HTTP status alone is insufficient."
      return result
    }
    result.ok = true
    result.stage = "ready"
    result.message = "Connected: backend returned an LLM response for the selected model."
    result.suggestion =
      result.discovery === "unsupported"
        ? "Discovery is unavailable; the manual model ID passed Chat Completions. Streaming and tool calling depend on the backend/model."
        : "Chat Completions passed. Streaming and tool calling depend on the backend/model and are exercised by a Nexus task."
    return result
  } catch {
    result.ok = false
    result.statusCode = undefined
    result.message =
      result.stage === "chat"
        ? "Chat request failed or timed out."
        : "Cannot connect to the configured endpoint, or the request timed out."
    result.suggestion =
      "Start the backend API server, verify its listening address and port, then retry. Loading a model in a desktop UI alone is not enough. Redirects are not followed."
    return result
  } finally {
    // Never echo backend error bodies. Also remove a key accidentally echoed in model IDs or a URL.
    if (key) {
      result.baseUrl = result.baseUrl.replaceAll(key, "[REDACTED]")
      result.models = result.models.filter((id) => !id.includes(key))
    }
  }
}
