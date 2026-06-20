import { describe, it, expect } from 'vitest'
import { drainNdjson, parseChunk } from '../src/main/ollama'

describe('parseChunk', () => {
  it('extracts content and done from a well-formed line', () => {
    const chunk = parseChunk('{"message":{"content":"hi"},"done":false}')
    expect(chunk).toEqual({ content: 'hi', done: false })
  })

  it('detects the terminal done:true chunk', () => {
    const chunk = parseChunk('{"message":{"content":""},"done":true}')
    expect(chunk).toEqual({ content: '', done: true })
  })

  it('returns null for malformed JSON', () => {
    expect(parseChunk('{not json')).toBeNull()
  })

  it('tolerates a missing message field', () => {
    expect(parseChunk('{"done":true}')).toEqual({ content: '', done: true })
  })
})

describe('drainNdjson', () => {
  it('splits multiple complete lines and leaves no remainder', () => {
    const buf =
      '{"message":{"content":"a"},"done":false}\n' +
      '{"message":{"content":"b"},"done":false}\n'
    const { chunks, rest } = drainNdjson(buf)
    expect(chunks.map((c) => c.content)).toEqual(['a', 'b'])
    expect(rest).toBe('')
  })

  it('keeps a trailing partial line as the remainder', () => {
    const buf =
      '{"message":{"content":"a"},"done":false}\n' + '{"message":{"content":"b'
    const { chunks, rest } = drainNdjson(buf)
    expect(chunks.map((c) => c.content)).toEqual(['a'])
    expect(rest).toBe('{"message":{"content":"b')
  })

  it('reassembles a delta split across two network reads', () => {
    // First read ends mid-line; second read completes it plus another line.
    const first = '{"message":{"content":"hel'
    const second = 'lo"},"done":false}\n{"message":{"content":"!"},"done":true}\n'

    let buffer = ''
    buffer += first
    let out = drainNdjson(buffer)
    expect(out.chunks).toEqual([]) // nothing complete yet
    buffer = out.rest

    buffer += second
    out = drainNdjson(buffer)
    expect(out.chunks.map((c) => c.content)).toEqual(['hello', '!'])
    expect(out.chunks[1].done).toBe(true)
    expect(out.rest).toBe('')
  })

  it('skips blank and malformed lines without throwing', () => {
    const buf =
      '\n' +
      'garbage line\n' +
      '{"message":{"content":"ok"},"done":false}\n'
    const { chunks } = drainNdjson(buf)
    expect(chunks.map((c) => c.content)).toEqual(['ok'])
  })
})
