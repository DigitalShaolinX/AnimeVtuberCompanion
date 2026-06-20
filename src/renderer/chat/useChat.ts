import { useCallback, useEffect, useRef, useState } from 'react'

export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  /** Display text (emotion tag stripped for assistant messages). */
  text: string
  streaming?: boolean
}

export interface UseChatOptions {
  /** Called once with the full raw reply (tag included) when a turn finishes. */
  onReplyComplete?: (raw: string) => void
  /** Map a raw assistant reply to its display text (tag stripped). */
  cleanReply?: (raw: string) => string
}

let idSeq = 0
const nextId = () => `m${Date.now()}-${idSeq++}`

export function useChat(options: UseChatOptions = {}) {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [isStreaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  // Keep latest callbacks without re-subscribing.
  const optsRef = useRef(options)
  optsRef.current = options

  const send = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    setError(null)
    setStreaming(true)

    const assistantId = nextId()
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'user', text: trimmed },
      { id: assistantId, role: 'assistant', text: '', streaming: true }
    ])

    let raw = ''
    const updateAssistant = (display: string, streaming: boolean) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, text: display, streaming } : m))
      )

    unsubRef.current = window.companion.chat(trimmed, {
      onToken: (delta) => {
        raw += delta
        const clean = optsRef.current.cleanReply?.(raw) ?? raw
        updateAssistant(clean, true)
      },
      onDone: ({ content }) => {
        const final = content || raw
        const clean = optsRef.current.cleanReply?.(final) ?? final
        updateAssistant(clean, false)
        setStreaming(false)
        unsubRef.current = null
        optsRef.current.onReplyComplete?.(final)
      },
      onError: ({ message }) => {
        setError(message)
        setStreaming(false)
        unsubRef.current = null
        setMessages((prev) => prev.filter((m) => m.id !== assistantId))
      }
    })
  }, [])

  const cancel = useCallback(() => {
    window.companion.cancelChat()
    unsubRef.current?.()
    unsubRef.current = null
    setStreaming(false)
  }, [])

  const reset = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  const loadHistory = useCallback((items: UiMessage[]) => {
    setMessages(items)
  }, [])

  useEffect(() => () => unsubRef.current?.(), [])

  return { messages, isStreaming, error, send, cancel, reset, loadHistory }
}
