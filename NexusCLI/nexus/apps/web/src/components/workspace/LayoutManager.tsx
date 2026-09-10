import { useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { DockLocation, TabNode } from "flexlayout-react"
import { WorkspaceStore } from "./WorkspaceStore"
import { isPanelId, panelIds, panels } from "./panels"
import { layoutNames } from "./layouts"

export function PanelMenu({ store, target }: { store: WorkspaceStore; target?: string }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [anchor, setAnchor] = useState<{ element: HTMLDetailsElement; left: number; top: number }>()
  return <details name="workspace-menu" className={`workspace-menu${target ? " workspace-group-menu" : ""}`} onToggle={(event) => {
    const element = event.currentTarget
    const rect = element.getBoundingClientRect()
    setAnchor(element.open ? { element, left: Math.max(8, Math.min(rect.left, window.innerWidth - 256)), top: rect.bottom + 4 } : undefined)
  }}>
    <summary aria-label={target ? "Add panel to group" : undefined}>{target ? "+" : "Panels"}</summary>
    {anchor && createPortal(<div className="workspace-menu-content" style={{ position: "fixed", left: anchor.left, top: anchor.top }}>
      <p>Open in {target ? "this" : "the active"} group</p>
      {panelIds.map((id) => <button key={id} onClick={() => {
        store.open(id, target)
        anchor.element.open = false
      }} aria-label={`Open ${panels[id].title}`}>
        <span aria-hidden="true">{state.model.getNodeById(id) ? "✓" : "+"}</span> {panels[id].title}
      </button>)}
    </div>, document.body)}
  </details>
}

export function LayoutManager({ store }: { store: WorkspaceStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [name, setName] = useState("")
  const active = state.model.getActiveTabset()
  const selected = active?.getSelectedNode()
  const panel = selected instanceof TabNode && isPanelId(selected.getComponent()) ? selected.getComponent() : undefined
  return <div className="workspace-toolbar">
    <span className="workspace-label">WORKSPACE</span>
    <select aria-label="Workspace layout" value={state.selected} onChange={(event) => store.select(event.target.value)}>
      {state.layouts.map((layout) => <option value={layout.id} key={layout.id}>{layout.name}</option>)}
    </select>
    <PanelMenu store={store} />
    <details name="workspace-menu" className="workspace-menu">
      <summary>Arrange</summary>
      <div className="workspace-menu-content">
        <p>{panel && isPanelId(panel) ? `Move ${panels[panel].title}` : "Select a tab first"}</p>
        {[["Left", DockLocation.LEFT], ["Right", DockLocation.RIGHT], ["Above", DockLocation.TOP], ["Below", DockLocation.BOTTOM]].map(([label, location]) =>
          <button key={String(label)} disabled={!panel} onClick={() => {
            if (isPanelId(panel) && active) store.move(panel, active.getId(), location as DockLocation)
          }}>New group {String(label).toLowerCase()}</button>)}
        {store.groups().filter((group) => group.id !== active?.getId()).map((group) =>
          <button key={group.id} disabled={!panel} onClick={() => { if (isPanelId(panel)) store.move(panel, group.id, DockLocation.CENTER) }}>Join {group.name}</button>)}
      </div>
    </details>
    <details name="workspace-menu" className="workspace-menu">
      <summary>Layouts</summary>
      <form className="workspace-menu-content" onSubmit={(event) => { event.preventDefault(); store.saveAs(name); setName("") }}>
        <label htmlFor="layout-name">Save current arrangement as</label>
        <input id="layout-name" value={name} maxLength={48} placeholder="My workspace" onChange={(event) => setName(event.target.value)} />
        <button type="submit" disabled={!name.trim() || state.layouts.length >= 23}>Save layout</button>
        <button type="button" onClick={() => store.reset()}>Reset to preset</button>
        <button type="button" disabled={Object.hasOwn(layoutNames, state.selected)} onClick={() => store.deleteSelected()}>Delete saved layout</button>
      </form>
    </details>
    <span className="spacer" />
    <span className="workspace-hint">Drag tabs to group or split · layouts save automatically</span>
  </div>
}
