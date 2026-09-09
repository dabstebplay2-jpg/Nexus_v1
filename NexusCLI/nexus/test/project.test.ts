import { expect, test } from "bun:test"
import path from "node:path"
import { detect } from "../src/project/detect"
import { answer, fixture } from "./helpers"

test.each([
  [
    "package.json",
    '{"scripts":{"test":"bun test","build":"bun build x.ts"},"packageManager":"pnpm@9.0.0"}',
    "Node/TypeScript",
    "pnpm",
  ],
  ["pyproject.toml", "[project]\nname='x'", "Python", "python"],
  ["Cargo.toml", "[package]\nname='x'", "Rust", "cargo"],
  ["go.mod", "module example", "Go", "go"],
  ["example.csproj", "<Project />", ".NET", "dotnet"],
])("detects %s and its check adapter", async (filename, content, kind, executable) => {
  const f = await fixture(() => answer())
  try {
    await Bun.write(path.join(f.workspace, filename), content)
    const project = await detect(f.workspace)
    expect(project.kind).toBe(kind)
    expect(project.checks[0]?.argv[0]).toBe(executable)
  } finally {
    await f.cleanup()
  }
})
