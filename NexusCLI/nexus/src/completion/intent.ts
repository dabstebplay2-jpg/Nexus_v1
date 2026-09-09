/**
 * Intent classification turns a free-form request into the kind of proof Nexus must produce.
 *
 * This is deliberately not a phrase regex. A phrase list only matches the wordings its author
 * imagined, which is why "Fix failing tests" worked while "Fix failing test" did not. The goal
 * is tokenised and scored against small stem vocabularies, generalising across inflection,
 * word order and language.
 *
 * Bias: only decisive breakage vocabulary may demand a reproduce-then-prove contract. Ambiguous
 * words ("green", "correctly") are qualifiers, because wrongly demanding a baseline failure is
 * worse than falling back to asking the user.
 */
export type Intent = "repair" | "explain" | "unclear"

/** Decisive breakage vocabulary, matched as prefixes so inflected forms need no enumeration. */
const breakageStems = [
  "fix",
  "repair",
  "debug",
  "resolv",
  "broke",
  "break",
  "fail",
  "bug",
  "error",
  "crash",
  "regress",
  "unbreak",
  "misbehav",
  "исправ",
  "поправ",
  "почин",
  "чини",
  "отлад",
  "ошибк",
  "ошибо",
  "баг",
  "паден",
  "пада",
  "слома",
  "сбой",
  "неверн",
]
/** Failure status words that only imply repair when the request is about a test suite. */
const statusStems = ["red", "green", "failing"]
const suiteStems = ["test", "spec", "suite", "pytest", "jest", "vitest", "тест"]
const explainStems = [
  "explain",
  "describ",
  "document",
  "summar",
  "overview",
  "what",
  "why",
  "how",
  "who",
  "where",
  "which",
  "объясн",
  "расскаж",
  "опиш",
  "что",
  "почему",
  "как",
  "зачем",
  "где",
]

const tokenise = (goal: string) =>
  goal
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

const hits = (tokens: string[], stems: string[]) => tokens.some((token) => stems.some((stem) => token.startsWith(stem)))

export function classifyIntent(goal: string): Intent {
  const tokens = tokenise(goal)
  if (!tokens.length) return "unclear"
  if (hits(tokens, breakageStems)) return "repair"
  if (hits(tokens, statusStems) && hits(tokens, suiteStems)) return "repair"
  if (hits(tokens, explainStems)) return "explain"
  return "unclear"
}
