import type { IJsonTabNode } from "flexlayout-react"

export const panels = {
  projects: { title: "Projects", icon: "◈" },
  chat: { title: "Chat", icon: "◌" },
  execution: { title: "Execution", icon: "▶" },
  timeline: { title: "Agent Timeline", icon: "≋" },
  files: { title: "Files", icon: "▤" },
  terminal: { title: "Terminal", icon: ">_" },
  changes: { title: "Changes / Diff", icon: "±" },
  plan: { title: "Plan", icon: "☷" },
  evidence: { title: "Evidence", icon: "✓" },
  permissions: { title: "Permissions", icon: "◇" },
  explorer: { title: "Project Explorer", icon: "▧" },
  logs: { title: "Logs", icon: "≡" },
  editor: { title: "Editor", icon: "⌘" },
  state: { title: "Agent State", icon: "◎" },
} as const

export type PanelId = keyof typeof panels
export const panelIds = Object.keys(panels) as PanelId[]
export const isPanelId = (value: unknown): value is PanelId =>
  typeof value === "string" && Object.hasOwn(panels, value)
export const panelTab = (id: PanelId): IJsonTabNode => ({
  type: "tab", id, name: panels[id].title, component: id,
})
