import type { IJsonModel, IJsonTabSetNode } from "flexlayout-react"
import { panelTab, type PanelId } from "./panels"

export const layoutNames = { developer: "Developer", analysis: "Analysis", coding: "Coding" } as const
export type PresetId = keyof typeof layoutNames

const group = (id: string, tabs: PanelId[], weight: number, active = false): IJsonTabSetNode => ({
  type: "tabset", id, weight, active, children: tabs.map(panelTab),
})

export const workspaceDefaults: IJsonModel["global"] = {
  tabEnableRename: false,
  tabEnablePopout: false,
  tabEnableClose: true,
  tabSetEnableDeleteWhenEmpty: true,
  tabSetMinWidth: 160,
  tabSetMinHeight: 100,
  enableEdgeDock: true,
}

/** Presets are starting points. Subsequent structure is entirely user-controlled. */
export function preset(id: PresetId): IJsonModel {
  const children: IJsonModel["layout"]["children"] = id === "analysis"
    ? [group("left", ["files", "explorer", "projects"], 23), group("center", ["timeline", "chat"], 47, true), group("right", ["evidence", "plan"], 30)]
    : id === "coding"
      ? [group("left", ["explorer", "files", "projects"], 20), {
          type: "row", id: "main-column", weight: 55, children: [group("center", ["editor", "chat"], 70, true), group("bottom", ["terminal", "timeline", "logs"], 30)],
        }, group("right", ["changes", "execution", "permissions"], 25)]
      : [group("left", ["projects", "files", "explorer"], 22), group("center", ["chat"], 46, true), group("right", ["execution", "state"], 32)]
  return { global: workspaceDefaults, borders: [], layout: { type: "row", id: "workspace", children } }
}
