import { useState, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { Layout } from "flexlayout-react"
import "flexlayout-react/style/dark.css"
import { WorkspaceStore } from "./WorkspaceStore"
import { LayoutManager, PanelMenu } from "./LayoutManager"
import { Panel } from "./Panel"
import { Tab } from "./Tab"
import { isPanelId, type PanelId } from "./panels"
import "./workspace.css"

export function useWorkspace() {
  return useState(() => {
    try { return new WorkspaceStore(window.localStorage) }
    catch { return new WorkspaceStore() }
  })[0]
}

export function DockLayout(props: { store: WorkspaceStore; renderPanel: (id: PanelId) => ReactNode; pendingPermission?: boolean }) {
  const state = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot)
  return <div className="workspace">
    <LayoutManager store={props.store} />
    {state.warning && <div className="workspace-warning">{state.warning}</div>}
    <div className="workspace-dock" data-testid="workspace-dock">
      <Layout model={state.model}
        factory={(node) => {
          const id = node.getComponent()
          return isPanelId(id) ? <Panel id={id}>{props.renderPanel(id)}</Panel> : null
        }}
        onRenderTab={(node, values) => {
          const id = node.getComponent()
          if (isPanelId(id)) values.content = <Tab id={id} attention={id === "permissions" && props.pendingPermission} />
        }}
        onRenderTabSet={(node, values) => {
          values.stickyButtons.push(<PanelMenu key="add" store={props.store} target={node.getId()} />)
        }}
      />
    </div>
  </div>
}
