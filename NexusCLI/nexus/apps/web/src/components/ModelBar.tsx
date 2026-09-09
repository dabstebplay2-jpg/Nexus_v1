import { useState } from "react"
import type { ModelsResponse, ProjectPatch, ProjectSettings, RunMode } from "../../../shared/protocol"

/**
 * Model management. Every provider here speaks the one protocol the core supports, so the
 * selector changes a base URL, a model name and a budget — never the engine.
 */
export function ModelBar(props: {
  models?: ModelsResponse
  settings?: ProjectSettings
  disabled: boolean
  onSave: (patch: ProjectPatch) => void
  onProbe: () => Promise<string[]>
}) {
  const [discovered, setDiscovered] = useState<string[]>([])
  const [probing, setProbing] = useState(false)
  const [probeError, setProbeError] = useState("")
  if (!props.models || !props.settings) return <div className="muted">Loading model configuration…</div>
  const settings = props.settings
  const preset = props.models.presets.find((item) => item.id === settings.presetId)
  const mode = props.models.modes.find((item) => item.id === settings.mode)
  const options = [...new Set([settings.model, ...discovered, ...(preset?.suggestedModels ?? [])])]
  return (
    <>
      <div className="field">
        <label htmlFor="provider">Provider</label>
        <select
          id="provider"
          value={settings.presetId}
          disabled={props.disabled}
          onChange={(event) => {
            const next = props.models!.presets.find((item) => item.id === event.target.value)
            if (!next) return
            setDiscovered([])
            props.onSave({
              presetId: next.id,
              baseUrl: next.baseUrl,
              apiKeyEnv: next.apiKeyEnv,
              contextLength: next.contextLength,
              model: next.suggestedModels[0] ?? settings.model,
            })
          }}
        >
          {props.models.presets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
              {item.requiresKey ? (item.keyConfigured ? " · key set" : " · no key") : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="model">Model</label>
        <input
          id="model"
          list="nexus-models"
          value={settings.model}
          disabled={props.disabled}
          onChange={(event) => props.onSave({ model: event.target.value })}
        />
        <datalist id="nexus-models">
          {options.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
        <button
          disabled={props.disabled || probing}
          title={`List models from ${settings.baseUrl}`}
          onClick={async () => {
            setProbing(true)
            setProbeError("")
            try {
              setDiscovered(await props.onProbe())
            } catch (error) {
              setProbeError(error instanceof Error ? error.message : String(error))
            } finally {
              setProbing(false)
            }
          }}
        >
          {probing ? "…" : "Probe"}
        </button>
      </div>
      <div className="field">
        <label htmlFor="mode">Mode</label>
        <select
          id="mode"
          value={settings.mode}
          disabled={props.disabled}
          onChange={(event) => props.onSave({ mode: event.target.value as RunMode })}
        >
          {props.models.modes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <span className="tag" title={`${mode?.description ?? ""} ${preset?.note ?? ""}`.trim()}>
        {mode ? `${mode.maxTurns} turns` : ""}
      </span>
      {probeError && <span className="tag fail">{probeError}</span>}
    </>
  )
}
