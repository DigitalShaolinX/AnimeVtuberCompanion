import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import {
  IPC,
  type ChatStartPayload,
  type MemorySnapshot,
  type PiperResult,
  type Settings
} from '@shared/types'
import { chatStream, listModels, pullModel } from './ollama'
import { openDb, type CompanionDb } from './store/db'
import { getSettings, setSettings } from './store/settings'
import { MemoryStore } from './store/memory'
import { synthesizeWithPiper } from './tts-piper'
import { findModelUrl, registerAssetScheme, serveAssets } from './assets'
import { attachRendererDiagnostics, diagnosticsLogPath, initDiagnostics, log } from './diagnostics'

registerAssetScheme()

let mainWindow: BrowserWindow | null = null
let db: CompanionDb
let memory: MemoryStore
let activeChat: AbortController | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 540,
    show: false,
    backgroundColor: '#11131a',
    title: 'Live2D Companion',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  attachRendererDiagnostics(mainWindow.webContents)
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Headless self-test: after the page settles, inspect the rendered DOM and
  // exit with a pass/fail code. Used by `npm run smoke` under xvfb in CI.
  if (process.env.COMPANION_SMOKE) {
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => void runSmokeCheck(), 4000)
    })
  }
}

async function runSmokeCheck(): Promise<void> {
  const probe = `JSON.stringify({
    rootChildren: document.getElementById('root')?.children.length ?? 0,
    hasChatInput: !!document.querySelector('.chat-input textarea'),
    stageStatus: (document.querySelector('.stage-status')?.textContent ?? '').trim(),
    fatal: document.body.innerText.includes('hit an error')
  })`
  try {
    const raw = await mainWindow!.webContents.executeJavaScript(probe)
    const r = JSON.parse(raw)
    log(`[smoke] DOM: ${raw}`)
    const pass = r.rootChildren > 0 && r.hasChatInput && !r.fatal
    log(`[smoke] result: ${pass ? 'PASS — renderer mounted, chat UI present' : 'FAIL'}`)
    process.exitCode = pass ? 0 : 1
  } catch (err) {
    log(`[smoke] probe failed: ${(err as Error).message}`)
    process.exitCode = 1
  } finally {
    app.quit()
  }
}

function registerIpc(): void {
  // --- Settings -----------------------------------------------------------
  ipcMain.handle(IPC.getSettings, (): Settings => getSettings(db))
  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<Settings>): Promise<Settings> =>
    setSettings(db, patch)
  )

  // --- Memory -------------------------------------------------------------
  ipcMain.handle(IPC.getMemory, (): MemorySnapshot => memory.snapshot())
  ipcMain.handle(IPC.clearMemory, (): Promise<void> => memory.clear())

  // --- Ollama model management -------------------------------------------
  ipcMain.handle(IPC.listModels, async (): Promise<string[]> => {
    try {
      return await listModels()
    } catch {
      return []
    }
  })
  ipcMain.handle(IPC.pullModel, async (_e, model: string) => {
    try {
      await pullModel(model)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // --- Optional Piper TTS -------------------------------------------------
  ipcMain.handle(IPC.ttsSynthesize, (_e, text: string): Promise<PiperResult> =>
    synthesizeWithPiper(text, getSettings(db))
  )

  // --- Assets -------------------------------------------------------------
  ipcMain.handle(IPC.getModelUrl, (): Promise<string | null> => findModelUrl())

  // --- Streaming chat -----------------------------------------------------
  ipcMain.handle(IPC.chatCancel, () => {
    activeChat?.abort()
    activeChat = null
  })

  ipcMain.handle(IPC.chatStart, async (e, payload: ChatStartPayload) => {
    const sender = e.sender
    const settings = getSettings(db)
    const messages = memory.buildPrompt(payload.text, settings)

    activeChat?.abort()
    const controller = new AbortController()
    activeChat = controller

    let full = ''
    try {
      await memory.recordUser(payload.text)
      for await (const delta of chatStream({
        model: settings.model,
        messages,
        signal: controller.signal
      })) {
        full += delta
        if (!sender.isDestroyed()) sender.send(IPC.chatToken, delta)
      }
      await memory.recordAssistant(full)
      if (!sender.isDestroyed()) sender.send(IPC.chatDone, { content: full })
      // Compress old history after the turn settles (non-blocking for the UI).
      memory.summarizeIfNeeded(settings).catch(() => {})
    } catch (err) {
      if (controller.signal.aborted) {
        // User cancelled: still persist whatever streamed so far.
        if (full) await memory.recordAssistant(full)
        if (!sender.isDestroyed()) sender.send(IPC.chatDone, { content: full })
      } else {
        const message = friendlyError(err)
        if (!sender.isDestroyed()) sender.send(IPC.chatError, { message })
      }
    } finally {
      if (activeChat === controller) activeChat = null
    }
  })
}

function friendlyError(err: unknown): string {
  const msg = (err as Error)?.message ?? String(err)
  if (/ECONNREFUSED|fetch failed|Failed to fetch/i.test(msg)) {
    return 'Could not reach Ollama. Make sure it is running (`ollama serve`) on http://localhost:11434.'
  }
  return msg
}

app.whenReady().then(async () => {
  initDiagnostics()
  serveAssets()
  db = await openDb(app.getPath('userData'))
  memory = new MemoryStore(db)
  registerIpc()

  const modelUrl = await findModelUrl()
  log(`[startup] model: ${modelUrl ?? 'NONE FOUND (resources/models empty — run fetch-assets)'}`)
  const models = await listModels().catch(() => [] as string[])
  log(`[startup] ollama: ${models.length} model(s) ${models.length ? '[' + models.join(', ') + ']' : '(server unreachable or empty)'}`)
  log(`[startup] diagnostics log at: ${diagnosticsLogPath()}`)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
