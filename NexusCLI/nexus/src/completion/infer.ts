import { files, guard } from "../tools/workspace"
import { classifyIntent } from "./intent"
import type { Check } from "../domain/types"

/** Narrow, deterministic acceptance check derived from an explicit user specification.
 * Never accept a model-supplied shell command as a new trust anchor.
 */
export async function inferGoalCheck(workspace: string, goal: string): Promise<Check | undefined> {
  if (classifyIntent(goal) !== "repair" || !/\badd\b/i.test(goal) || !/должн|should|must/i.test(goal) || !/складыва|сумм|sum|addition|add\s+(?:two\s+)?numbers/i.test(goal)) return
  const candidates = (await files(workspace)).filter(file => /\.(py|ts|js|mjs)$/.test(file) && !/(^|[\\/])(?:test|spec)|\.(test|spec)\./i.test(file))
  if (candidates.length > 200) return
  const matches = (await Promise.all(candidates.map(async file => {
    const target = Bun.file(await guard(workspace, file))
    if (target.size > 256000) return undefined
    const source = await target.text()
    return (file.endsWith(".py") ? /^def\s+add\s*\(/m : /export\s+(?:(?:async\s+)?function\s+add\s*\(|(?:const|let)\s+add\s*=)/m).test(source) ? file : undefined
  }))).filter((file): file is string => Boolean(file))
  if (matches.length !== 1) return
  const file = matches[0]!.replaceAll("\\", "/")
  // The immutable inline harness tests the implementation, then prints the requested result.
  const argv = file.endsWith(".py")
    ? ["python", "-c", `import importlib.util\ns=importlib.util.spec_from_file_location('nexus_subject', ${JSON.stringify(file)})\nm=importlib.util.module_from_spec(s)\ns.loader.exec_module(m)\nfor a,b in [(2,3),(0,5),(-3,4),(2.5,0.5)]:\n assert m.add(a,b)==a+b, 'add must sum its arguments'\nprint(m.add(2,3))`]
    : ["bun", "-e", `const m = await import(${JSON.stringify("./" + file)}); for (const [a,b] of [[2,3],[0,5],[-3,4],[2.5,0.5]]) { if (await m.add(a,b) !== a+b) throw new Error('add must sum its arguments'); } console.log(await m.add(2,3));`]
  return { id: "goal-add", description: `User requirement: ${file} add sums its numeric arguments; add(2,3) outputs 5`, kind: "GOAL_ASSERTION", argv, expectedStdout: "5", timeoutMs: 10000 }
}
