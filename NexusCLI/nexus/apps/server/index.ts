#!/usr/bin/env bun
import path from "node:path"
import { homedir } from "node:os"
import { parseArgs } from "node:util"
import { mkdir } from "node:fs/promises"
import { createNexus } from "../../src/composition"
import { OpenAICompatibleProvider } from "../../src/llm/openai-compatible"
import { loadConfig } from "../../src/config/config"
import type { Provider, Store } from "../../src/domain/ports"
import { errorText } from "../../src/shared/errors"
import { ProjectRegistry } from "../shared/projects"
import { createRouter } from "./http"
import { RunManager } from "./runs"

/**
 * Nexus API server. The second client of NexusAPI, alongside the CLI.
 *
 * createNexusServer returns a plain fetch handler, so the product-layer tests exercise the
 * whole path — HTTP request, agent bridge, Agent Loop, verification, run report — with a
 * scripted provider and no socket at all.
 */
export const version = "0.2.0"

export async function createNexusServer(options: {
  dataDir: string
  webDir?: string
  provider?: Provider
  store?: Store
  env?: Record<string, string | undefined>
}) {
  await mkdir(options.dataDir, { recursive: true })
  const config = await loadConfig(path.join(options.dataDir, "config.json"))
  const registry = new ProjectRegistry(path.join(options.dataDir, "projects.json"))
  const runs = new RunManager(registry, config.model)
  const api = await createNexus({
    dataDir: options.dataDir,
    provider: options.provider ?? new OpenAICompatibleProvider(options.env ?? process.env),
    store: options.store,
    // Nothing is pre-approved globally; per-project allowChecks is answered by the bridge.
    rules: {},
    permission: runs.permission,
    onEvent: runs.ingest,
  })
  runs.attach(api)
  return {
    api,
    registry,
    runs,
    handle: createRouter({
      api,
      registry,
      runs,
      template: config.model,
      dataDir: options.dataDir,
      version,
      env: options.env ?? process.env,
      webDir: options.webDir,
    }),
    close: () => api.close(),
  }
}

async function main() {
  const args = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: "string" },
      "data-dir": { type: "string" },
      "web-dir": { type: "string" },
      help: { type: "boolean" },
    },
  })
  if (args.values.help) {
    console.log(`Nexus API server — evidence before completion
nexus-server [--port 4319] [--data-dir path] [--web-dir path]
Binds to 127.0.0.1 only. Serves the built web interface when --web-dir exists.`)
    return
  }
  const dataDir = path.resolve(
    args.values["data-dir"] ?? process.env.NEXUS_DATA_DIR ?? path.join(homedir(), ".nexuscli"),
  )
  const candidate = path.resolve(args.values["web-dir"] ?? path.join(import.meta.dir, "..", "web", "dist"))
  const webDir = (await Bun.file(path.join(candidate, "index.html")).exists()) ? candidate : undefined
  const server = await createNexusServer({ dataDir, webDir })
  const listener = Bun.serve({
    port: Number(args.values.port ?? process.env.NEXUS_PORT ?? 4319),
    hostname: "127.0.0.1",
    idleTimeout: 255,
    fetch: server.handle,
  })
  const stop = () => {
    listener.stop(true)
    server.close()
    process.exit(0)
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  console.log(`Nexus server on ${listener.url}`)
  console.log(`  data dir:  ${dataDir}`)
  console.log(webDir ? `  web:       ${listener.url}` : `  web:       not built (run: bun run web:build)`)
}
if (import.meta.main)
  await main().catch((error: unknown) => {
    console.error(errorText(error))
    process.exitCode = 1
  })
