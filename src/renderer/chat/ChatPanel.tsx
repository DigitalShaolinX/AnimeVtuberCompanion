import { useEffect, useRef, useState } from 'react'
import type { UiMessage } from './useChat'

interface ChatPanelProps {
  messages: UiMessage[]
  isStreaming: boolean
  error: string | null
  onSend: (text: string) => void
  onCancel: () => void
}

export function ChatPanel({ messages, isStreaming, error, onSend, onCancel }: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = () => {
    if (!draft.trim() || isStreaming) return
    onSend(draft)
    setDraft('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">Say hi to your companion…</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            {m.text || (m.streaming ? '…' : '')}
            {m.streaming && <span className="caret" />}
          </div>
        ))}
        {error && <div className="bubble error">{error}</div>}
      </div>

      <div className="chat-input">
        <textarea
          value={draft}
          placeholder="Type a message…  (Enter to send, Shift+Enter for newline)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
        />
        {isStreaming ? (
          <button className="stop" onClick={onCancel}>
            Stop
          </button>
        ) : (
          <button className="send" onClick={submit} disabled={!draft.trim()}>
            Send
          </button>
        )}
      </div>
    </div>
  )
}
