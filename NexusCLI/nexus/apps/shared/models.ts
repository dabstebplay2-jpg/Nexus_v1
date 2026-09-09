import type { Budgets, ModelConfig } from "../../src/domain/types"
import { modelSchema } from "../../src/config/config"
import { z } from "zod"
import type { ModeDescriptor, ModelPreset, ProjectSettings, RunMode } from "./protocol"

/**
 * Model management for the product layer.
 *
 * The core speaks one provider protocol: openai-compatible. OpenAI, Anthropic's compatibility
 * endpoint, Ollama, LM Studio, llama.cpp and vLLM all expose that same protocol, so supporting
 * them is a matter of base URL, key and model name — not a second AI engine. Anything that
 * would need a different wire format is listed as such instead of being faked.
 */
type Preset = Omit<ModelPreset, "keyConfigured">

const presets: Preset[] = [
  {
    id: "unsloth",
    label: "Unsloth Desktop (local)",
    baseUrl: "http://127.0.0.1:8888/v1",
    apiKeyEnv: "UNSLOTH_API_KEY",
    suggestedModels: [],
    requiresKey: false,
    contextLength: 32768,
    note: "Start Studio and load a model. Use its API URL, not the internal llama-server port. Set an API key on the Nexus server if Studio requires authentication.",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    suggestedModels: ["gpt-4.1", "gpt-4o", "o4-mini"],
    requiresKey: true,
    contextLength: 128000,
    note: "Native openai-compatible endpoint.",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    suggestedModels: ["claude-sonnet-4-5", "claude-opus-4-1"],
    requiresKey: true,
    contextLength: 200000,
    note: "Reached through Anthropic's OpenAI-compatible endpoint. The native Messages API needs a separate provider adapter and is not part of v0.2.",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    apiKeyEnv: "NEXUS_API_KEY",
    suggestedModels: ["qwen2.5-coder", "llama3.1", "deepseek-coder-v2"],
    requiresKey: false,
    contextLength: 32768,
    note: "Local server. Tool calling depends on the model you pull.",
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    baseUrl: "http://localhost:1234/v1",
    apiKeyEnv: "NEXUS_API_KEY",
    suggestedModels: ["local-model"],
    requiresKey: false,
    contextLength: 32768,
    note: "Local server. Load a model with tool-calling support.",
  },
  {
    id: "llamacpp",
    label: "llama.cpp server (local)",
    baseUrl: "http://localhost:8080/v1",
    apiKeyEnv: "NEXUS_API_KEY",
    suggestedModels: ["local-model"],
    requiresKey: false,
    contextLength: 32768,
    note: "Start llama-server with a GGUF model and use its listening API URL. A key is optional unless the backend requires one.",
  },
  {
    id: "vllm",
    label: "vLLM (self-hosted)",
    baseUrl: "http://localhost:8000/v1",
    apiKeyEnv: "NEXUS_API_KEY",
    suggestedModels: ["Qwen/Qwen2.5-Coder-32B-Instruct"],
    requiresKey: false,
    contextLength: 32768,
    note: "Self-hosted openai-compatible server.",
  },
  {
    id: "custom",
    label: "Custom endpoint",
    baseUrl: "http://localhost:1234/v1",
    apiKeyEnv: "NEXUS_API_KEY",
    suggestedModels: ["local-model"],
    requiresKey: false,
    contextLength: 32768,
    note: "Any openai-compatible server.",
  },
]

/** Match the Core transport policy; an origin is a convenience shorthand for /v1. */
export const endpointSchema = z
  .string()
  .trim()
  .transform((input, ctx) => {
    try {
      const url = new URL(input)
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        throw new Error()
      if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error()
      url.pathname = url.pathname.replace(/\/+$/, "") || "/v1"
      return url.toString().replace(/\/+$/, "")
    } catch {
      ctx.addIssue({
        code: "custom",
        message:
          "Use an HTTP loopback or HTTPS API base URL without credentials, query or fragment (for example http://127.0.0.1:8888/v1).",
      })
      return z.NEVER
    }
  })

/** Empty means no authentication. Only a variable name is persisted, never its value. */
export const keyEnvSchema = z
  .string()
  .trim()
  .regex(/^$|^[A-Za-z_][A-Za-z0-9_]*$/, "Enter an environment variable name, not an API key")

/**
 * Modes are budgets, not labels. Each one changes how long the agent may work and how much it
 * may spend, which is the only honest difference a product layer can make without touching the
 * Agent Loop.
 */
const modes: ModeDescriptor[] = [
  {
    id: "fast",
    label: "Fast",
    description: "Short leash: few turns, small outputs. For small, well-defined edits.",
    maxTurns: 12,
    maxTools: 40,
    maxOutputTokens: 2048,
    maxDurationMs: 300000,
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "The core defaults. Reasonable for most tasks.",
    maxTurns: 40,
    maxTools: 120,
    maxOutputTokens: 4096,
    maxDurationMs: 1800000,
  },
  {
    id: "deep",
    label: "Deep Reasoning",
    description: "Long leash: many turns and large outputs, for tasks that need real investigation.",
    maxTurns: 80,
    maxTools: 240,
    maxOutputTokens: 8192,
    maxDurationMs: 3600000,
  },
]

export function modeDescriptors() {
  return modes
}
export function budgetsFor(mode: RunMode): Partial<Budgets> {
  const descriptor = modes.find((item) => item.id === mode) ?? modes[1]!
  return {
    maxTurns: descriptor.maxTurns,
    maxTools: descriptor.maxTools,
    maxOutputTokens: descriptor.maxOutputTokens,
    maxDurationMs: descriptor.maxDurationMs,
  }
}
/** Presets plus whether the server actually has each key. The key value itself never leaves. */
export function modelPresets(env: Record<string, string | undefined>): ModelPreset[] {
  return presets.map((preset) => ({ ...preset, keyConfigured: Boolean(env[preset.apiKeyEnv]) }))
}
export function defaultSettings(fallback: ModelConfig): ProjectSettings {
  const preset = presets.find((item) => item.baseUrl === fallback.baseUrl)
  return {
    presetId: preset?.id ?? "custom",
    baseUrl: fallback.baseUrl,
    model: fallback.model,
    apiKeyEnv: fallback.apiKeyEnv,
    contextLength: fallback.capabilities.contextLength,
    mode: "balanced",
    allowChecks: false,
  }
}
/** Validated through the core's own schema, so the product layer cannot smuggle an invalid model in. */
export function modelConfigFor(settings: ProjectSettings, template: ModelConfig): ModelConfig {
  return modelSchema.parse({
    ...template,
    baseUrl: endpointSchema.parse(settings.baseUrl),
    model: settings.model,
    apiKeyEnv: settings.apiKeyEnv,
    capabilities: { ...template.capabilities, contextLength: settings.contextLength },
  })
}
