import { panels, type PanelId } from "./panels"

export function Tab(props: { id: PanelId; attention?: boolean }) {
  return <span className="workspace-tab-title" data-panel-tab={props.id}>
    <span className="workspace-tab-icon" aria-hidden="true">{panels[props.id].icon}</span>
    {panels[props.id].title}
    {props.attention && <span className="workspace-attention" aria-label="Approval required">●</span>}
  </span>
}
