import { expect, test } from "bun:test"
import path from "node:path"
import { runProcess } from "../src/tools/process"
import { createDeadline } from "../src/shared/errors"
import { answer, fixture, model } from "./helpers"

test("real process crash preserves ledger and ownership is reclaimed without replay", async () => {
  const f = await fixture(() => answer())
  try {
    const session = await f.api.create({ workspace: f.workspace, goal: "Crash recovery", model })
    const marker = path.join(f.workspace, "marker.txt")
    const child = Bun.spawn(
      [
        process.execPath,
        path.join(import.meta.dir, "fixtures", "crash-worker.ts"),
        path.join(f.root, "data", "nexus.db"),
        session.id,
        marker,
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    expect(await child.exited).toBe(23)
    expect(await Bun.file(marker).text()).toBe("side effect already happened")
    expect((await f.api.run(session.id)).decision?.outcome).toBe("BLOCKED")
    expect(f.provider.requests).toHaveLength(0)
    expect(f.api.inspect(session.id).actions).toContainEqual(
      expect.objectContaining({ id: "crashed-action", status: "UNKNOWN" }),
    )
  } finally {
    await f.cleanup()
  }
})
test("real process deadline kills execution before delayed side effect", async () => {
  const f = await fixture(() => answer())
  const deadline = createDeadline(new AbortController().signal, 100)
  try {
    await expect(
      runProcess(
        [process.execPath, "-e", 'setTimeout(() => Bun.write("late.txt", "bad"), 800); setInterval(() => {}, 1000)'],
        f.workspace,
        deadline.signal,
      ),
    ).rejects.toThrow()
    await Bun.sleep(850)
    expect(await Bun.file(path.join(f.workspace, "late.txt")).exists()).toBe(false)
  } finally {
    deadline.close()
    await f.cleanup()
  }
})
test("process output limit terminates runaway stdout", async () => {
  const f = await fixture(() => answer())
  try {
    await expect(
      runProcess(
        [process.execPath, "-e", 'console.log("x".repeat(20000))'],
        f.workspace,
        AbortSignal.timeout(5000),
        1000,
      ),
    ).rejects.toThrow("output storage limit")
  } finally {
    await f.cleanup()
  }
})
