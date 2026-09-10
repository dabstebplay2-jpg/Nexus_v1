import { Actions, DockLocation, Model, TabNode, TabSetNode } from "flexlayout-react"
import type { IJsonModel } from "flexlayout-react"
import { isPanelId, panelTab, panels, type PanelId } from "./panels"
import { layoutNames, preset, workspaceDefaults, type PresetId } from "./layouts"

export const workspaceStorageKey = "nexus.workspace.v1"
type SavedLayout = { id: string; name: string; layout: IJsonModel }
type SavedWorkspace = { version: 1; selected: string; layouts: SavedLayout[] }
type Snapshot = { model: Model; selected: string; layouts: SavedLayout[]; revision: number; warning: string }
type StoragePort = Pick<Storage, "getItem" | "setItem">

/** Contains UI geometry only. No project identity, task, transcript, file content or permission grants. */
export class WorkspaceStore {
  private snapshot: Snapshot
  private listeners = new Set<() => void>()
  private detach?: () => void
  constructor(private readonly storage?: StoragePort) {
    const defaults = Object.entries(layoutNames).map(([id, name]) => ({ id, name, layout: preset(id as PresetId) }))
    const restored = this.restore(defaults)
    this.snapshot = { ...restored, model: Model.fromJson(restored.layouts.find((item) => item.id === restored.selected)!.layout), revision: 0 }
    this.watch()
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private watch() {
    this.detach?.()
    const model = this.snapshot.model
    const listener = { onAfterAction: () => this.persist() }
    model.addChangeListener(listener)
    this.detach = () => model.removeChangeListener(listener)
  }
  private persist() {
    const layouts = this.snapshot.layouts.map((item) => item.id === this.snapshot.selected
      ? { ...item, layout: this.snapshot.model.toJson() } : item)
    const saved: SavedWorkspace = { version: 1, selected: this.snapshot.selected, layouts }
    const warning = this.snapshot.warning
    try {
      if (!this.storage) throw new Error("Storage unavailable")
      this.storage.setItem(workspaceStorageKey, JSON.stringify(saved))
      this.snapshot = { ...this.snapshot, layouts, revision: this.snapshot.revision + 1, warning: warning.startsWith("Layout storage") ? "" : warning }
    } catch {
      this.snapshot = { ...this.snapshot, layouts, revision: this.snapshot.revision + 1, warning: "Layout storage is unavailable. Changes will last for this window only." }
    }
    this.listeners.forEach((listener) => listener())
  }
  private restore(defaults: SavedLayout[]) {
    try {
      const text = this.storage?.getItem(workspaceStorageKey)
      if (!text) return { selected: "developer", layouts: defaults, warning: "" }
      if (text.length > 500000) throw new Error("Layout too large")
      const saved = JSON.parse(text) as SavedWorkspace
      if (saved.version !== 1 || !Array.isArray(saved.layouts) || saved.layouts.length > 23) throw new Error("Unknown format")
      const ids = new Set<string>()
      const layouts = saved.layouts.map((item) => {
        if (!item || typeof item.id !== "string" || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 48)
          throw new Error("Invalid layout")
        ids.add(item.id)
        return { id: item.id, name: item.name, layout: validateLayout(item.layout) }
      })
      if (!layouts.some((item) => item.id === saved.selected)) throw new Error("Missing selected layout")
      return { selected: saved.selected, layouts: [...layouts, ...defaults.filter((item) => !ids.has(item.id))], warning: "" }
    } catch {
      return { selected: "developer", layouts: defaults, warning: "Saved workspace could not be restored. Developer layout was recovered." }
    }
  }
  select(id: string) {
    const selected = this.snapshot.layouts.find((item) => item.id === id)
    if (!selected) return
    this.snapshot = { ...this.snapshot, selected: id, model: Model.fromJson(selected.layout, this.snapshot.model) }
    this.watch()
    this.persist()
  }
  saveAs(name: string) {
    if (!name.trim() || name.trim().length > 48 || this.snapshot.layouts.length >= 23) return
    const id = `custom-${crypto.randomUUID()}`
    this.snapshot = { ...this.snapshot, selected: id, layouts: [...this.snapshot.layouts, { id, name: name.trim(), layout: this.snapshot.model.toJson() }] }
    this.persist()
  }
  deleteSelected() {
    if (Object.hasOwn(layoutNames, this.snapshot.selected)) return
    this.snapshot = { ...this.snapshot, layouts: this.snapshot.layouts.filter((item) => item.id !== this.snapshot.selected) }
    this.select("developer")
  }
  reset() {
    const id = Object.hasOwn(layoutNames, this.snapshot.selected) ? this.snapshot.selected as PresetId : "developer"
    this.snapshot = { ...this.snapshot, selected: id, model: Model.fromJson(preset(id), this.snapshot.model), warning: "" }
    this.watch()
    this.persist()
  }
  open(id: PanelId, target?: string) {
    const model = this.snapshot.model
    if (model.getNodeById(id)) {
      model.doAction(Actions.selectTab(id))
      return
    }
    const tabset = target ?? model.getActiveTabset()?.getId() ?? model.getFirstTabSet()?.getId() ?? model.getRootRow()!.getId()
    model.doAction(Actions.addNode(panelTab(id), tabset, DockLocation.CENTER, -1, true))
  }
  close(id: PanelId) {
    if (this.snapshot.model.getNodeById(id)) this.snapshot.model.doAction(Actions.deleteTab(id))
  }
  move(id: PanelId, target: string, location: DockLocation) {
    this.snapshot.model.doAction(Actions.moveNode(id, target, location, -1, true))
  }
  groups() {
    const groups: { id: string; name: string }[] = []
    this.snapshot.model.visitNodes((node) => {
      if (node instanceof TabSetNode) groups.push({ id: node.getId(), name: node.getChildren().map((tab) => tab instanceof TabNode ? tab.getName() : "").filter(Boolean).join(" + ") || "Empty group" })
    })
    return groups
  }
}

/** Bound and validate restored trees before allowing the docking library to hydrate them. */
function validateLayout(layout: IJsonModel): IJsonModel {
  const ids = new Set<string>()
  const visit = (node: unknown, depth: number): void => {
    if (!node || typeof node !== "object" || depth > 16 || ids.size > 100) throw new Error("Invalid tree")
    const item = node as Record<string, unknown>
    if (typeof item.id !== "string" || ids.has(item.id)) throw new Error("Invalid node id")
    ids.add(item.id)
    if (item.type === "tab") {
      if (!isPanelId(item.component) || item.id !== item.component) throw new Error("Unknown panel")
      item.name = panels[item.component].title
      delete item.config
      return
    }
    if (!["row", "tabset"].includes(String(item.type)) || !Array.isArray(item.children)) throw new Error("Invalid group")
    if (item.weight !== undefined && (typeof item.weight !== "number" || !Number.isFinite(item.weight) || item.weight <= 0)) throw new Error("Invalid size")
    item.children.forEach((child) => visit(child, depth + 1))
  }
  if (!layout || layout.layout?.type !== "row") throw new Error("Missing root")
  visit(layout.layout, 0)
  return Model.fromJson({ global: workspaceDefaults, borders: [], layout: layout.layout }).toJson()
}
