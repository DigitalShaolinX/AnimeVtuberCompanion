import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'

interface SettingsDrawerProps {
  open: boolean
  settings: Settings
  models: string[]
  voices: SpeechSynthesisVoice[]
  onClose: () => void
  onSave: (patch: Partial<Settings>) => void
  onClearMemory: () => void
  onRefreshModels: () => void
}

export function SettingsDrawer({
  open,
  settings,
  models,
  voices,
  onClose,
  onSave,
  onClearMemory,
  onRefreshModels
}: SettingsDrawerProps) {
  const [draft, setDraft] = useState<Settings>(settings)

  // Re-sync when the underlying settings change or the drawer reopens.
  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  if (!open) return null

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const save = () => {
    onSave(draft)
    onClose()
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>Settings</h2>
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <label className="field">
          <span>Model</span>
          <div className="row">
            <select value={draft.model} onChange={(e) => set('model', e.target.value)}>
              {!models.includes(draft.model) && <option value={draft.model}>{draft.model}</option>}
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button className="ghost" onClick={onRefreshModels} title="Reload from Ollama">
              ↻
            </button>
          </div>
        </label>

        <label className="field">
          <span>Persona (system prompt)</span>
          <textarea
            className="persona"
            value={draft.persona}
            rows={8}
            onChange={(e) => set('persona', e.target.value)}
          />
        </label>

        <label className="field">
          <span>Voice provider</span>
          <select
            value={draft.ttsProvider}
            onChange={(e) => set('ttsProvider', e.target.value as Settings['ttsProvider'])}
          >
            <option value="webspeech">Web Speech (built-in)</option>
            <option value="piper">Piper (high quality, local binary)</option>
          </select>
        </label>

        {draft.ttsProvider === 'webspeech' && (
          <label className="field">
            <span>Voice</span>
            <select
              value={draft.voiceName ?? ''}
              onChange={(e) => set('voiceName', e.target.value || null)}
            >
              <option value="">System default</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
        )}

        {draft.ttsProvider === 'piper' && (
          <>
            <label className="field">
              <span>Piper executable path</span>
              <input
                value={draft.piperPath ?? ''}
                placeholder="C:\\piper\\piper.exe"
                onChange={(e) => set('piperPath', e.target.value || null)}
              />
            </label>
            <label className="field">
              <span>Piper voice (.onnx) path</span>
              <input
                value={draft.piperVoicePath ?? ''}
                placeholder="C:\\piper\\en_US-amy-medium.onnx"
                onChange={(e) => set('piperVoicePath', e.target.value || null)}
              />
            </label>
          </>
        )}

        <div className="drawer-actions">
          <button className="danger" onClick={onClearMemory}>
            Clear memory
          </button>
          <div className="spacer" />
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" onClick={save}>
            Save
          </button>
        </div>
      </aside>
    </div>
  )
}
