import { abort, NexusError } from "../shared/errors"
import { redact } from "../shared/redact"
import path from "node:path"

export async function runProcess(argv: string[], cwd: string, signal: AbortSignal, maxBytes = 4 * 1024 * 1024) {
  abort(signal)
  if (!argv[0]) throw new NexusError("INPUT", "Empty command")
  const command = await resolveCommand(argv)
  const child = start(command, cwd)
  const state = { bytes: 0, overflow: false }
  const kill = () => {
    if (process.platform === "win32") {
      Bun.spawnSync(["taskkill", "/PID", String(child.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" })
      child.kill()
      return
    }
    try {
      process.kill(-child.pid, "SIGKILL")
    } catch {
      child.kill()
    }
  }
  signal.addEventListener("abort", kill, { once: true })
  async function collect(stream: ReadableStream<Uint8Array>) {
    const decoder = new TextDecoder()
    const output: string[] = []
    for await (const chunk of stream) {
      state.bytes += chunk.length
      if (state.bytes > maxBytes) {
        state.overflow = true
        kill()
        break
      }
      output.push(decoder.decode(chunk, { stream: true }))
    }
    return redact(output.join("") + decoder.decode())
  }
  try {
    if (signal.aborted) kill()
    const [stdout, stderr, exitCode] = await Promise.all([collect(child.stdout), collect(child.stderr), child.exited])
    abort(signal)
    if (state.overflow) throw new NexusError("OUTPUT_LIMIT", "Process exceeded output storage limit and was terminated")
    return { stdout, stderr, exitCode, argv }
  } finally {
    signal.removeEventListener("abort", kill)
  }
}
function start(argv: string[], cwd: string) {
  try {
    return Bun.spawn(argv, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      env: processEnv(),
      detached: process.platform !== "win32",
    })
  } catch {
    throw new NexusError("PROCESS_START_FAILED", `Could not start ${argv[0]}; check nexus doctor and PATH`)
  }
}
async function resolveCommand(argv: string[]) {
  if (process.platform !== "win32" || !["npm", "pnpm", "yarn"].includes(argv[0]!)) return argv
  const executable = Bun.which(`${argv[0]}.exe`)
  if (executable) return [executable, ...argv.slice(1)]
  const shim = Bun.which(`${argv[0]}.cmd`)
  const node = Bun.which("node")
  if (!shim || !node) throw new NexusError("PROCESS_START_FAILED", `${argv[0]} or Node is not installed`)
  const scripts: Record<string, string> = {
    npm: "npm/bin/npm-cli.js",
    pnpm: "pnpm/bin/pnpm.cjs",
    yarn: "yarn/bin/yarn.js",
  }
  const entrypoint = path.join(path.dirname(shim), "node_modules", scripts[argv[0]!]!)
  if (!(await Bun.file(entrypoint).exists()))
    throw new NexusError(
      "PROCESS_START_FAILED",
      `Unsupported ${argv[0]} shim; supply a native executable or Node entrypoint`,
    )
  return [node, entrypoint, ...argv.slice(1)]
}
function processEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL/i.test(key)),
  )
}
