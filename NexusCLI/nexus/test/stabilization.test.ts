import { expect, test } from "bun:test"
import path from "node:path"
import { commandCapabilities, PermissionEngine } from "../src/permissions/engine"
import { platformContext, runShell, shellArgv } from "../src/tools/platform"
import { answer, call, fixture, goalCheck, model } from "./helpers"

const structure = "Get-ChildItem -Recurse -File | Select-Object FullName, Length | Format-List"

test("permissions distinguish literal listing, writes, deletion, system changes and mixed commands", () => {
  expect(commandCapabilities(structure, "win32")).toEqual(["READ"])
  expect(new PermissionEngine().evaluate(commandCapabilities(structure, "win32"))).toBe("allow")
  expect(commandCapabilities("Set-Content notes.txt 'text'", "win32")).toContain("WRITE_PROJECT")
  expect(commandCapabilities("Remove-Item -LiteralPath notes.txt", "win32")).toContain("DELETE")
  expect(commandCapabilities("Remove-Item -LiteralPath notes.txt", "win32")).not.toContain("SYSTEM_MUTATION")
  expect(new PermissionEngine({ RUN_PROCESS: "allow" }).evaluate(commandCapabilities("Remove-Item notes.txt"))).toBe(
    "ask",
  )
  for (const command of [
    "format C:",
    "diskpart",
    "Set-ExecutionPolicy Unrestricted",
    "Set-ItemProperty 'HKLM:\\Software\\Example' -Name Value -Value 1",
    "Get-ChildItem; Remove-Item x; reg add HKCU\\Example",
  ])
    expect(new PermissionEngine({ RUN_PROCESS: "allow" }).evaluate(commandCapabilities(command))).toBe("deny")
  expect(commandCapabilities("Get-ChildItem; Remove-Item x; reg add HKCU\\Example")).toContain("DELETE")
  for (const command of [
    "Get-ChildItem | Select-Object @{n='x';e={Remove-Item x}}",
    "Get-ChildItem > result.txt",
    "Get-ChildItem $(Remove-Item x)",
    "Get-Content .env",
    "Get-ChildItem C:\\",
    "Get-ChildItem | ForEach-Object { & $_ }",
    "Get-ChildItem `\n; Remove-Item x",
  ])
    expect(commandCapabilities(command, "win32")).toContain("RUN_PROCESS")
  expect(commandCapabilities(structure, "linux")).toEqual(["RUN_PROCESS"])
  for (const command of ["rm -rf folder", "rm -fr folder", "Remove-Item folder -Recurse -Force", "rd /s folder"])
    expect(commandCapabilities(command)).toContain("SYSTEM_MUTATION")
})

