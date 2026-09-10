import { expect, test } from "@playwright/test"
import { Actions, DockLocation } from "flexlayout-react"
import { WorkspaceStore, workspaceStorageKey } from "../src/components/workspace/WorkspaceStore"
import { panelIds } from "../src/components/workspace/panels"

test("workspace store persists geometry and individual presets with no duplicate panels", () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const store = new WorkspaceStore(storage)
  store.move("execution", "center", DockLocation.CENTER)
  store.getSnapshot().model.doAction(Actions.adjustWeights("workspace", [30, 50, 20]))
  store.close("projects")
  store.open("terminal", "center")
  store.open("terminal", "center")
  const developer = store.getSnapshot().model.toJson()
  store.select("analysis")
  store.select("developer")
  expect(store.getSnapshot().model.toJson()).toEqual(developer)
  const resumed = new WorkspaceStore(storage)
  expect(resumed.getSnapshot().model.toJson()).toEqual(developer)
  expect(resumed.getSnapshot().warning).toBe("")
  expect(values.size).toBe(1)
  expect(values.has(workspaceStorageKey)).toBe(true)
  expect(values.get(workspaceStorageKey)).not.toContain("permission grants")
})

test("closing every tab and reopening a panel remains recoverable", () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const store = new WorkspaceStore(storage)
  panelIds.forEach((id) => store.close(id))
  const resumed = new WorkspaceStore(storage)
  expect(resumed.getSnapshot().warning).toBe("")
  resumed.open("chat")
  expect(resumed.getSnapshot().model.getNodeById("chat")).toBeDefined()
})

test("storage failure does not block layout changes", () => {
  const store = new WorkspaceStore({ getItem: () => null, setItem: () => { throw new Error("Quota exceeded") } })
  store.select("coding")
  store.close("changes")
  expect(store.getSnapshot().selected).toBe("coding")
  expect(store.getSnapshot().model.getNodeById("changes")).toBeUndefined()
  expect(store.getSnapshot().warning).toContain("window only")
})
