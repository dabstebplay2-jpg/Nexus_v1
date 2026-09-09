import type { AgentSession } from "../domain/types"
import type { Store } from "../domain/ports"
import { guard, hashFile } from "../tools/workspace"
import { stat } from "node:fs/promises"

/** Inspect only. Never automatically replay an interrupted process, install or write. */
export async function recover(session: AgentSession, store: Store) {
  store
    .list("turns", session.id)
    .filter((turn) => turn.status === "STARTED")
    .forEach((turn) =>
      store.put("turns", { ...turn, status: "UNKNOWN", error: "Previous provider attempt was interrupted" }),
    )
  for (const action of store.list("actions", session.id)) {
    if (action.status !== "STARTED" && action.status !== "UNKNOWN") continue
    if (!action.sideEffect) {
      store.put("actions", { ...action, status: "FAILED", error: "Read interrupted; safe to request again" })
      continue
    }
    action.status = "UNKNOWN"
    const inspected = await Promise.all(
      ["package.json", "package-lock.json", "bun.lock", "pnpm-lock.yaml", "yarn.lock", "node_modules"].map(
        async (target) => {
          const file = await guard(session.workspace, target)
          const info = await stat(file).catch(() => undefined)
          return {
            target,
            exists: Boolean(info),
            directory: info?.isDirectory() ?? false,
            hash: info?.isFile() ? await hashFile(file) : undefined,
          }
        },
      ),
    )
    action.result = {
      previous: action.result,
      recoveryInspection: inspected,
      recommendation: "Compare observed files with intended operation; never replay automatically",
    }
    store.put("actions", action)
    if (!["write", "edit"].includes(action.tool) || !action.afterHash || !action.target) continue
    const hash = await guard(session.workspace, action.target)
      .then(hashFile)
      .catch(() => undefined)
    if (hash !== action.afterHash) continue
    action.status = "VERIFIED"
    action.error = undefined
    action.result = { recovery: "Current file matches the durable intended after-hash", hash }
    store.put("actions", action)
  }
  // Repair the model-visible transcript without replaying any interrupted tool calls.
  const settled = new Set(
    session.conversation.filter((message) => message.role === "tool").map((message) => message.toolCallId),
  )
  session.conversation
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.toolCalls ?? [])
    .filter((call) => !settled.has(call.id))
    .forEach((call) => {
      session.conversation.push({
        role: "tool",
        toolCallId: call.id,
        content: "Previous execution was interrupted. Inspect durable ledger; this tool was not replayed.",
      })
    })
  store.save(session)
  return store.list("actions", session.id).filter((action) => action.status === "UNKNOWN")
}
