import { z } from "zod"
import type { Budgets, ModelConfig } from "../domain/types"

export const modelSchema = z.object({
  provider: z.literal("openai-compatible").default("openai-compatible"),
  baseUrl: z.url().default("http://localhost:1234/v1"),
  model: z.string().min(1).default("local-model"),
  apiKeyEnv: z.string().default("NEXUS_API_KEY"),
  capabilities: z
    .object({
      toolCalling: z.boolean().default(true),
      streaming: z.boolean().default(true),
      structuredOutput: z.boolean().default(false),
      reasoning: z.boolean().default(false),
      vision: z.boolean().default(false),
      parallelTools: z.boolean().default(false),
      contextLength: z.number().int().min(4096).default(32768),
    })
    .prefault({}),
})
export const configSchema = z.object({ model: modelSchema.prefault({}) })
export const defaultBudgets: Budgets = {
  maxTurns: 40,
  maxTools: 120,
  maxDurationMs: 1800000,
  maxOutputTokens: 4096,
  toolTimeoutMs: 120000,
  providerTimeoutMs: 120000,
}
export async function loadConfig(filename: string): Promise<{ model: ModelConfig }> {
  const config = configSchema.parse((await Bun.file(filename).exists()) ? await Bun.file(filename).json() : {})
  return {
    model: modelSchema.parse({
      ...config.model,
      ...(process.env.NEXUS_BASE_URL ? { baseUrl: process.env.NEXUS_BASE_URL } : {}),
      ...(process.env.NEXUS_MODEL ? { model: process.env.NEXUS_MODEL } : {}),
    }),
  }
}