test("delete approval can be accepted or declined; explicit deny remains authoritative", async () => {
  const request = {
    sessionId: "s",
    actionId: "a",
    tool: "bash",
    arguments: { command: "Remove-Item file.txt" },
    capabilities: commandCapabilities("Remove-Item file.txt"),
    reason: "Delete a project file",
  }
  let prompts = 0
  const accepted = new PermissionEngine({ RUN_PROCESS: "allow" }, async () => {
    prompts++
    return true
  })
  await accepted.authorize(request, new AbortController().signal, () => {})
  expect(prompts).toBe(1)
  await expect(
    new PermissionEngine({ RUN_PROCESS: "allow" }, async () => false).authorize(
      request,
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow("User declined")
  await expect(
    new PermissionEngine({ RUN_PROCESS: "allow", DELETE: "deny" }, async () => {
      prompts++
      return true
    }).authorize(request, new AbortController().signal, () => {}),
  ).rejects.toThrow("Permission policy denies")
  expect(prompts).toBe(1)
})

test.skipIf(process.platform !== "win32")(
  "failed shell evidence and action preserve separate streams and diagnostic",
  async () => {
    const f = await fixture(
      (_, turn) =>
        turn === 1
          ? call("bash", { command: "Write-Output 'before'; cmd.exe /c exit 9; Write-Output 'after'" })
          : answer(),
      { RUN_PROCESS: "allow" },
    )
    try {
      const session = await f.api.create({ workspace: f.workspace, goal: "Inspect command failure", model })
      await f.api.run(session.id)
      const report = f.api.inspect(session.id)
      const evidence = report.evidence.find((item) => item.source === "tool")!
      expect(evidence.verdict).toBe("fail")
      expect(evidence.metadata.exitCode).toBe(1)
      expect(evidence.metadata.stdout).toContain("before")
      expect(evidence.metadata.stdout).not.toContain("after")
      expect(evidence.metadata.stderr).toContain("exit code 9")
      expect(report.actions[0]!.status).toBe("FAILED")
      expect(report.actions[0]!.error).toContain("fix the failing command")
    } finally {
      await f.cleanup()
    }
  },
  15000,
)

test("platform adapter supplies the actual shell and Windows syntax", () => {
  expect(platformContext("win32").instructions).toContain("Get-ChildItem")
  expect(platformContext("win32").instructions).toContain("dir /s /b")
  expect(shellArgv(structure, "win32")[0]).toBe("powershell.exe")
  expect(shellArgv("false | true", "linux")).toEqual(["bash", "-e", "-o", "pipefail", "-c", "false | true"])
})

test.skipIf(process.platform !== "win32")(
  "real PowerShell catches intermediate cmdlet/native/pipeline/nested failures and preserves streams",
  async () => {
    const f = await fixture(() => answer())
    try {
      for (const command of [
        "Get-Item missing-file; Write-Output 'last success'",
        "cmd.exe /c exit 7; Write-Output 'last success'",
        "cmd.exe /c exit 7; cmd.exe /c exit 0",
        "cmd.exe /c exit 7 | Out-String; Write-Output 'last success'",
        "cmd.exe /c exit 7 | cmd.exe /c exit 0; Write-Output 'last success'",
        "if ($true) { cmd.exe /c exit 7 }; Write-Output 'last success'",
        "Get-Item missing-file -ErrorAction Continue; Write-Output 'last success'",
      ]) {
        const result = await runShell(command, f.workspace, AbortSignal.timeout(10000))
        expect({ command, exitCode: result.exitCode }).toEqual({ command, exitCode: 1 })
        expect(result.stderr.length).toBeGreaterThan(0)
        expect(result.stdout).not.toContain("last success")
      }
      const result = await runShell(
        "Write-Output 'first;second'; [Console]::Error.WriteLine('warning'); Write-Output 'Привет'",
        f.workspace,
        AbortSignal.timeout(10000),
      )
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("first;second")
      expect(result.stdout).toContain("Привет")
      expect(result.stdout).not.toContain("warning")
      expect(result.stderr).toContain("warning")
      const listing = await runShell(structure, f.workspace, AbortSignal.timeout(10000))
      expect(listing.exitCode).toBe(0)
      expect(listing.stdout).toContain("add.ts")
      expect(listing.stdout).toContain("Length")
      const pipeline = await runShell(
        "1,2,3 | Where-Object { $_ -gt 1 } | Measure-Object | Select-Object -ExpandProperty Count",
        f.workspace,
        AbortSignal.timeout(10000),
      )
      expect(pipeline.exitCode).toBe(0)
      expect(pipeline.stdout.trim()).toBe("2")
    } finally {
      await f.cleanup()
    }
  },
  90000,
)

test("A: study project structure allows list/read without permission errors", async () => {
  const f = await fixture((_, turn) =>
    turn === 1
      ? call("list", {})
      : turn === 2
        ? call("read", { path: "add.ts" })
        : turn === 3 && process.platform === "win32"
          ? call("bash", { command: structure })
          : answer("Структура изучена."),
  )
  try {
    const session = await f.api.create({
      workspace: f.workspace,
      goal: "Изучи проект и покажи структуру",
      model,
      goalCheck: {
        id: "structure",
        description: "Confirm the inspected project files exist",
        kind: "GOAL_ASSERTION",
        argv: [
          process.execPath,
          "-e",
          "if (!await Bun.file('add.ts').exists() || !await Bun.file('scenario.ts').exists()) process.exit(1)",
        ],
        timeoutMs: 5000,
      },
    })
    const result = await f.api.run(session.id)
    expect(result.status).toBe("COMPLETED")
    expect(f.api.inspect(session.id).actions.every((action) => action.status === "SUCCEEDED")).toBe(true)
    expect(f.api.inspect(session.id).actions.map((action) => action.tool)).toContain("read")
    expect(f.provider.requests[0]!.messages[0]!.content).toContain(platformContext().shell)
  } finally {
    await f.cleanup()
  }
}, 20000)

test("B: read → edit → verify executes a real regression check", async () => {
  const f = await fixture((request, turn) => {
    if (turn === 1) return call("read", { path: "add.ts" })
    if (turn === 2) {
      const read = JSON.parse(request.messages.findLast((message) => message.role === "tool")!.content)
      return call("edit", {
        path: "add.ts",
        oldText: "a - b",
        newText: "a + b",
        expectedHash: JSON.parse(read.metadata).hash,
      })
    }
    if (turn === 3) return call("verify", {})
    return answer("Исправление проверено.")
  })
  try {
    const session = await f.api.create({
      workspace: f.workspace,
      goal: "Исправь ошибку в файле и проверь результат",
      model,
      goalCheck,
    })
    expect((await f.api.run(session.id)).status).toBe("COMPLETED")
    expect(await Bun.file(path.join(f.workspace, "add.ts")).text()).toContain("a + b")
    expect(f.api.inspect(session.id).evidence).toContainEqual(
      expect.objectContaining({ source: "verification", verdict: "pass" }),
    )
  } finally {
    await f.cleanup()
  }
})

test("C: delete requests confirmation and leaves file untouched", async () => {
  const command = process.platform === "win32" ? "Remove-Item -LiteralPath add.ts" : "rm add.ts"
  const f = await fixture(() => call("bash", { command }), { RUN_PROCESS: "allow" })
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Удалить файл", model })
    const result = await f.api.run(session.id)
    expect(result.status).toBe("WAITING_PERMISSION")
    expect(result.decision?.reason).toContain("DELETE")
    expect(result.decision?.reason).toContain(command)
    expect(result.decision?.reason).toContain("approve")
    expect(await Bun.file(path.join(f.workspace, "add.ts")).exists()).toBe(true)
  } finally {
    await f.cleanup()
  }
})

test("D: system setting is high risk and denied with actionable diagnostics", async () => {
  const f = await fixture(() => call("bash", { command: "Set-ExecutionPolicy Unrestricted" }), { RUN_PROCESS: "allow" })
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Измени системную настройку", model })
    const result = await f.api.run(session.id)
    expect(result.status).toBe("FAILED")
    expect(result.decision?.reason).toContain("SYSTEM_MUTATION")
    expect(result.decision?.reason).toContain("Set-ExecutionPolicy")
    expect(result.decision?.reason).toContain("review")
    expect(f.api.inspect(session.id).actions).toContainEqual(
      expect.objectContaining({ risk: "high", status: "FAILED" }),
    )
    expect(f.api.inspect(session.id).evidence).toHaveLength(0)
  } finally {
    await f.cleanup()
  }
})
