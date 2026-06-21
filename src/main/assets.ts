import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join, normalize, relative, isAbsolute } from 'node:path'
import { Readable } from 'node:stream'
import { app, protocol } from 'electron'
import { ASSET_SCHEME } from '@shared/types'

/**
 * resources/ holds the proprietary Cubism Core and non-redistributable sample
 * model fetched at install time. It lives outside the renderer build root and
 * is gitignored, so we serve it to the renderer over a privileged custom
 * protocol (companion://...) instead of bundling it.
 */
export function resourcesRoot(): string {
  // Packaged builds put resources next to the app; dev uses the repo folder.
  return app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(app.getAppPath(), 'resources')
}

/** Must run before app `ready`. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.model3': 'application/json',
  '.moc3': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.exp3': 'application/json',
  '.motion3': 'application/json',
  '.physics3': 'application/json',
  '.js': 'text/javascript'
}

function mimeFor(path: string): string {
  const lower = path.toLowerCase()
  for (const ext of Object.keys(MIME)) {
    if (lower.endsWith(ext)) return MIME[ext]
  }
  return 'application/octet-stream'
}

/** Register the protocol handler. Run after app `ready`. */
export function serveAssets(): void {
  const root = resourcesRoot()
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      // companion://models/Hiyori/Hiyori.model3.json → <root>/models/Hiyori/...
      const rel = decodeURIComponent(`${url.hostname}${url.pathname}`)
      const target = normalize(join(root, rel))
      // Prevent path traversal outside resources/.
      const within = relative(root, target)
      if (within.startsWith('..') || isAbsolute(within)) {
        return new Response('Forbidden', { status: 403 })
      }
      const body = Readable.toWeb(createReadStream(target)) as ReadableStream
      return new Response(body, { headers: { 'Content-Type': mimeFor(target) } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

/** Find the first *.model3.json under resources/models and map it to companion://. */
export async function findModelUrl(): Promise<string | null> {
  const modelsDir = join(resourcesRoot(), 'models')
  const found = await findFile(modelsDir, (name) => name.toLowerCase().endsWith('.model3.json'))
  if (!found) return null
  const rel = relative(resourcesRoot(), found).split(/[\\/]/).map(encodeURIComponent).join('/')
  return `${ASSET_SCHEME}://${rel}`
}

async function findFile(dir: string, match: (name: string) => boolean): Promise<string | null> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return null
  }
  const subdirs: string[] = []
  for (const name of entries) {
    const full = join(dir, name)
    let info
    try {
      info = await stat(full)
    } catch {
      continue
    }
    if (info.isFile() && match(name)) return full
    if (info.isDirectory()) subdirs.push(full)
  }
  for (const sub of subdirs) {
    const hit = await findFile(sub, match)
    if (hit) return hit
  }
  return null
}
