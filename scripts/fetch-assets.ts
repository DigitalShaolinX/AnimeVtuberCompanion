/**
 * First-run asset fetcher (runs on postinstall; idempotent).
 *
 * Cubism Core is proprietary and the Live2D sample models are not
 * redistributable, so neither is committed. This script downloads:
 *   1. live2dcubismcore.min.js  → src/renderer/public/cubism/  (served at /cubism/)
 *   2. the "Hiyori" sample model → resources/models/Hiyori/
 *
 * Both destinations are gitignored. Network failures are non-fatal: the script
 * warns and exits 0 so `npm install` still succeeds (run `npm run fetch-assets`
 * later on a connected machine).
 */
import { createWriteStream } from 'node:fs'
import { mkdir, access, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const ROOT = resolve(import.meta.dirname, '..')
const CUBISM_DEST = join(ROOT, 'src/renderer/public/cubism/live2dcubismcore.min.js')
const MODEL_DIR = join(ROOT, 'resources/models/Hiyori')

const CUBISM_CORE_URL = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js'
const SAMPLE_BASE =
  'https://raw.githubusercontent.com/Live2D/CubismWebSamples/develop/Samples/Resources/Hiyori/'
const SAMPLE_MODEL_JSON = 'Hiyori.model3.json'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function download(url: string, dest: string): Promise<void> {
  if (await exists(dest)) {
    console.log(`  ✓ exists  ${dest}`)
    return
  }
  await mkdir(dirname(dest), { recursive: true })
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`)
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest))
  console.log(`  ↓ saved   ${dest}`)
}

/** Collect every relative file path referenced inside a model3.json. */
function collectReferences(modelJson: unknown): string[] {
  const paths = new Set<string>()
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      if (/\.(moc3|png|jpg|jpeg|exp3\.json|motion3\.json|physics3\.json|pose3\.json|cdi3\.json|userdata3\.json)$/i.test(node)) {
        paths.add(node)
      }
    } else if (Array.isArray(node)) {
      node.forEach(walk)
    } else if (node && typeof node === 'object') {
      Object.values(node).forEach(walk)
    }
  }
  walk(modelJson)
  return [...paths]
}

async function fetchCubismCore(): Promise<void> {
  console.log('Cubism Core runtime:')
  await download(CUBISM_CORE_URL, CUBISM_DEST)
}

async function fetchSampleModel(): Promise<void> {
  console.log('Sample model (Hiyori):')
  const modelPath = join(MODEL_DIR, SAMPLE_MODEL_JSON)
  await download(SAMPLE_BASE + SAMPLE_MODEL_JSON, modelPath)

  const modelJson = JSON.parse(await readFile(modelPath, 'utf8'))
  const refs = collectReferences(modelJson)
  for (const ref of refs) {
    const normalized = ref.replace(/^\.?\//, '')
    await download(SAMPLE_BASE + normalized, join(MODEL_DIR, normalized))
  }
}

async function main(): Promise<void> {
  try {
    await fetchCubismCore()
    await fetchSampleModel()
    console.log('\nAssets ready. Run `npm run dev` to start.')
  } catch (err) {
    console.warn(
      `\n⚠ Could not fetch assets: ${(err as Error).message}\n` +
        '  The app needs these to render. Re-run `npm run fetch-assets` on a\n' +
        '  connected machine, or drop your own .model3.json into resources/models/\n' +
        '  and live2dcubismcore.min.js into src/renderer/public/cubism/.'
    )
  }
}

main()
