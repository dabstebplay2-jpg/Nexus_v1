import path from "node:path"
import { z } from "zod"
import type { Check, Project } from "../domain/types"
import { files, guard } from "../tools/workspace"

export async function detect(workspace: string): Promise<Project> {
  const paths = await files(workspace)
  const check = (id: string, kind: Check["kind"], argv: string[]): Check => ({
    id,
    description: id,
    kind,
    argv,
    timeoutMs: 120000,
  })
  if (paths.includes("package.json")) {
    const manifest = z
      .object({ scripts: z.record(z.string(), z.string()).default({}), packageManager: z.string().optional() })
      .parse(await Bun.file(await guard(workspace, "package.json")).json())
    const manager =
      manifest.packageManager?.split("@")[0] ||
      (paths.includes("bun.lock") || paths.includes("bun.lockb")
        ? "bun"
        : paths.includes("pnpm-lock.yaml")
          ? "pnpm"
          : paths.includes("yarn.lock")
            ? "yarn"
            : "npm")
    const known = ["bun", "pnpm", "yarn", "npm"].includes(manager) ? manager : "npm"
    return {
      kind: "Node/TypeScript",
      packageManager: known,
      roots: [workspace],
      checks: (
        [
          ["test", "TEST_RESULT"],
          ["typecheck", "TYPECHECK_RESULT"],
          ["lint", "LINT_RESULT"],
          ["build", "BUILD_RESULT"],
        ] as const
      )
        .filter(([name]) => Boolean(manifest.scripts[name]))
        .map(([name, kind]) => check(name, kind, [known, "run", name])),
    }
  }
  if (paths.includes("Cargo.toml"))
    return {
      kind: "Rust",
      roots: [workspace],
      checks: [check("test", "TEST_RESULT", ["cargo", "test"]), check("build", "BUILD_RESULT", ["cargo", "build"])],
    }
  if (paths.includes("go.mod"))
    return {
      kind: "Go",
      roots: [workspace],
      checks: [
        check("test", "TEST_RESULT", ["go", "test", "./..."]),
        check("build", "BUILD_RESULT", ["go", "build", "./..."]),
      ],
    }
  if (paths.some((file) => /\.(sln|csproj|fsproj)$/.test(file)))
    return {
      kind: ".NET",
      roots: [workspace],
      checks: [check("test", "TEST_RESULT", ["dotnet", "test"]), check("build", "BUILD_RESULT", ["dotnet", "build"])],
    }
  if (paths.includes("pyproject.toml") || paths.includes("requirements.txt") || paths.some(file => /(^|[\\/])(?:test_[^\\/]+|[^\\/]+_test)\.py$/.test(file)))
    return {
      kind: "Python",
      packageManager: paths.includes("uv.lock") ? "uv" : "pip",
      roots: [workspace],
      checks: [
        check("test", "TEST_RESULT", paths.includes("uv.lock") ? ["uv", "run", "pytest"] : ["python", "-m", "pytest"]),
      ],
    }
  if (paths.some(file => /\.(test|spec)\.[cm]?[jt]s$/.test(file)))
    return { kind: "JavaScript/TypeScript", packageManager: "bun", roots: [workspace], checks: [check("test", "TEST_RESULT", ["bun", "test"])] }
  return { kind: "Unknown", roots: [path.resolve(workspace)], checks: [] }
}
