import { z } from 'zod'
import { EMOTIONS, type Emotion } from '@shared/types'

const emotionSchema = z.enum(EMOTIONS)

export interface ParsedEmotion {
  /** The reply with any leading emotion tag removed. */
  text: string
  /** The emotion to play. Always defined (falls back to inference/neutral). */
  emotion: Emotion
  /** True when an explicit, valid leading tag was found. */
  tagged: boolean
}

const LEADING_TAG = /^\s*[\[(]\s*([a-zA-Z]+)\s*[\])]\s*/

/**
 * Strip a single leading `[emotion]` tag (also tolerates parens) and validate
 * it against the known emotion set. When the tag is missing or invalid the
 * text is returned untouched and the emotion is inferred from the content.
 */
export function parseEmotion(raw: string): ParsedEmotion {
  const match = raw.match(LEADING_TAG)
  if (match) {
    const candidate = match[1].toLowerCase()
    const parsed = emotionSchema.safeParse(candidate)
    if (parsed.success) {
      return {
        text: raw.slice(match[0].length),
        emotion: parsed.data,
        tagged: true
      }
    }
  }
  return { text: raw, emotion: inferEmotion(raw), tagged: false }
}

interface Rule {
  emotion: Emotion
  words: string[]
}

// Ordered by priority; first matching rule wins.
const RULES: Rule[] = [
  { emotion: 'angry', words: ['angry', 'furious', 'mad', 'annoyed', 'grr', 'hmph'] },
  { emotion: 'sad', words: ['sad', 'sorry', 'cry', 'crying', 'lonely', 'miss you', 'unfortunately'] },
  { emotion: 'surprised', words: ['wow', 'whoa', 'woah', 'really?!', 'no way', 'omg', 'amazing', 'incredible'] },
  { emotion: 'shy', words: ['shy', 'blush', 'embarrass', 'flustered', 'um...', 'eep'] },
  { emotion: 'happy', words: ['happy', 'glad', 'yay', 'haha', 'hehe', 'love', 'great', 'awesome', 'excited', '♥'] }
]

/**
 * Keyword + punctuation heuristic used when the model omits a tag.
 * Pure and deterministic so it is easy to unit test.
 */
export function inferEmotion(text: string): Emotion {
  const lower = text.toLowerCase()
  for (const rule of RULES) {
    if (rule.words.some((w) => lower.includes(w))) return rule.emotion
  }
  const exclamations = (text.match(/!/g) ?? []).length
  if (text.includes('?!') || exclamations >= 2) return 'surprised'
  return 'neutral'
}

/**
 * Resolve a logical emotion to a concrete expression name present in the
 * loaded model's manifest. Falls back through neutral to the first available
 * expression so a model that lacks a given mood never throws.
 */
export function resolveExpression(
  emotion: Emotion,
  availableExpressions: string[],
  overrides: Partial<Record<Emotion, string>> = {}
): string | null {
  if (availableExpressions.length === 0) return null

  const set = new Set(availableExpressions)
  const has = (name: string | undefined): name is string => !!name && set.has(name)

  // 1. Explicit override from settings/manifest mapping.
  if (has(overrides[emotion])) return overrides[emotion] as string

  // 2. Case-insensitive name match against the emotion itself.
  const direct = availableExpressions.find((e) => e.toLowerCase() === emotion)
  if (direct) return direct

  // 3. Fuzzy contains match (e.g. "exp_happy_01").
  const fuzzy = availableExpressions.find((e) => e.toLowerCase().includes(emotion))
  if (fuzzy) return fuzzy

  // 4. Neutral fallback, by override or by name.
  if (has(overrides.neutral)) return overrides.neutral as string
  const neutral = availableExpressions.find((e) => e.toLowerCase().includes('neutral'))
  if (neutral) return neutral

  // 5. Last resort: the first declared expression.
  return availableExpressions[0]
}
