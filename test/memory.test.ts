import { describe, it, expect } from 'vitest'
import { buildMessages, shouldSummarize, extractFacts } from '../src/main/store/memory'
import type { MemoryFact, StoredTurn } from '../src/shared/types'

const turn = (role: StoredTurn['role'], content: string, ts = 0): StoredTurn => ({ role, content, ts })

describe('buildMessages', () => {
  it('builds a system prompt from persona, facts, and summary', () => {
    const facts: MemoryFact[] = [
      { text: 'Their name is Sam.', ts: 1 },
      { text: 'They like ramen.', ts: 2 }
    ]
    const msgs = buildMessages({
      persona: 'You are warm.',
      facts,
      summary: 'They had a long day.',
      turns: [],
      userText: 'hello',
      historyWindow: 5
    })
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('You are warm.')
    expect(msgs[0].content).toContain('Their name is Sam.')
    expect(msgs[0].content).toContain('They like ramen.')
    expect(msgs[0].content).toContain('They had a long day.')
  })

  it('omits the facts/summary sections when empty', () => {
    const msgs = buildMessages({
      persona: 'P',
      facts: [],
      summary: '',
      turns: [],
      userText: 'hi',
      historyWindow: 5
    })
    expect(msgs[0].content).toBe('P')
  })

  it('appends the new user message last', () => {
    const msgs = buildMessages({
      persona: 'P',
      facts: [],
      summary: '',
      turns: [turn('user', 'old'), turn('assistant', 'reply')],
      userText: 'new question',
      historyWindow: 5
    })
    const last = msgs[msgs.length - 1]
    expect(last).toEqual({ role: 'user', content: 'new question' })
  })

  it('only includes the last N turns set by historyWindow', () => {
    const turns: StoredTurn[] = []
    for (let i = 0; i < 10; i++) turns.push(turn(i % 2 === 0 ? 'user' : 'assistant', `m${i}`))
    const msgs = buildMessages({
      persona: 'P',
      facts: [],
      summary: '',
      turns,
      userText: 'now',
      historyWindow: 3
    })
    // 1 system + 3 history + 1 new user = 5
    expect(msgs).toHaveLength(5)
    expect(msgs.slice(1, 4).map((m) => m.content)).toEqual(['m7', 'm8', 'm9'])
  })

  it('includes no history when the window is zero', () => {
    const msgs = buildMessages({
      persona: 'P',
      facts: [],
      summary: '',
      turns: [turn('user', 'old')],
      userText: 'now',
      historyWindow: 0
    })
    expect(msgs).toHaveLength(2) // system + new user only
  })
})

describe('shouldSummarize', () => {
  it('is false at or below the threshold', () => {
    expect(shouldSummarize(40, 40)).toBe(false)
    expect(shouldSummarize(39, 40)).toBe(false)
  })
  it('is true once past the threshold', () => {
    expect(shouldSummarize(41, 40)).toBe(true)
  })
})

describe('extractFacts', () => {
  it('captures a stated name', () => {
    expect(extractFacts('hey, my name is Mizuki')).toContain('Their name is Mizuki.')
  })
  it('captures likes and dislikes', () => {
    expect(extractFacts('honestly I love spicy food')).toContain('They like spicy food.')
    expect(extractFacts('ugh I hate mondays')).toContain('They dislike mondays.')
  })
  it('returns nothing for a plain message', () => {
    expect(extractFacts('what time is it?')).toEqual([])
  })
})
