import { unlink } from "node:fs/promises"
import { z } from "zod"
import type { Store, EventSink } from "../domain/ports"
import type { ToolExecutor } from "../tools/executor"
import { defineTool } from "../tools/registry"
import { atomicWrite, guard, hashFile } from "../tools/workspace"
import { NexusError, abort } from "../shared/errors"
import { agentChanges } from "./changes"
import { publish, transition } from "../core/state"

/** Undo one recorded edit, never a whole worktree. Redacted or conflicting images fail closed. */
export async function rollback(store: Store, executor: ToolExecutor, emit: EventSink, id: string, actionId: string, note: string, signal = new AbortController().signal) {
  const session = store.get(id)
  const release = store.acquire(id, session.workspace)
  try {
    if (!note.trim()) throw new NexusError("INPUT", "A rollback review note is required")
    const patch = agentChanges(store, id).patches.find(item => item.actionId === actionId)
    if (!patch || patch.snapshotIntegrity !== "verified") throw new NexusError("ROLLBACK_UNAVAILABLE", "No lossless before/after snapshot exists for this action; inspect the diff manually")
    const file = await guard(session.workspace, patch.path)
    if (await hashFile(file).catch(() => undefined) !== patch.afterHash) throw new NexusError("FILE_CONFLICT", "File changed after this action. Rollback would overwrite newer work; inspect the diff instead")
    const result = await executor.execute(session, crypto.randomUUID(), { id: crypto.randomUUID(), name: "rollback", arguments: { path: patch.path, actionId, note } }, defineTool({
      name: "rollback",
      description: "Restore a reviewed file snapshot only if the current hash matches; deleting a created file requires approval.",
      input: z.object({ path: z.string(), actionId: z.string(), note: z.string() }),
      risk: patch.created ? "high" : "medium",
      sideEffect: true,
      idempotency: "conditional",
      permissions: patch.created ? ["DELETE"] : ["WRITE_PROJECT"],
      execute: async (_, ctx) => {
        const target = await guard(ctx.session.workspace, patch.path)
        if (await hashFile(target).catch(() => undefined) !== patch.afterHash) throw new NexusError("FILE_CONFLICT", "File changed while awaiting approval; rollback cancelled")
        const action = store.list("actions", id).find(item => item.id === ctx.actionId)!
        action.beforeHash = patch.afterHash
        action.afterHash = patch.beforeHash
        store.put("actions", action)
        abort(ctx.signal)
        if (patch.created) await unlink(target)
        else await atomicWrite(target, patch.before)
        return { output: `Rolled back ${patch.path}`, kind: "FILE_CHANGE", verdict: "pass", beforeHash: patch.afterHash, afterHash: patch.beforeHash, metadata: { path: patch.path, before: patch.after, after: patch.before, deleted: patch.created, rollbackOf: actionId } }
      },
    }), signal, () => publish(store, session, emit, "permission", { operation: "rollback", actionId }))
    if (result.action.status === "SUCCEEDED" || result.action.status === "UNKNOWN") {
      session.contract.revision++
      session.decision = undefined
      session.plan = []
      store.save(session)
      transition(store, session, "RECOVERING", emit, "Rollback changed source; previous completion must be verified again")
      publish(store, session, emit, "rollback", { actionId: result.action.id, rollbackOf: actionId, status: result.action.status })
    }
    return result.action
  } finally { release() }
}
