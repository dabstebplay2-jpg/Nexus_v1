import path from "node:path"
import { z } from "zod"
import { defineTool, type Tool, type ToolContext } from "./registry"
import { atomicWrite, files, guard, hashFile } from "./workspace"
import { runProcess } from "./process"
import { commandCapabilities } from "../permissions/engine"
import { NexusError, abort } from "../shared/errors"
import { safeJson } from "../shared/redact"
import { retrieve } from "../project/retrieval"

const location = z.string().min(1).max(4096)
export function builtinTools(): Tool[] {
  return [
    defineTool({
      name: "retrieve",
      description:
        "Rank candidate paths by task/symbol terms and inspect their import relations before targeted reads.",
      input: z.object({ query: z.string().min(1).max(1000) }),
      execute: async (input, ctx) => ({
        output: JSON.stringify(await retrieve(ctx.session.workspace, input.query, ctx.signal)),
      }),
    }),
    defineTool({
      name: "read",
      description: "Read a specific UTF-8 file range. Returns a hash required for safe edits. Search first.",
      input: z.object({
        path: location,
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(16000).default(6000),
      }),
      execute: async (input, ctx) => {
        const file = await guard(ctx.session.workspace, input.path)
        if (Bun.file(file).size > 2 * 1024 * 1024)
          throw new NexusError("FILE_LIMIT", "File exceeds 2 MiB; use search or a smaller fixture")
        const content = await Bun.file(file).text()
        return {
          output: content.slice(input.offset, input.offset + input.limit),
          kind: "FILE_ASSERTION",
          verdict: "pass",
          metadata: {
            path: input.path,
            hash: await hashFile(file),
            offset: input.offset,
            totalChars: content.length,
            more: input.offset + input.limit < content.length,
          },
        }
      },
    }),
    defineTool({
      name: "write",
      description:
        "Create a file (expectedHash=null) or replace a file using its hash from read. Preserves concurrent user edits.",
      input: z.object({ path: location, content: z.string().max(1000000), expectedHash: z.string().nullable() }),
      risk: "medium",
      sideEffect: true,
      idempotency: "conditional",
      permissions: ["WRITE_PROJECT"],
      execute: async (input, ctx) => {
        const file = await guard(ctx.session.workspace, input.path)
        const beforeHash = (await Bun.file(file).exists()) ? await hashFile(file) : null
        if (beforeHash !== input.expectedHash)
          throw new NexusError("FILE_CONFLICT", "File changed or exists; read it before writing")
        const before = beforeHash ? await Bun.file(file).text() : ""
        recordWriteIntent(ctx, beforeHash, input.content)
        abort(ctx.signal)
        await atomicWrite(file, input.content)
        return {
          output: `Written ${input.path}`,
          kind: "FILE_CHANGE",
          verdict: "pass",
          beforeHash: beforeHash ?? undefined,
          afterHash: await hashFile(file),
          metadata: { path: input.path, before, after: input.content, created: beforeHash === null },
        }
      },
    }),
    defineTool({
      name: "edit",
      description: "Replace one exact unique text occurrence, guarded by the current file hash.",
      input: z.object({ path: location, oldText: z.string().min(1), newText: z.string(), expectedHash: z.string() }),
      risk: "medium",
      sideEffect: true,
      idempotency: "conditional",
      permissions: ["WRITE_PROJECT"],
      execute: async (input, ctx) => {
        const file = await guard(ctx.session.workspace, input.path)
        const beforeHash = await hashFile(file)
        if (beforeHash !== input.expectedHash) throw new NexusError("FILE_CONFLICT", "File changed; read it again")
        const before = await Bun.file(file).text()
        if (before.split(input.oldText).length !== 2)
          throw new NexusError("EDIT_MATCH", "oldText must match exactly once")
        const after = before.replace(input.oldText, () => input.newText)
        recordWriteIntent(ctx, beforeHash, after)
        abort(ctx.signal)
        await atomicWrite(file, after)
        return {
          output: `Edited ${input.path}`,
          kind: "FILE_CHANGE",
          verdict: "pass",
          beforeHash,
          afterHash: await hashFile(file),
          metadata: { path: input.path, before, after },
        }
      },
    }),
    defineTool({
      name: "list",
      description: "List candidate project files, excluding dependencies, build outputs, secrets and symlinks.",
      input: z.object({ prefix: z.string().default(""), offset: z.number().int().min(0).default(0) }),
      execute: async (input, ctx) => {
        const found = (await files(ctx.session.workspace)).filter((file) => file.startsWith(input.prefix))
        return {
          output: found.slice(input.offset, input.offset + 200).join("\n"),
          metadata: { total: found.length, offset: input.offset },
        }
      },
    }),
    defineTool({
      name: "glob",
      description: "Find project paths using a glob; returns at most 200 candidates.",
      input: z.object({ pattern: z.string().max(500) }),
      execute: async (input, ctx) => {
        const glob = new Bun.Glob(input.pattern)
        const found = (await files(ctx.session.workspace)).filter((file) => glob.match(file.replaceAll("\\", "/")))
        return { output: found.slice(0, 200).join("\n"), metadata: { total: found.length } }
      },
    }),
    defineTool({
      name: "search",
      description: "Literal text/symbol search with file and line locations. Use imports as the next retrieval hop.",
      input: z.object({ query: z.string().min(1).max(500), pattern: z.string().default("**/*") }),
      execute: async (input, ctx) => {
        const matches: string[] = []
        const glob = new Bun.Glob(input.pattern)
        for (const file of (await files(ctx.session.workspace)).filter((file) =>
          glob.match(file.replaceAll("\\", "/")),
        )) {
          abort(ctx.signal)
          const target = Bun.file(await guard(ctx.session.workspace, file))
          if (target.size > 1024 * 1024) continue
          const content = await target.text()
          if (content.includes("\0")) continue
          content.split("\n").forEach((line, index) => {
            if (line.includes(input.query) && matches.length < 200)
              matches.push(`${file}:${index + 1}:${line.slice(0, 400)}`)
          })
          if (matches.length >= 200) break
        }
        return { output: matches.join("\n"), metadata: { limited: matches.length >= 200 } }
      },
    }),
    defineTool({
      name: "bash",
      description:
        "Run a shell command (PowerShell on Windows, sh elsewhere). Requires approval: shell is unrestricted, not an OS sandbox. Exit 0 is only COMMAND_RESULT, never proof of the goal.",
      input: z.object({ command: z.string().min(1).max(10000) }),
      risk: "high",
      sideEffect: true,
      idempotency: "unsafe",
      permissions: (input) => commandCapabilities(input.command),
      execute: async (input, ctx) => {
        const argv =
          process.platform === "win32"
            ? ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", input.command]
            : ["sh", "-c", input.command]
        const result = await runProcess(argv, ctx.session.workspace, ctx.signal)
        return {
          output: result.stdout + result.stderr,
          kind: "COMMAND_RESULT",
          verdict: result.exitCode === 0 ? "pass" : "fail",
          metadata: { exitCode: result.exitCode },
        }
      },
    }),
    ...(["git_status", "git_diff"] as const).map((name) =>
      defineTool({
        name,
        description: "Read Git working tree without modifying it.",
        input: z.object({}),
        execute: async (_, ctx) => {
          const result = await runProcess(
            [
              "git",
              "--no-optional-locks",
              ...(name === "git_status" ? ["status", "--porcelain=v1"] : ["diff", "--no-ext-diff", "--no-textconv"]),
            ],
            ctx.session.workspace,
            ctx.signal,
          )
          return {
            output: result.stdout + result.stderr,
            kind: name === "git_diff" ? "GIT_DIFF" : "COMMAND_RESULT",
            verdict: result.exitCode === 0 ? "pass" : "fail",
          }
        },
      }),
    ),
    defineTool({
      name: "output",
      description: "Read a fragment of a previous action's full redacted output without repeating the action.",
      input: z.object({
        actionId: z.string(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(12000).default(6000),
      }),
      execute: async (input, ctx) => {
        const action = ctx.store.list("actions", ctx.session.id).find((item) => item.id === input.actionId)
        if (!action) throw new NexusError("NOT_FOUND", "Unknown action")
        const output = safeJson(action.result)
        return {
          output: output.slice(input.offset, input.offset + input.limit),
          metadata: { totalChars: output.length },
        }
      },
    }),
  ]
}
function recordWriteIntent(ctx: ToolContext, beforeHash: string | null, after: string) {
  const action = ctx.store.list("actions", ctx.session.id).find((item) => item.id === ctx.actionId)
  if (!action) throw new NexusError("LEDGER", "Missing durable write intent")
  action.beforeHash = beforeHash ?? undefined
  action.afterHash = new Bun.CryptoHasher("sha256").update(after).digest("hex")
  ctx.store.put("actions", action)
}
