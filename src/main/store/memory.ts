import type { ChatMessage, MemoryFact, MemorySnapshot, Settings, StoredTurn } from '@shared/types'
import { chatOnce } from '../ollama'
import type { CompanionDb } from './db'

export interface BuildMessagesInput {
  persona: string
  facts: MemoryFact[]
  summary: string
  turns: StoredTurn[]
  userText: string
  /** How many of the most recent turns to include verbatim. */
  historyWindow: number
}

/**
 * Assemble the message array sent to Ollama:
 *   system(persona + known facts + rolling summary) + last N turns + new user msg.
 * Pure function — no db, no clock — so prompt assembly is unit-testable.
 */
export function buildMessages(input: BuildMessagesInput): ChatMessage[] {
  const parts: string[] = [input.persona.trim()]

  if (input.facts.length > 0) {
    const lines = input.facts.map((f) => `- ${f.text}`).join('\n')
    parts.push(`What you know about them:\n${lines}`)
  }
  if (input.summary.trim()) {
    parts.push(`Summary of earlier conversation:\n${input.summary.trim()}`)
  }

  const messages: ChatMessage[] = [{ role: 'system', content: parts.join('\n\n') }]

  const window = Math.max(0, input.historyWindow)
  const recent = window > 0 ? input.turns.slice(-window) : []
  for (const turn of recent) {
    messages.push({ role: turn.role, content: turn.content })
  }

  messages.push({ role: 'user', content: input.userText })
  return messages
}

/**
 * True when the verbatim history has grown past the threshold and should be
 * compressed. Pure boundary check for easy testing.
 */
export function shouldSummarize(turnCount: number, threshold: number): boolean {
  return turnCount > threshold
}

/** Lightweight "my name is X" / "I ... " style fact extraction. */
export function extractFacts(userText: string): string[] {
  const facts: string[] = []
  const trimmed = userText.trim()
  const name = trimmed.match(/\bmy name is\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)?)/i)
  if (name) facts.push(`Their name is ${name[1].trim()}.`)
  const like = trimmed.match(/\bi (?:really )?(?:like|love|enjoy|prefer)\s+([^.!?\n]{2,60})/i)
  if (like) facts.push(`They like ${like[1].trim()}.`)
  const dislike = trimmed.match(/\bi (?:really )?(?:hate|dislike|can't stand)\s+([^.!?\n]{2,60})/i)
  if (dislike) facts.push(`They dislike ${dislike[1].trim()}.`)
  return facts
}

/**
 * Stateful wrapper around the db that records turns/facts and triggers
 * background summarisation. Construction is cheap; all persistence is async.
 */
export class MemoryStore {
  constructor(private readonly db: CompanionDb) {}

  snapshot(): MemorySnapshot {
    return {
      turns: this.db.data.turns,
      facts: this.db.data.facts,
      summary: this.db.data.summary
    }
  }

  buildPrompt(userText: string, settings: Settings): ChatMessage[] {
    return buildMessages({
      persona: settings.persona,
      facts: this.db.data.facts,
      summary: this.db.data.summary,
      turns: this.db.data.turns,
      userText,
      historyWindow: settings.historyWindow
    })
  }

  async recordUser(text: string): Promise<void> {
    this.db.data.turns.push({ role: 'user', content: text, ts: Date.now() })
    for (const fact of extractFacts(text)) {
      if (!this.db.data.facts.some((f) => f.text === fact)) {
        this.db.data.facts.push({ text: fact, ts: Date.now() })
      }
    }
    await this.db.write()
  }

  async recordAssistant(text: string): Promise<void> {
    this.db.data.turns.push({ role: 'assistant', content: text, ts: Date.now() })
    await this.db.write()
  }

  async clear(): Promise<void> {
    this.db.data.turns = []
    this.db.data.facts = []
    this.db.data.summary = ''
    await this.db.write()
  }

  /**
   * If history has outgrown the threshold, compress the oldest turns into the
   * rolling summary with a single non-streaming Ollama call, then drop them.
   * Failures are swallowed so a summariser hiccup never breaks chatting.
   */
  async summarizeIfNeeded(settings: Settings): Promise<void> {
    const turns = this.db.data.turns
    if (!shouldSummarize(turns.length, settings.summarizeThreshold)) return

    const keep = settings.historyWindow
    const toCompress = turns.slice(0, Math.max(0, turns.length - keep))
    if (toCompress.length === 0) return

    const transcript = toCompress.map((t) => `${t.role}: ${t.content}`).join('\n')
    const prompt: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You compress chat history into a compact third-person memory. ' +
          'Preserve durable facts, ongoing topics, and emotional context. ' +
          'Be concise. Do not add commentary.'
      },
      {
        role: 'user',
        content:
          (this.db.data.summary ? `Existing summary:\n${this.db.data.summary}\n\n` : '') +
          `New conversation to fold in:\n${transcript}`
      }
    ]

    try {
      const summary = await chatOnce(settings.model, prompt)
      if (summary.trim()) {
        this.db.data.summary = summary.trim()
        this.db.data.turns = turns.slice(turns.length - keep)
        await this.db.write()
      }
    } catch {
      /* keep raw history if summarisation fails; try again next turn */
    }
  }
}
