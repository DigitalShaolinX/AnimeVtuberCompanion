import { join } from 'node:path'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { DEFAULT_SETTINGS, type Settings, type StoredTurn, type MemoryFact } from '@shared/types'

export interface DbData {
  settings: Settings
  turns: StoredTurn[]
  facts: MemoryFact[]
  summary: string
}

export function defaultData(): DbData {
  return {
    settings: { ...DEFAULT_SETTINGS },
    turns: [],
    facts: [],
    summary: ''
  }
}

export type CompanionDb = Low<DbData>

/**
 * Open (or create) the JSON-backed store. Defaults live in userData; callers
 * may pass an explicit path (handy for tests / alternate locations).
 */
export async function openDb(userDataDir: string, fileName = 'companion.json'): Promise<CompanionDb> {
  const adapter = new JSONFile<DbData>(join(userDataDir, fileName))
  const db = new Low<DbData>(adapter, defaultData())
  await db.read()
  // Backfill any newly-added settings keys without clobbering user values.
  db.data ||= defaultData()
  db.data.settings = { ...DEFAULT_SETTINGS, ...db.data.settings }
  await db.write()
  return db
}
