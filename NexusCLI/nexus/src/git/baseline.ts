import type { GitBaseline } from "../domain/types"
import { runProcess } from "../tools/process"

export async function gitBaseline(workspace: string): Promise<GitBaseline> {
  const run = (args: string[]) =>
    runProcess(["git", "--no-optional-locks", ...args], workspace, AbortSignal.timeout(10000))
  const status = await run(["status", "--porcelain=v1"]).catch(() => undefined)
  if (!status || status.exitCode !== 0)
    return { branch: "(no git)", head: "", status: "", staged: "", unstaged: "", untracked: "", available: false }
  const [branch, head, staged, unstaged, untracked] = await Promise.all([
    run(["branch", "--show-current"]),
    run(["rev-parse", "HEAD"]),
    run(["diff", "--cached", "--name-only"]),
    run(["diff", "--name-only"]),
    run(["ls-files", "--others", "--exclude-standard"]),
  ])
  return {
    branch: branch.stdout.trim(),
    head: head.stdout.trim(),
    status: status.stdout,
    staged: staged.stdout,
    unstaged: unstaged.stdout,
    untracked: untracked.stdout,
    available: true,
  }
}
