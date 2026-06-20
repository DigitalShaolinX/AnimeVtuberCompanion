import { z } from 'zod'
import type { ChatMessage } from '@shared/types'

export const OLLAMA_HOST = process.env.OLLAMA_HOST?.replace(/\/$/, '') ?? 'http://localhost:11434'

/** Shape of a single streamed /api/chat NDJSON line we care about. */
const chatChunkSchema = z.object({
  message: z.object({ content: z.string() }).partial().optional(),
  done: z.boolean().optional()
})

export interface OllamaChunk {
  content: string
  done: boolean
}

/**
 * Splits a running buffer into complete NDJSON lines, returning the parsed
 * chunks plus whatever trailing partial line remains. Pure and synchronous so
 * the tricky "delta split across two network reads" case is unit-testable.
 *
 * Defensive by design: malformed/blank lines are skipped rather than thrown.
 */
export function drainNdjson(buffer: string): { chunks: OllamaChunk[]; rest: string } {
  const chunks: OllamaChunk[] = []
  let start = 0
  let nl = buffer.indexOf('\n')
  while (nl !== -1) {
    const line = buffer.slice(start, nl).trim()
    start = nl + 1
    nl = buffer.indexOf('\n', start)
    if (!line) continue
    const chunk = parseChunk(line)
    if (chunk) chunks.push(chunk)
  }
  return { chunks, rest: buffer.slice(start) }
}

/** Parse one NDJSON line into a normalised chunk, or null if unusable. */
export function parseChunk(line: string): OllamaChunk | null {
  let json: unknown
  try {
    json = JSON.parse(line)
  } catch {
    return null
  }
  const result = chatChunkSchema.safeParse(json)
  if (!result.success) return null
  return {
    content: result.data.message?.content ?? '',
    done: result.data.done ?? false
  }
}

export interface ChatStreamOptions {
  model: string
  messages: ChatMessage[]
  signal?: AbortSignal
  host?: string
}

/**
 * POST /api/chat with stream:true and yield each content delta.
 * Reads application/x-ndjson line-by-line, tolerating chunk boundaries that
 * fall in the middle of a JSON line.
 */
export async function* chatStream(
  opts: ChatStreamOptions
): AsyncGenerator<string, void, unknown> {
  const host = opts.host ?? OLLAMA_HOST
  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: true }),
    signal: opts.signal
  })
  if (!res.ok || !res.body) {
    throw new Error(`Ollama /api/chat failed: ${res.status} ${res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { chunks, rest } = drainNdjson(buffer)
    buffer = rest
    for (const chunk of chunks) {
      if (chunk.content) yield chunk.content
      if (chunk.done) return
    }
  }
  // Flush any trailing buffered line (stream ended without newline).
  const tail = parseChunk(buffer.trim())
  if (tail?.content) yield tail.content
}

/** Non-streaming chat call used for background summarisation. */
export async function chatOnce(
  model: string,
  messages: ChatMessage[],
  host = OLLAMA_HOST
): Promise<string> {
  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false })
  })
  if (!res.ok) throw new Error(`Ollama /api/chat failed: ${res.status}`)
  const json = (await res.json()) as { message?: { content?: string } }
  return json.message?.content ?? ''
}

const tagsSchema = z.object({
  models: z.array(z.object({ name: z.string() })).default([])
})

/** GET /api/tags → list of installed model tags. */
export async function listModels(host = OLLAMA_HOST): Promise<string[]> {
  const res = await fetch(`${host}/api/tags`)
  if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status}`)
  const parsed = tagsSchema.parse(await res.json())
  return parsed.models.map((m) => m.name)
}

/** POST /api/pull (streamed) to download a model. Resolves when complete. */
export async function pullModel(
  model: string,
  onProgress?: (status: string) => void,
  host = OLLAMA_HOST
): Promise<void> {
  const res = await fetch(`${host}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: true })
  })
  if (!res.ok || !res.body) throw new Error(`Ollama /api/pull failed: ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl = buffer.indexOf('\n')
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      nl = buffer.indexOf('\n')
      if (!line) continue
      try {
        const obj = JSON.parse(line) as { status?: string; error?: string }
        if (obj.error) throw new Error(obj.error)
        if (obj.status) onProgress?.(obj.status)
      } catch {
        /* ignore non-JSON progress noise */
      }
    }
  }
}
