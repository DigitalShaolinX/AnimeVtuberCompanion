import { z } from 'zod'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import type { CompanionDb } from './db'

const settingsSchema = z.object({
  model: z.string().min(1),
  persona: z.string(),
  voiceName: z.string().nullable(),
  ttsProvider: z.enum(['webspeech', 'piper']),
  piperPath: z.string().nullable(),
  piperVoicePath: z.string().nullable(),
  historyWindow: z.number().int().min(1).max(100),
  summarizeThreshold: z.number().int().min(2).max(1000)
})

export function getSettings(db: CompanionDb): Settings {
  return db.data.settings
}

/**
 * Apply a partial settings patch, validating the merged result. Invalid
 * patches are rejected (settings left unchanged) and the error surfaced.
 */
export async function setSettings(db: CompanionDb, patch: Partial<Settings>): Promise<Settings> {
  const merged = { ...DEFAULT_SETTINGS, ...db.data.settings, ...patch }
  const validated = settingsSchema.parse(merged)
  db.data.settings = validated
  await db.write()
  return validated
}
