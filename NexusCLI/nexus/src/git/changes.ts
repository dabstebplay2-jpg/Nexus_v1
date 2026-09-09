import { createTwoFilesPatch } from "diff"
import type { Store } from "../domain/ports"

/** Exact recorded edits, relative to the content present immediately before each agent write. */
export function agentChanges(store: Store, sessionId: string) {
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
      return [
        {
          actionId: item.actionId,
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
  const processes = store
    .list("actions", sessionId)
    .filter((item) => item.sideEffect && !["write", "edit"].includes(item.tool))
    .map((item) => ({
      actionId: item.id,
      tool: item.tool,
      status: item.status,
      attribution: "Process changes cannot be attributed precisely; compare with the saved Git baseline",
    }))
  return { patches, processes }
}
