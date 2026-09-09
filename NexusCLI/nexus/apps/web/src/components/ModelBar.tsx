import { useEffect, useRef, useState } from "react"
import type { ModelsResponse, ProbeResponse, ProjectPatch, ProjectSettings, RunMode } from "../../../shared/protocol"
import { api } from "../api"

/** Commit edits together before diagnosis; partial input never becomes run configuration. */
export function ModelBar(props: {
  models?: ModelsResponse
  settings?: ProjectSettings
  disabled: boolean
  onSave: (patch: ProjectPatch) => Promise<ProjectSettings>
  onPending: (pending: boolean) => void
}) {
  const [draft, setDraft] = useState(props.settings)
  const [diagnostic, setDiagnostic] = useState<ProbeResponse>()
  const [discovered, setDiscovered] = useState<string[]>([])
  const [manual, setManual] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")
  const generation = useRef(0)
  const dirty = JSON.stringify(draft) !== JSON.stringify(props.settings)
  useEffect(() => {
    props.onPending(working || dirty)
  }, [working, dirty, props.onPending])
  useEffect(() => {
    setDraft(props.settings)
  }, [props.settings])
  useEffect(
    () => () => {
      generation.current++
    },
    [],
  )
  if (!props.models || !draft) return <div className="muted">Loading model configuration…</div>
  const settings = draft
  const disabled = props.disabled || working
  const preset = props.models.presets.find((item) => item.id === settings.presetId)
  const edit = (patch: Partial<ProjectSettings>, resetModels = false) => {
    generation.current++
    setDraft({ ...settings, ...patch })
    setDiagnostic(undefined)
    setError("")
    if (resetModels) {
      setDiscovered([])
      setManual(false)
    }
  }
  const execute = async (action: "save" | "discover" | "probe") => {
    const current = ++generation.current
    setWorking(true)
    setError("")
    setDiagnostic(undefined)
    try {
      const saved = await props.onSave(settings)
      if (current !== generation.current) return
      setDraft(saved)
      if (action === "save") return
      const result = await (action === "discover" ? api.discover(saved) : api.probe(saved))
      if (current !== generation.current) return
      setDiagnostic(result)
      setDiscovered(result.models)
      setManual(result.discovery === "unsupported")
    } catch (failure) {
      if (current === generation.current) setError(failure instanceof Error ? failure.message : "Request failed")
    } finally {
      if (current === generation.current) setWorking(false)
    }
  }
  return (
    <div className="model-config">
      <div className="model-controls">
        <div className="field">
          <label htmlFor="provider">Provider</label>
          <select
            id="provider"
            value={settings.presetId}
            disabled={disabled}
            onChange={(event) => {
              const next = props.models!.presets.find((item) => item.id === event.target.value)
              if (!next) return
              edit(
                {
                  presetId: next.id,
                  baseUrl: next.baseUrl,
                  apiKeyEnv: next.apiKeyEnv,
                  contextLength: next.contextLength,
                },
                true,
              )
            }}
          >
            {props.models.presets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field endpoint-field">
          <label htmlFor="endpoint">Endpoint / Base URL</label>
          <input
            id="endpoint"
            value={settings.baseUrl}
            disabled={disabled}
            placeholder="http://127.0.0.1:8888/v1"
            onChange={(event) => edit({ baseUrl: event.target.value }, true)}
          />
        </div>
        <div className="field">
          <label htmlFor="key-env">API key variable (optional)</label>
          <input
            id="key-env"
            value={settings.apiKeyEnv}
            disabled={disabled}
            placeholder="No key"
            autoComplete="off"
            onChange={(event) => edit({ apiKeyEnv: event.target.value }, true)}
          />
        </div>
        <button disabled={disabled} onClick={() => void execute("discover")}>
          Discover models
        </button>
        <div className="field">
          <label htmlFor="model">Model</label>
          {manual ? (
            <input
              id="model"
              value={settings.model}
              disabled={disabled}
              onChange={(event) => edit({ model: event.target.value })}
            />
          ) : (
            <select
              id="model"
              value={settings.model}
              disabled={disabled}
              onChange={(event) => edit({ model: event.target.value })}
            >
              {!discovered.includes(settings.model) && (
                <option value={settings.model}>{settings.model} (saved; not discovered)</option>
              )}
              {discovered.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          )}
        </div>
        <label className="manual-model">
          <input
            type="checkbox"
            checked={manual}
            disabled={disabled}
            onChange={(event) => setManual(event.target.checked)}
          />
          Manual model ID
        </label>
        <button disabled={disabled || !settings.model.trim()} onClick={() => void execute("probe")}>
          Probe
        </button>
        <button disabled={disabled || !dirty} onClick={() => void execute("save")}>
          Save configuration
        </button>
        <div className="field">
          <label htmlFor="mode">Mode</label>
          <select
            id="mode"
            value={settings.mode}
            disabled={disabled}
            onChange={(event) => edit({ mode: event.target.value as RunMode })}
          >
            {props.models.modes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="model-status" role="status" aria-live="polite">
        {working ? (
          "Checking / saving…"
        ) : diagnostic ? (
          <>
            <span className={`tag ${diagnostic.ok ? "pass" : "fail"}`}>
              {diagnostic.stage === "ready" ? "● Connected" : diagnostic.stage}
            </span>
            {diagnostic.message} {diagnostic.baseUrl && <code>{diagnostic.baseUrl}</code>}
            {diagnostic.statusCode !== undefined && ` · HTTP ${diagnostic.statusCode}`}
            {` · Key ${diagnostic.keyConfigured ? "configured" : "not set"}. `}
            {diagnostic.suggestion}
          </>
        ) : dirty ? (
          "Unsaved changes. Save, Discover or Probe applies this configuration before use."
        ) : (
          "Connection not checked. Discover models, select one, then Probe."
        )}
        {error && <span className="fail">{error}</span>}
      </div>
      <div className="muted">
        {preset?.note} API key values belong in the Nexus server environment; enter only the variable name here.
      </div>
    </div>
  )
}
