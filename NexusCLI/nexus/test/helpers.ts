import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import type { ModelEvent, ModelRequest, Provider } from "../src/domain/ports"
import type { Check } from "../src/domain/types"
import { modelSchema } from "../src/config/config"
import { createNexus } from "../src/composition"

export const model = modelSchema.parse({ model: "deterministic-test", capabilities: { contextLength: 64000 } })
export const goalCheck: Check = {
  id: "goal",
  description: "Original addition scenario",
  kind: "GOAL_ASSERTION",
  argv: [process.execPath, "scenario.ts"],
  timeoutMs: 5000,
}
export class ScriptedProvider implements Provider {
  readonly requests: ModelRequest[] = []
  constructor(private readonly script: (request: ModelRequest, turn: number) => Promise<ModelEvent[]> | ModelEvent[]) {}
  async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
    this.requests.push(request)
    for (const event of await this.script(request, this.requests.length)) yield event
  }
}
export const answer = (text = "Checked the result."): ModelEvent[] => [{ type: "text", text }, { type: "finish" }]
export const call = (name: string, args: unknown, id = crypto.randomUUID()): ModelEvent[] => [
  { type: "tool", call: { id, name, arguments: args } },
  { type: "finish" },
]
export const brokenAdd = "export const add = (a: number, b: number) => a - b\n"
export const plainScenario = 'import { add } from "./add"; if (add(2, 3) !== 5) process.exit(1)\n'

/** Fixture with an explicit workspace file set, for regression scenarios that need custom harnesses. */
export async function fixtureWith(
  tree: Record<string, string>,
  script: ConstructorParameters<typeof ScriptedProvider>[0],
  rules: Parameters<typeof createNexus>[0]["rules"] = { RUN_TESTS: "allow" },
) {
  const root = await mkdtemp(path.join(tmpdir(), "nexus-test-"))
  const workspace = path.join(root, "project")
  for (const [file, content] of Object.entries(tree)) await Bun.write(path.join(workspace, file), content)
  const provider = new ScriptedProvider(script)
  const api = await createNexus({ dataDir: path.join(root, "data"), provider, rules })
  return {
    root,
    workspace,
    provider,
    api,
    cleanup: async () => {
      api.close()
      // Bun's Windows file/query wrappers can retain handles until GC; release before deleting fixtures.
      Bun.gc(true)
      if (!root.startsWith(path.join(tmpdir(), "nexus-test-"))) throw new Error("Unsafe fixture cleanup path")
      await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 })
    },
  }
}
export function fixture(
  script: ConstructorParameters<typeof ScriptedProvider>[0],
  rules: Parameters<typeof createNexus>[0]["rules"] = { RUN_TESTS: "allow" },
) {
  return fixtureWith({ "add.ts": brokenAdd, "scenario.ts": plainScenario }, script, rules)
}
