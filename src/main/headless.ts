import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { findModelUrl } from './assets'
import { listModels } from './ollama'
import { getCollectedErrors, log } from './diagnostics'

/**
 * Headless inspection used by `npm run smoke` (CI) and `npm run capture` (the
 * local autonomous loop). After the renderer settles we read the DOM, optionally
 * screenshot the window with capturePage(), and write a structured report so an
 * agent can "see" the running app without a human relaying it.
 */

const PROBE = `JSON.stringify({
  rootChildren: document.getElementById('root')?.children.length ?? 0,
  hasChatInput: !!document.querySelector('.chat-input textarea'),
  stageStatus: (document.querySelector('.stage-status')?.textContent ?? '').trim(),
  fatal: document.body.innerText.includes('hit an error'),
  bodyText: document.body.innerText.slice(0, 600)
})`

export type RunStatus = 'avatar-rendered' | 'renderer-ok-no-avatar' | 'broken'

export interface HeadlessReport {
  ts: string
  status: RunStatus
  rootChildren: number
  hasChatInput: boolean
  stageStatus: string
  fatal: boolean
  modelUrl: string | null
  ollamaModels: string[]
  errors: string[]
  bodyText: string
}

function classify(dom: {
  rootChildren: number
  hasChatInput: boolean
  fatal: boolean
  stageStatus: string
}): RunStatus {
  const rendererOk = dom.rootChildren > 0 && dom.hasChatInput && !dom.fatal
  if (!rendererOk) return 'broken'
  // The avatar rendered iff the stage shows no error/placeholder status.
  return dom.stageStatus === '' ? 'avatar-rendered' : 'renderer-ok-no-avatar'
}

export async function runHeadlessProbe(
  win: BrowserWindow,
  opts: { capture: boolean }
): Promise<void> {
  let dom = {
    rootChildren: 0,
    hasChatInput: false,
    stageStatus: '',
    fatal: false,
    bodyText: ''
  }
  try {
    dom = JSON.parse(await win.webContents.executeJavaScript(PROBE))
  } catch (err) {
    log(`[headless] DOM probe failed: ${(err as Error).message}`)
  }

  const modelUrl = await findModelUrl().catch(() => null)
  const ollamaModels = await listModels().catch(() => [] as string[])
  const status = classify(dom)

  const report: HeadlessReport = {
    ts: new Date().toISOString(),
    status,
    rootChildren: dom.rootChildren,
    hasChatInput: dom.hasChatInput,
    stageStatus: dom.stageStatus,
    fatal: dom.fatal,
    modelUrl,
    ollamaModels,
    errors: getCollectedErrors(),
    bodyText: dom.bodyText
  }

  if (opts.capture) {
    const dir = join(process.cwd(), 'diagnostics')
    try {
      mkdirSync(dir, { recursive: true })
      const image = await win.webContents.capturePage()
      writeFileSync(join(dir, 'latest.png'), image.toPNG())
      log('[capture] screenshot  -> diagnostics/latest.png')
    } catch (err) {
      log(`[capture] screenshot failed: ${(err as Error).message}`)
    }
    try {
      writeFileSync(join(process.cwd(), 'diagnostics', 'latest.json'), JSON.stringify(report, null, 2))
      log('[capture] report      -> diagnostics/latest.json')
    } catch (err) {
      log(`[capture] report write failed: ${(err as Error).message}`)
    }
  }

  log(`[headless] status: ${status}`)
  log(`[headless] DOM: ${JSON.stringify(dom)}`)

  // Exit code: capture mode demands a fully rendered avatar; smoke mode (CI,
  // where assets can't be fetched) only requires a healthy renderer.
  const pass = opts.capture ? status === 'avatar-rendered' : status !== 'broken'
  process.exitCode = pass ? 0 : 1
  app.quit()
}
