import type { CompactionStage, ContextLayer } from "../domain/types"

/**
 * Context as a variable.
 *
 * Before this module the assembler had one dial: a single detail `scale` applied to everything at
 * once. That is enough to make a prompt fit, and not enough to decide *what should survive*. The
 * layer model separates those two questions:
 *
 *   - which blocks are eligible for this prompt at all (this file), and
 *   - how much detail each eligible block is rendered with (the existing scale loop).
 *
 * Priority is declared once, here, so every caller drops the same things in the same order:
 * project knowledge yields before the live exchange, and the archive is never resent at all.
 *
 * Everything in this file is pure and deterministic. It reads no clock, no filesystem and no
 * store, which is what makes the compaction policy testable without a model or a workspace.
 */

/** Priority order. Earlier layers are protected for longer; L4 is never sent. */
export const LAYER_ORDER: readonly ContextLayer[] = [
  "L0_CRITICAL",
  "L1_WORKING",
  "L2_TASK_MEMORY",
  "L3_PROJECT",
  "L4_ARCHIVE",
]

/**
 * Compaction thresholds, as a fraction of the model's context window.
 *
 * These are deliberately separate from `contextMode` in `budget.ts`. That function answers a
 * provider-admission question ("may this prompt be sent, and should a summary be refreshed first")
 * and its 0.85/0.9 boundaries are relied on by existing behaviour. Compaction answers a policy
 * question ("how aggressively should low-priority context be given up"), and it starts earlier:
 * waiting until 0.9 is how a session arrives at the wall with nothing left to trade.
 */
export const compactionThresholds = { soft: 0.7, hard: 0.85, emergency: 0.95 } as const

export function compactionStage(utilisation: number): CompactionStage {
  if (!Number.isFinite(utilisation) || utilisation < compactionThresholds.soft) return "normal"
  if (utilisation >= compactionThresholds.emergency) return "emergency"
  if (utilisation >= compactionThresholds.hard) return "hard"
  return "soft"
}

/**
 * Detail levels the assembler tries, richest first.
 *
 * Unchanged from v0.2.3 on purpose: a prompt below the soft threshold must be byte-identical to
 * the one the current test suite proves, so this change cannot silently alter agent behaviour on
 * the large-context configurations that are already green.
 */
export const detailScales = [1, 0.65, 0.35, 0.15] as const

/** Where a stage starts in `detailScales`. `normal` starts at full detail, so nothing changes below 0.7. */
export function stageEntry(stage: CompactionStage): number {
  return { normal: 0, soft: 1, hard: 2, emergency: 3 }[stage]
}

/**
 * Share of the discretionary budget each layer may claim at a given stage.
 *
 * L0 is not listed as a share because it is pinned: instructions, contract, plan state and tool
 * schemas are admitted in full or the window is genuinely too small, which is a configuration
 * error and is reported as one. L4 is always zero.
 */
export function layerShares(stage: CompactionStage): Record<ContextLayer, number> {
  const table: Record<CompactionStage, Record<ContextLayer, number>> = {
    normal: { L0_CRITICAL: 1, L1_WORKING: 0.55, L2_TASK_MEMORY: 0.2, L3_PROJECT: 0.25, L4_ARCHIVE: 0 },
    soft: { L0_CRITICAL: 1, L1_WORKING: 0.5, L2_TASK_MEMORY: 0.2, L3_PROJECT: 0.18, L4_ARCHIVE: 0 },
    hard: { L0_CRITICAL: 1, L1_WORKING: 0.4, L2_TASK_MEMORY: 0.25, L3_PROJECT: 0.1, L4_ARCHIVE: 0 },
    emergency: { L0_CRITICAL: 1, L1_WORKING: 0.25, L2_TASK_MEMORY: 0.3, L3_PROJECT: 0, L4_ARCHIVE: 0 },
  }
  return table[stage]
}

export type LayerBlock = {
  id: string
  layer: ContextLayer
  /** Observability label. One category per line in the Context panel. */
  category: string
  tokens: number
  /**
   * Pinned blocks are never dropped by allocation: the goal, the contract, the security policy,
   * the current plan, pending permissions, verification state and the tool schemas. Losing any of
   * them does not shrink the prompt, it makes the run unsound.
   */
  pinned: boolean
}
export type Allocation = {
  included: LayerBlock[]
  excluded: LayerBlock[]
  tokens: number
  /** By how much the pinned set alone exceeds the budget. Non-zero means the window is too small. */
  overflow: number
}

/**
 * Deterministic layer allocation.
 *
 * Pinned blocks first, then each layer in priority order up to its share of what is left. Input
 * order is preserved inside a layer, so a caller can rely on the selection being reproducible for
 * the same inputs -- which is what makes the resulting prompt reproducible too.
 */
export function allocate(
  blocks: readonly LayerBlock[],
  budget: number,
  stage: CompactionStage = "normal",
): Allocation {
  const shares = layerShares(stage)
  const pinned = blocks.filter((block) => block.pinned)
  const pinnedTokens = pinned.reduce((total, block) => total + block.tokens, 0)
  const included: LayerBlock[] = [...pinned]
  const excluded: LayerBlock[] = []
  const spent = new Map<ContextLayer, number>()
  const discretionary = Math.max(0, budget - pinnedTokens)
  const state = { used: pinnedTokens }
  for (const layer of LAYER_ORDER) {
    const cap = Math.floor(discretionary * shares[layer])
    for (const block of blocks.filter((candidate) => !candidate.pinned && candidate.layer === layer)) {
      const already = spent.get(layer) ?? 0
      if (block.tokens + already <= cap && state.used + block.tokens <= budget) {
        included.push(block)
        spent.set(layer, already + block.tokens)
        state.used += block.tokens
        continue
      }
      excluded.push(block)
    }
  }
  return { included, excluded, tokens: state.used, overflow: Math.max(0, pinnedTokens - budget) }
}
