/**
 * Shared types and contracts used across main, preload, and renderer.
 * Keep this dependency-free (no electron / node imports) so it can be
 * imported from the renderer and unit tests alike.
 */

export const EMOTIONS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'shy'
] as const

export type Emotion = (typeof EMOTIONS)[number]

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

/** A persisted conversational turn (what the user/assistant actually said). */
export interface StoredTurn {
  role: 'user' | 'assistant'
  content: string
  /** Epoch millis. */
  ts: number
}

/** A durable fact the companion has learned about the user. */
export interface MemoryFact {
  text: string
  ts: number
}

export type TtsProvider = 'webspeech' | 'piper'

export interface Settings {
  /** Ollama model tag, e.g. "llama3.2". */
  model: string
  /** User-editable system persona. Sole driver of behaviour. */
  persona: string
  /** Web Speech voice name (voiceURI/name), or null for default. */
  voiceName: string | null
  ttsProvider: TtsProvider
  /** Path to a piper executable when ttsProvider === 'piper'. */
  piperPath: string | null
  /** Path to a piper voice .onnx model. */
  piperVoicePath: string | null
  /** Conversational turns kept verbatim in the prompt window. */
  historyWindow: number
  /** Turn count past which old history gets summarised. */
  summarizeThreshold: number
}

export const DEFAULT_PERSONA =
  'You are a warm, playful anime companion who genuinely cares about the ' +
  'person you talk with. You speak casually and affectionately, remember ' +
  'what they tell you, and react with real feeling.\n\n' +
  'At the very start of every reply, output exactly one emotion tag in ' +
  'square brackets describing your mood for that reply, chosen from: ' +
  '[neutral] [happy] [sad] [angry] [surprised] [shy]. Put nothing before ' +
  'the tag. Then write your reply as normal.'

export const DEFAULT_SETTINGS: Settings = {
  model: 'llama3.2',
  persona: DEFAULT_PERSONA,
  voiceName: null,
  ttsProvider: 'webspeech',
  piperPath: null,
  piperVoicePath: null,
  historyWindow: 12,
  summarizeThreshold: 40
}

/** IPC channel names (single source of truth, no magic strings). */
export const IPC = {
  chatStart: 'chat:start',
  chatToken: 'chat:token',
  chatDone: 'chat:done',
  chatError: 'chat:error',
  chatCancel: 'chat:cancel',
  listModels: 'ollama:list-models',
  pullModel: 'ollama:pull-model',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  getMemory: 'memory:get',
  clearMemory: 'memory:clear',
  ttsSynthesize: 'tts:synthesize',
  getModelUrl: 'assets:model-url'
} as const

/** Custom protocol used to serve the gitignored resources/ dir to the renderer. */
export const ASSET_SCHEME = 'companion'

export interface ChatStartPayload {
  /** The new user message text. */
  text: string
}

export interface ChatDonePayload {
  /** Full assistant reply (raw, including any emotion tag). */
  content: string
}

export interface ChatErrorPayload {
  message: string
}

export interface MemorySnapshot {
  turns: StoredTurn[]
  facts: MemoryFact[]
  summary: string
}

export interface PiperResult {
  /** file:// URL to the generated WAV, consumable by model.speak(). */
  wavUrl: string
}

/**
 * The typed surface exposed on `window.companion` by the preload bridge.
 * The renderer programs against this; the preload implements it.
 */
export interface CompanionApi {
  /** Start a streaming chat turn. Returns an unsubscribe for the listeners. */
  chat(
    text: string,
    handlers: {
      onToken: (delta: string) => void
      onDone: (payload: ChatDonePayload) => void
      onError: (payload: ChatErrorPayload) => void
    }
  ): () => void
  cancelChat(): void
  listModels(): Promise<string[]>
  pullModel(model: string): Promise<{ ok: boolean; error?: string }>
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  getMemory(): Promise<MemorySnapshot>
  clearMemory(): Promise<void>
  synthesize(text: string): Promise<PiperResult>
  /** Resolve the sample model's .model3.json as a companion:// URL, or null. */
  getModelUrl(): Promise<string | null>
}

declare global {
  interface Window {
    companion: CompanionApi
    /** Injected by the classic <script> that loads the Cubism Core runtime. */
    Live2DCubismCore?: unknown
  }
}
