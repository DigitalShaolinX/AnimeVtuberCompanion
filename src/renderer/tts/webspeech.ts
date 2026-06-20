/**
 * Web Speech (speechSynthesis) wrapper. Windows exposes SAPI voices here with
 * zero install. getVoices() is empty until the async `voiceschanged` event, so
 * we resolve voices lazily and cache them.
 */

let cachedVoices: SpeechSynthesisVoice[] = []
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null

export function isWebSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isWebSpeechAvailable()) return Promise.resolve([])
  if (voicesReady) return voicesReady

  voicesReady = new Promise((resolve) => {
    const synth = window.speechSynthesis
    const current = synth.getVoices()
    if (current.length > 0) {
      cachedVoices = current
      resolve(current)
      return
    }
    const handler = () => {
      cachedVoices = synth.getVoices()
      synth.removeEventListener('voiceschanged', handler)
      resolve(cachedVoices)
    }
    synth.addEventListener('voiceschanged', handler)
    // Fallback in case the event never fires (resolves with whatever we have).
    setTimeout(() => {
      cachedVoices = synth.getVoices()
      resolve(cachedVoices)
    }, 1500)
  })
  return voicesReady
}

export interface SpeakHandlers {
  onStart?: () => void
  onEnd?: () => void
  onError?: (err: string) => void
}

/** Speak `text` with the named voice (or default), wiring lifecycle handlers. */
export function speak(text: string, voiceName: string | null, handlers: SpeakHandlers): void {
  if (!isWebSpeechAvailable()) {
    handlers.onError?.('Web Speech API is not available in this environment.')
    return
  }
  const synth = window.speechSynthesis
  synth.cancel()

  const utter = new SpeechSynthesisUtterance(text)
  if (voiceName) {
    const voice = cachedVoices.find((v) => v.name === voiceName || v.voiceURI === voiceName)
    if (voice) utter.voice = voice
  }
  utter.rate = 1
  utter.pitch = 1.05

  utter.onstart = () => handlers.onStart?.()
  utter.onend = () => handlers.onEnd?.()
  utter.onerror = (e) => {
    handlers.onError?.(e.error ?? 'speech error')
    handlers.onEnd?.()
  }

  synth.speak(utter)
}

export function cancel(): void {
  if (isWebSpeechAvailable()) window.speechSynthesis.cancel()
}
