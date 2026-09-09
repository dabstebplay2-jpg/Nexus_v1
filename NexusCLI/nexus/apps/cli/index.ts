#!/usr/bin/env bun
import path from "node:path"
import { homedir } from "node:os"
import { parseArgs } from "node:util"
import { mkdir } from "node:fs/promises"
import { createNexus } from "../../src/composition"
import { loadConfig, configSchema } from "../../src/config/config"
import { safeJson } from "../../src/shared/redact"
import { errorText, NexusError } from "../../src/shared/errors"
import { terminal, render } from "./terminal"

async function main() {
  const args = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      workspace: { type: "string" },
      "data-dir": { type: "string" },
      "goal-command": { type: "string" },
      answer: { type: "boolean" },
      "allow-checks": { type: "boolean" },
      debug: { type: "boolean" },
      help: { type: "boolean" },
    },
  })
  if (args.values.help) {
    console.log(`NexusCLI — evidence before completion
nexus [run] ["goal"] [--workspace path] [--goal-command '["bun","test","scenario.test.ts"]']
nexus resume [session-id] | sessions | config [init] | doctor | debug
nexus inspect-session <id> | diff <id>
nexus steer <id> "instruction" | queue <id> "task"
nexus assert-goal <id> "scenario personally checked"
nexus resolve-action <id> <action-id> VERIFIED|FAILED "inspection note"
nexus trust-checks <id> "review note for changed test harness"
Options: --answer (informational only), --allow-checks (trust project checks), --debug, --data-dir path
While running: plain text or /steer changes direction; /queue admits the next task. Ctrl+C cancels.
Shell commands require approval and execute with your OS privileges.`)
    return
  }
  const dataDir = path.resolve(
    args.values["data-dir"] ?? process.env.NEXUS_DATA_DIR ?? path.join(homedir(), ".nexuscli"),
  )
  await mkdir(dataDir, { recursive: true })
  const configFile = path.join(dataDir, "config.json")
  const command = args.positionals[0] ?? "run"
  if (command === "config") {
    if (args.positionals[1] === "init" && !(await Bun.file(configFile).exists()))
      await Bun.write(configFile, JSON.stringify(configSchema.parse({}), null, 2))
    console.log(configFile)
    console.log(safeJson(await loadConfig(configFile)))
    return
  }
  const config = await loadConfig(configFile)
  const ui =
    process.stdin.isTTY &&
    ![
      "sessions",
      "config",
      "doctor",
      "debug",
      "inspect-session",
      "diff",
      "steer",
      "queue",
      "assert-goal",
      "resolve-action",
      "trust-checks",
    ].includes(command)
      ? terminal()
      : undefined
  const api = await createNexus({
    dataDir,
    rules: args.values["allow-checks"] ? { RUN_TESTS: "allow" } : {},
    permission: ui?.permission,
    onEvent: (event) => render(event, args.values.debug ?? false),
  })
  try {
    if (command === "sessions") {
      api
        .sessions()
        .forEach((session) => console.log(`${session.id}  ${session.status}  ${session.goal.slice(0, 100)}`))
      return
    }
    if (command === "diff") {
      const id = args.positionals[1]
      if (!id) throw new NexusError("INPUT", "Session ID required")
      const changes = api.diff(id)
      changes.patches.forEach((item) => console.log(item.patch))
      if (changes.processes.length) console.log(safeJson(changes.processes))
      return
    }
    if (command === "doctor") {
      console.log(
        safeJson({
          bun: Bun.version,
          workspace: path.resolve(args.values.workspace ?? process.cwd()),
          dataDir,
          sqlite: "opened",
          model: config.model,
          apiKeyConfigured: Boolean(process.env[config.model.apiKeyEnv]),
          executables: Object.fromEntries(
            ["git", "bun", "node", "npm", "python", "cargo", "go", "dotnet"].map((name) => [name, Bun.which(name)]),
          ),
        }),
      )
      return
    }
    if (["debug", "inspect-session"].includes(command)) {
      const id = args.positionals[1] ?? api.sessions()[0]?.id
      if (!id) throw new NexusError("INPUT", "No sessions")
      console.log(safeJson(api.inspect(id)))
      return
    }
    if (["steer", "queue", "assert-goal", "resolve-action", "trust-checks"].includes(command)) {
      const id = args.positionals[1]
      if (!id) throw new NexusError("INPUT", "Session ID required")
      const note = args.positionals.slice(2).join(" ")
      if (command === "assert-goal") await api.assertGoal(id, note)
      if (command === "trust-checks") await api.trustChecks(id, note)
      if (command === "steer" || command === "queue") api.prompt(id, note, command === "steer" ? "STEER" : "QUEUE")
      if (command === "resolve-action") {
        const outcome = args.positionals[3]
        if (outcome !== "VERIFIED" && outcome !== "FAILED") throw new NexusError("INPUT", "Expected VERIFIED or FAILED")
        api.resolveAction(id, args.positionals[2] ?? "", outcome, args.positionals.slice(4).join(" "))
      }
      console.log("Saved.")
      return
    }
    const existing = command === "resume" ? (args.positionals[1] ?? api.sessions()[0]?.id) : undefined
    if (command === "resume" && !existing) throw new NexusError("INPUT", "No session to resume")
    const goal = existing ? "" : args.positionals.slice(command === "run" ? 1 : 0).join(" ") || (await ui?.goal())
    if (!existing && !goal?.trim()) throw new NexusError("INPUT", "Provide a goal or run in an interactive terminal")
    const goalArgv: unknown = args.values["goal-command"] ? JSON.parse(args.values["goal-command"]) : undefined
    if (
      goalArgv !== undefined &&
      (!Array.isArray(goalArgv) || !goalArgv.length || !goalArgv.every((item) => typeof item === "string"))
    )
      throw new NexusError("CONFIG", "--goal-command must be a JSON string array")
    const id =
      existing ??
      (
        await api.create({
          workspace: args.values.workspace ?? process.cwd(),
          goal: goal!,
          model: config.model,
          mode: args.values.answer ? "answer" : "coding",
          goalCheck: goalArgv
            ? {
                id: "goal",
                description: "Original user scenario",
                kind: "GOAL_ASSERTION",
                argv: goalArgv as string[],
                timeoutMs: 120000,
              }
            : undefined,
        })
      ).id
    ui?.attach(api, id)
    const cancellation = new AbortController()
    const interrupt = () => cancellation.abort()
    process.on("SIGINT", interrupt)
    try {
      const result = await api.run(id, cancellation.signal)
      console.log(
        `\n${result.status === "COMPLETED" ? "DONE" : result.status} — ${result.decision?.reason ?? "Stopped"}\nSession: ${id}`,
      )
      const last = result.conversation.findLast((message) => message.role === "assistant" && !message.toolCalls?.length)
      if (last?.content)
        console.log(`\n${result.status === "COMPLETED" ? "Result" : "Model proposal (unverified)"}:\n${last.content}`)
      if (result.decision?.outcome === "NEEDS_USER_INPUT")
        console.log(
          `After checking the original scenario: nexus assert-goal ${id} "what you checked"; then nexus resume ${id}`,
        )
      if (result.status !== "COMPLETED") process.exitCode = 2
    } finally {
      process.removeListener("SIGINT", interrupt)
    }
  } finally {
    ui?.close()
    api.close()
  }
}
if (import.meta.main)
  await main().catch((error: unknown) => {
    console.error(safeJson({ error: errorText(error) }))
    process.exitCode = 1
  })
