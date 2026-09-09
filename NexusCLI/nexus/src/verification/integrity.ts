import path from "node:path"
import { files, guard, hashFile } from "../tools/workspace"

/** Existing test harnesses are trust anchors. New regression tests may be added freely. */
export async function verificationAssets(workspace: string, commands: string[][]) {
  const commandFiles = commands.flat().filter((item) => /\.[cm]?[jt]s$|\.py$|\.sh$|\.ps1$/.test(item))
  const paths = (await files(workspace)).filter(
    (file) =>
      /(^|[\\/])(?:package\.json|(?:test|spec)[^\\/]*[\\/]|[^\\/]*\.(test|spec)\.)|(^|[\\/])(?:pytest|vitest|jest|tsconfig)[^\\/]*|Cargo\.toml$|go\.mod$/.test(
        file,
      ) || commandFiles.some((item) => path.resolve(workspace, item) === path.resolve(workspace, file)),
  )
  return Object.fromEntries(
    await Promise.all(paths.map(async (file) => [file, await hashFile(await guard(workspace, file))])),
  )
}
export async function changedAssets(workspace: string, assets: Record<string, string>) {
  const changed = await Promise.all(
    Object.entries(assets).map(async ([file, hash]) => {
      const current = await guard(workspace, file)
        .then(hashFile)
        .catch(() => undefined)
      return current === hash ? undefined : file
    }),
  )
  return changed.filter((file): file is string => file !== undefined)
}
