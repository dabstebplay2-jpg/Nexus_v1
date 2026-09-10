import type { CompactionStage, ContextCategory, ContextLayer, ContextReport } from "../domain/types"
import type { ContextMode } from "./budget"

/**
 * Context observability.
 *
 * The Context Engine has to be inspectable for two different reasons, and only one of them is a
 * UI panel. The other is that "the model behaved oddly at 85% utilisation" is not a debuggable
 * statement: without a per-category breakdown there is no way to tell whether the working set was
 * starved by tool schemas, by project knowledge or by an oversized AGENTS.md.
 *
 * This module is pure. The report is derived from numbers the assembler already computed, so
 * producing it cannot change which prompt was sent, and it carries no file contents, no message
 * text and no secrets -- only category names and token counts.
 */

export type ReportCategoryInput = {
  key: string
  layer: ContextLayer
  tokens: number
  pinned: boolean
  included: boolean
}
export type ReportInput = {
  epoch: number
  window: number
  limit: number
  output: number
  used: number
  stage: CompactionStage
  mode: ContextMode
  detail: number
  categories: readonly ReportCategoryInput[]
  history: { messages: number; live: number; archived: number; summaries: number }
  compression: { beforeTokens: number; afterTokens: number }
}

const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : 0)

export function buildReport(input: ReportInput): ContextReport {
  const categories: ContextCategory[] = input.categories
    .map((category) => ({
      key: category.key,
      layer: category.layer,
      tokens: category.tokens,
      share: category.included ? ratio(category.tokens, input.used) : 0,
      pinned: category.pinned,
      included: category.included,
    }))
    .sort((left, right) => right.tokens - left.tokens || left.key.localeCompare(right.key))
  return {
    epoch: input.epoch,
    window: input.window,
    limit: input.limit,
    output: input.output,
    used: input.used,
    free: Math.max(0, input.limit - input.used),
    utilisation: ratio(input.used + input.output, input.window),
    stage: input.stage,
    mode: input.mode,
    detail: input.detail,
    categories,
    included: categories.filter((category) => category.included).map((category) => category.key),
    excluded: categories.filter((category) => !category.included).map((category) => category.key),
    history: input.history,
    compression: {
      beforeTokens: input.compression.beforeTokens,
      afterTokens: input.compression.afterTokens,
      saved: Math.max(0, input.compression.beforeTokens - input.compression.afterTokens),
    },
  }
}

export const formatTokens = (tokens: number) =>
  tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(Math.max(0, Math.round(tokens)))

/**
 * One human-readable block, for the CLI and for logs. The UI reads the structured report instead;
 * this exists so the same information is available before any panel is built.
 */
export function renderReport(report: ContextReport) {
  const lines = [
    `Context ${formatTokens(report.used)} / ${formatTokens(report.window)} (${Math.round(report.utilisation * 100)}%) \u00b7 stage ${report.stage} \u00b7 detail ${report.detail}`,
    ...report.categories
      .filter((category) => category.included && category.tokens > 0)
      .map(
        (category) =>
          `  ${category.key.padEnd(24)} ${formatTokens(category.tokens).padStart(7)}  ${Math.round(category.share * 100)}%`,
      ),
  ]
  if (report.excluded.length) lines.push(`  excluded: ${report.excluded.join(", ")}`)
  if (report.history.archived > 0 || report.history.summaries > 0)
    lines.push(`  compressed history: ${report.history.archived} events \u2192 ${report.history.summaries} summaries`)
  if (report.compression.saved > 0)
    lines.push(
      `  compaction saved: ${formatTokens(report.compression.beforeTokens)} \u2192 ${formatTokens(report.compression.afterTokens)}`,
    )
  return lines.join("\n")
}
