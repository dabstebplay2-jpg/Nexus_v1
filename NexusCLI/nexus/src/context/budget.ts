export type ContextMode = "normal" | "prepare" | "compress"

/** Reserve output and account for tokenizer uncertainty before admitting a prompt. */
export function contextBudget(window: number, requestedOutput: number, pressure = 1) {
  const output = Math.max(1, Math.min(requestedOutput, Math.floor(window * 0.2)))
  const limit = Math.floor((window * 0.9 - output) / pressure)
  const target = Math.floor((window * 0.7 - output) / pressure)
  return { window, output, limit, target, pressure }
}

/**
 * Fraction of the window a prompt of this size would occupy, output reservation included.
 *
 * Extracted from `contextMode` so the compaction stage in `layers.ts` measures the same quantity
 * by the same formula. Two independent notions of "how full is the context" is exactly how a
 * budget system starts disagreeing with itself.
 */
export function contextUtilisation(input: number, budget: ReturnType<typeof contextBudget>) {
  return (input * budget.pressure + budget.output) / budget.window
}

/**
 * Fraction of the admissible input budget a prompt of this size occupies.
 *
 * `limit` already has the output reservation and tokenizer pressure removed, so this reaches exactly
 * 1 when a prompt fills the budget. Compaction stages are measured on this scale and not on the
 * window: `contextUtilisation` saturates at 0.9 by construction, so a window-scale threshold above
 * that could never fire, and an unreachable emergency stage is worse than no emergency stage.
 */
export function budgetUtilisation(input: number, budget: ReturnType<typeof contextBudget>) {
  return budget.limit > 0 ? input / budget.limit : 1
}

export function contextMode(input: number, budget: ReturnType<typeof contextBudget>): ContextMode {
  const ratio = contextUtilisation(input, budget)
  return ratio >= 0.9 ? "compress" : ratio >= 0.85 ? "prepare" : "normal"
}
