import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { Live2DStage } from './live2d/Live2DStage'
import type { Live2DController } from './live2d/live2dController'
import { parseEmotion } from './live2d/emotion'
import { ChatPanel } from './chat/ChatPanel'
import { useChat, type UiMessage } from './chat/useChat'
import { TtsController } from './tts/ttsController'
import { SettingsDrawer } from './settings/SettingsDrawer'

export function App() {
  const live2dRef = useRef<Live2DController | null>(null)
  const ttsRef = useRef<TtsController | null>(null)

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const [models, setModels] = useState<string[]>([])
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  // When a reply finishes: strip the emotion tag, play the expression, speak it.
  const onReplyComplete = useCallback((raw: string) => {
    const { text, emotion } = parseEmotion(raw)
    live2dRef.current?.playEmotion(emotion)
    ttsRef.current?.speak(text, settingsRef.current)
  }, [])

  const chat = useChat({
    onReplyComplete,
    cleanReply: (raw) => parseEmotion(raw).text
  })

  // Initial load: settings, models, prior conversation.
  useEffect(() => {
    ;(async () => {
      const [loadedSettings, loadedModels, memory] = await Promise.all([
        window.companion.getSettings(),
        window.companion.listModels(),
        window.companion.getMemory()
      ])
      setSettings(loadedSettings)
      setModels(loadedModels)
      const history: UiMessage[] = memory.turns.map((t, i) => ({
        id: `h${i}`,
        role: t.role,
        text: t.role === 'assistant' ? parseEmotion(t.content).text : t.content
      }))
      if (history.length > 0) chat.loadHistory(history)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReady = useCallback((controller: Live2DController) => {
    live2dRef.current = controller
    const tts = new TtsController(controller)
    ttsRef.current = tts
    tts.prime().then(setVoices)
    controller.playEmotion('happy')
  }, [])

  const refreshModels = useCallback(async () => {
    setModels(await window.companion.listModels())
  }, [])

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = await window.companion.setSettings(patch)
    setSettings(next)
  }, [])

  const clearMemory = useCallback(async () => {
    await window.companion.clearMemory()
    chat.reset()
    setDrawerOpen(false)
  }, [chat])

  return (
    <div className="app">
      <main className="main">
        <Live2DStage onReady={handleReady} />
        <button className="settings-btn" onClick={() => setDrawerOpen(true)} title="Settings">
          ⚙
        </button>
      </main>

      <ChatPanel
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        error={chat.error}
        onSend={chat.send}
        onCancel={chat.cancel}
      />

      <SettingsDrawer
        open={drawerOpen}
        settings={settings}
        models={models}
        voices={voices}
        onClose={() => setDrawerOpen(false)}
        onSave={saveSettings}
        onClearMemory={clearMemory}
        onRefreshModels={refreshModels}
      />
    </div>
  )
}
