import type { ReactNode } from "react"
import { panels, type PanelId } from "./panels"

export function Panel(props: { id: PanelId; children: ReactNode }) {
  return <div className="workspace-panel" data-panel={props.id} aria-label={`${panels[props.id].title} panel`}>{props.children}</div>
}
