import { z } from "zod"
import type { AgentSession, Capability, EvidenceKind, Risk, Verdict } from "../domain/types"
import type { Store, ToolSpec } from "../domain/ports"
import { NexusError } from "../shared/errors"

export type ToolContext = {
  session: AgentSession
  store: Store
  signal: AbortSignal
  actionId: string
  waiting: () => void
}
export type ToolResult = {
  output: string
  kind?: EvidenceKind
  verdict?: Verdict
  metadata?: Record<string, unknown>
  beforeHash?: string
  afterHash?: string
}
export type Tool = {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly inputSchema: z.ZodType
  readonly outputSchema: z.ZodType<ToolResult>
  readonly risk: Risk
  readonly sideEffect: boolean
  readonly idempotency: "read" | "conditional" | "unsafe"
  readonly timeout: number
  readonly permissions: (input: unknown) => Capability[]
  readonly execute: (input: unknown, context: ToolContext) => Promise<ToolResult>
}
const resultSchema = z.object({
  output: z.string(),
  kind: z
    .enum([
      "TEST_RESULT",
      "BUILD_RESULT",
      "LINT_RESULT",
      "TYPECHECK_RESULT",
      "COMMAND_RESULT",
      "FILE_ASSERTION",
      "FILE_CHANGE",
      "GIT_DIFF",
      "RUNTIME_CHECK",
      "HTTP_CHECK",
      "PROCESS_CHECK",
      "MANUAL_ASSERTION",
      "GOAL_ASSERTION",
    ])
    .optional(),
  verdict: z.enum(["pass", "fail", "unknown"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  beforeHash: z.string().optional(),
  afterHash: z.string().optional(),
})
export function defineTool<I extends z.ZodType>(definition: {
  name: string
  description: string
  input: I
  risk?: Risk
  sideEffect?: boolean
  idempotency?: Tool["idempotency"]
  permissions?: Capability[] | ((input: z.infer<I>) => Capability[])
  execute: (input: z.infer<I>, context: ToolContext) => Promise<ToolResult>
}): Tool {
  return Object.freeze({
    name: definition.name,
    version: "1",
    description: definition.description,
    inputSchema: definition.input,
    outputSchema: resultSchema,
    risk: definition.risk ?? "low",
    sideEffect: definition.sideEffect ?? false,
    idempotency: definition.idempotency ?? "read",
    timeout: 120000,
    permissions: (input: unknown) =>
      typeof definition.permissions === "function"
        ? definition.permissions(definition.input.parse(input))
        : (definition.permissions ?? ["READ"]),
    execute: async (input: unknown, context: ToolContext) =>
      resultSchema.parse(await definition.execute(definition.input.parse(input), context)),
  })
}
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>()
  register(tool: Tool) {
    this.tools.set(tool.name, tool)
  }
  capture() {
    const snapshot = new Map(this.tools)
    return {
      specs: [...snapshot.values()].map(
        (tool): ToolSpec => ({
          name: tool.name,
          description: tool.description,
          parameters: z.toJSONSchema(tool.inputSchema, { io: "input" }),
        }),
      ),
      resolve: (name: string) => {
        const tool = snapshot.get(name)
        if (!tool) throw new NexusError("UNKNOWN_TOOL", `Unknown tool ${name}`)
        if (this.tools.get(name) !== tool)
          throw new NexusError("STALE_TOOL", `Tool ${name} changed since the provider turn started`)
        return tool
      },
    }
  }
}
