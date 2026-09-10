import { useEffect, useState } from "react"
import type { WorkspaceDirectory, WorkspaceFile } from "../../../../shared/protocol"
import { api } from "../../api"

export function FileBrowser(props: { projectId?: string; onOpen: (path: string) => void; explorer?: boolean }) {
  const [directory, setDirectory] = useState(".")
  const [listing, setListing] = useState<WorkspaceDirectory>()
  const [error, setError] = useState("")
  const [filter, setFilter] = useState("")
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const state = { live: true }
    setListing(undefined)
    setError("")
    if (props.projectId) void api.directory(props.projectId, directory).then((value) => { if (state.live) setListing(value) }, (failure: Error) => { if (state.live) setError(failure.message) })
    return () => { state.live = false }
  }, [props.projectId, directory, refresh])
  return <section className="pane"><header>{props.explorer ? "Project Explorer" : "Files"}<span className="spacer" /><button onClick={() => setRefresh((value) => value + 1)} disabled={!props.projectId}>Refresh</button></header>
    <div className="workspace-filebar"><button aria-label="Parent directory" disabled={directory === "."} onClick={() => setDirectory(directory.split("/").slice(0, -1).join("/") || ".")}>↑</button><span className="mono">{directory}</span></div>
    <div className="body">
      <input aria-label="Filter files" placeholder="Filter files…" value={filter} onChange={(event) => setFilter(event.target.value)} />
      {!props.projectId && <p className="muted">Select a project to browse its files.</p>}
      {error && <p className="error">{error}</p>}
      {props.projectId && !listing && !error && <p className="muted">Loading files…</p>}
      <div className="workspace-list" style={{ marginTop: 8 }}>{listing?.entries.filter((entry) => entry.name.toLowerCase().includes(filter.toLowerCase())).map((entry) => <button key={entry.path} title={entry.path} onClick={() => { if (entry.kind === "directory") setDirectory(entry.path); else props.onOpen(entry.path) }}><span aria-hidden="true">{entry.kind === "directory" ? "▸" : "·"}</span> {entry.name}</button>)}</div>
      {listing?.entries.length === 0 && <p className="muted">This directory is empty.</p>}
      {listing?.truncated && <p className="muted">Showing the first 500 entries. Open a subdirectory to narrow the list.</p>}
    </div></section>
}

/** File selection/content lives outside the layout store, and is discarded on project change. */
export function useProjectDocument(projectId?: string) {
  const [selection, select] = useState<{ projectId: string; path: string }>()
  const [document, setDocument] = useState<WorkspaceFile>()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [revision, refresh] = useState(0)
  const path = selection?.projectId === projectId ? selection?.path : undefined
  useEffect(() => {
    const state = { live: true }
    setDocument(undefined)
    setError("")
    setLoading(Boolean(projectId && path))
    if (projectId && path) void api.file(projectId, path).then((file) => { if (state.live) { setDocument(file); setLoading(false) } }, (failure: Error) => { if (state.live) { setError(failure.message); setLoading(false) } })
    return () => { state.live = false }
  }, [projectId, path, revision])
  return { document: path ? document : undefined, error, loading, path, open: (path: string) => { if (projectId) select({ projectId, path }) }, refresh: () => refresh((value) => value + 1) }
}

export function EditorPanel({ file }: { file: ReturnType<typeof useProjectDocument> }) {
  return <section className="pane"><header>Editor<span className="spacer" /><span>Read-only</span></header>
    <div className="workspace-filebar"><span className="mono">{file.path ?? "No file selected"}</span><span className="spacer" /><button disabled={!file.path || file.loading} onClick={file.refresh}>Reload file</button></div>
    {file.error && <p className="error">{file.error}</p>}
    {file.loading && <p className="workspace-empty">Loading file…</p>}
    {!file.path && <p className="workspace-empty">Open a file from Files or Project Explorer.</p>}
    {file.document && <pre className="workspace-code" tabIndex={0} aria-label="File content">{file.document.content}</pre>}
  </section>
}
