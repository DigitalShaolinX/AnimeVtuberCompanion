import { describe, it, expect } from 'vitest'
import { parseEmotion, inferEmotion, resolveExpression } from '../src/renderer/live2d/emotion'

describe('parseEmotion', () => {
  it('strips a valid leading tag and reports the emotion', () => {
    const r = parseEmotion('[happy] Hi there!')
    expect(r.emotion).toBe('happy')
    expect(r.text).toBe('Hi there!')
    expect(r.tagged).toBe(true)
  })

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    const r = parseEmotion('  [ SAD ]  oh no')
    expect(r.emotion).toBe('sad')
    expect(r.text).toBe('oh no')
    expect(r.tagged).toBe(true)
  })

  it('accepts parenthesised tags too', () => {
    const r = parseEmotion('(surprised) whoa')
    expect(r.emotion).toBe('surprised')
    expect(r.tagged).toBe(true)
  })

  it('ignores an unknown tag and falls back to inference', () => {
    const r = parseEmotion('[ecstatic] yay this is great')
    expect(r.tagged).toBe(false)
    expect(r.text).toBe('[ecstatic] yay this is great')
    expect(r.emotion).toBe('happy') // inferred from "yay"/"great"
  })

  it('infers when there is no tag at all', () => {
    const r = parseEmotion('this makes me so angry')
    expect(r.tagged).toBe(false)
    expect(r.emotion).toBe('angry')
  })
})

describe('inferEmotion', () => {
  it('detects keyword emotions', () => {
    expect(inferEmotion('haha that is awesome')).toBe('happy')
    expect(inferEmotion('I am so sorry to hear that')).toBe('sad')
    expect(inferEmotion('grr that is annoying')).toBe('angry')
    expect(inferEmotion('that makes me blush')).toBe('shy')
  })

  it('uses punctuation for surprise', () => {
    expect(inferEmotion('what?!')).toBe('surprised')
    expect(inferEmotion('no!! way!!')).toBe('surprised')
  })

  it('defaults to neutral', () => {
    expect(inferEmotion('the meeting is at three')).toBe('neutral')
  })

  it('prioritises angry over happy when both keywords are present', () => {
    expect(inferEmotion('I love you but I am mad')).toBe('angry')
  })
})

describe('resolveExpression', () => {
  const manifest = ['exp_neutral', 'exp_happy_01', 'Angry', 'shy']

  it('matches fuzzily by emotion name', () => {
    expect(resolveExpression('happy', manifest)).toBe('exp_happy_01')
  })

  it('matches case-insensitively', () => {
    expect(resolveExpression('angry', manifest)).toBe('Angry')
  })

  it('honours explicit overrides first', () => {
    expect(resolveExpression('happy', manifest, { happy: 'shy' })).toBe('shy')
  })

  it('falls back to neutral when the emotion is absent', () => {
    expect(resolveExpression('sad', manifest)).toBe('exp_neutral')
  })

  it('falls back to the first expression when nothing else matches', () => {
    expect(resolveExpression('sad', ['only_one'])).toBe('only_one')
  })

  it('returns null when the model has no expressions', () => {
    expect(resolveExpression('happy', [])).toBeNull()
  })
})
