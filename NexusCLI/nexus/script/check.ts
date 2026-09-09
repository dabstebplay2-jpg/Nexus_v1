/**
 * Single verification gate for Nexus development.
 *
 * Runs every reproducible check the project has, in dependency order, and prints one
 * summary table. Every step runs even when an earlier one fails, so a single invocation
 * reports the complete state of the tree instead of stopping at the first red step.
 *
 * Usage:
 *   bun run check
 *   bun run check --only=test,typecheck
 *   bun run check --bail
 */
const steps = [
  { name: "typecheck", argv: ["run", "typecheck"], why: "Types are the cheapest failure to find" },
  { name: "boundaries", argv: ["run", "check:boundaries"], why: "Architecture boundaries must hold" },
  { name: "test", argv: ["test", "./test"], why: "Behavioural and regression suites" },
  { name: "bench", argv: ["run", "bench"], why: "Scripted reliability smoke: no false completion" },
  { name: "build", argv: ["run", "build"], why: "Standalone executable must build (smoke depends on it)" },
  { name: "smoke", argv: ["run", "smoke"], why: "Standalone CLI end-to-end over real HTTP/SSE" },
  { name: "product", argv: ["run", "smoke:product"], why: "API server end-to-end: HTTP, SSE, proved run report" },
] as const

const args = process.argv.slice(2)
const only = args
  .find((arg) => arg.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean)
const bail = args.includes("--bail")
const selected = only ? steps.filter((step) => only.includes(step.name)) : steps
const unknown = only?.filter((name) => !steps.some((step) => step.name === name)) ?? []
if (unknown.length) {
  console.error(`Unknown check(s): ${unknown.join(", ")}. Available: ${steps.map((step) => step.name).join(", ")}`)
  process.exit(2)
}

type Outcome = { name: string; status: "PASS" | "FAIL" | "SKIPPED"; ms: number; code: number | null }
const outcomes: Outcome[] = []
for (const step of selected) {
  if (bail && outcomes.some((outcome) => outcome.status === "FAIL")) {
    outcomes.push({ name: step.name, status: "SKIPPED", ms: 0, code: null })
    continue
  }
  console.log(`\n\u001b[1m▶ ${step.name}\u001b[0m — ${step.why}`)
  const started = Date.now()
  const child = Bun.spawn([process.execPath, ...step.argv], {
    cwd: import.meta.dir + "/..",
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
  })
  const code = await child.exited
  outcomes.push({ name: step.name, status: code === 0 ? "PASS" : "FAIL", ms: Date.now() - started, code })
}

const width = Math.max(...outcomes.map((outcome) => outcome.name.length))
console.log(`\n\u001b[1mCheck summary\u001b[0m`)
for (const outcome of outcomes) {
  const colour = outcome.status === "PASS" ? "32" : outcome.status === "FAIL" ? "31" : "90"
  const duration = outcome.status === "SKIPPED" ? "" : `${(outcome.ms / 1000).toFixed(1)}s`
  console.log(
    `  ${outcome.name.padEnd(width)}  \u001b[${colour}m${outcome.status.padEnd(7)}\u001b[0m ${duration.padStart(6)}`,
  )
}
const failed = outcomes.filter((outcome) => outcome.status === "FAIL")
console.log(
  failed.length
    ? `\n\u001b[31m${failed.length}/${outcomes.length} checks failed: ${failed.map((outcome) => outcome.name).join(", ")}\u001b[0m`
    : `\n\u001b[32mAll ${outcomes.length} checks passed\u001b[0m`,
)
process.exit(failed.length ? 1 : 0)
