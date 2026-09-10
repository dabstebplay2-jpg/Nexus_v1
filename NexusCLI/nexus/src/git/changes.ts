import { createTwoFilesPatch } from "diff"
import type { Store } from "../domain/ports"
import type { NexusAPI } from "../api"

/** Exact recorded edits, relative to the content present immediately before each agent write. */
export function agentChanges(store: Store, sessionId: string): ReturnType<NexusAPI["diff"]> {
  const actions = store.list("actions", sessionId)
  const patches = store
    .list("evidence", sessionId)
    .filter((item) => item.kind === "FILE_CHANGE")
    .flatMap((item) => {
      const metadata = item.metadata
      if (
        typeof metadata.before !== "string" ||
        typeof metadata.after !== "string" ||
        typeof metadata.path !== "string"
      )
        return []
      const action = actions.find((action) => action.id === item.actionId)
      const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex")
      // Evidence is redacted before storage. Never advertise it as a lossless rollback
      // snapshot unless BOTH recorded images match the original write hashes.
      const intact =
        hash(metadata.after) === action?.afterHash &&
        (metadata.created === true ? metadata.before === "" : hash(metadata.before) === action?.beforeHash)
      return [
        {
          actionId: item.actionId,
          path: metadata.path,
          before: metadata.before,
          after: metadata.after,
          timestamp: item.timestamp,
          beforeHash: action?.beforeHash,
          afterHash: action?.afterHash,
          created: metadata.created === true,
          snapshotIntegrity: intact ? ("verified" as const) : ("unavailable" as const),
          patch: createTwoFilesPatch(
            `a/${metadata.path}`,
            `b/${metadata.path}`,
            metadata.before,
            metadata.after,
            "before agent edit",
            "after agent edit",
          ),
        },
      ]
    })
  const processes = actions
    .filter((item) => item.sideEffect && !["write", "edit", "rollback"].includes(item.tool))
    .map((item) => ({
      actionId: item.id,
      tool: item.tool,
      status: item.status,
      attribution: "Process changes cannot be attributed precisely; compare with the saved Git baseline",
    }))
  return { patches, processes }
}
