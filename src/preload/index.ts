import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type ChatDonePayload,
  type ChatErrorPayload,
  type CompanionApi,
  type MemorySnapshot,
  type PiperResult,
  type Settings
} from '@shared/types'

const api: CompanionApi = {
  chat(text, handlers) {
    const onToken = (_e: unknown, delta: string) => handlers.onToken(delta)
    const onDone = (_e: unknown, payload: ChatDonePayload) => {
      cleanup()
      handlers.onDone(payload)
    }
    const onError = (_e: unknown, payload: ChatErrorPayload) => {
      cleanup()
      handlers.onError(payload)
    }
    const cleanup = () => {
      ipcRenderer.off(IPC.chatToken, onToken)
      ipcRenderer.off(IPC.chatDone, onDone)
      ipcRenderer.off(IPC.chatError, onError)
    }

    ipcRenderer.on(IPC.chatToken, onToken)
    ipcRenderer.on(IPC.chatDone, onDone)
    ipcRenderer.on(IPC.chatError, onError)
    ipcRenderer.invoke(IPC.chatStart, { text })

    return cleanup
  },
  cancelChat() {
    ipcRenderer.invoke(IPC.chatCancel)
  },
  listModels(): Promise<string[]> {
    return ipcRenderer.invoke(IPC.listModels)
  },
  pullModel(model: string): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke(IPC.pullModel, model)
  },
  getSettings(): Promise<Settings> {
    return ipcRenderer.invoke(IPC.getSettings)
  },
  setSettings(patch: Partial<Settings>): Promise<Settings> {
    return ipcRenderer.invoke(IPC.setSettings, patch)
  },
  getMemory(): Promise<MemorySnapshot> {
    return ipcRenderer.invoke(IPC.getMemory)
  },
  clearMemory(): Promise<void> {
    return ipcRenderer.invoke(IPC.clearMemory)
  },
  synthesize(text: string): Promise<PiperResult> {
    return ipcRenderer.invoke(IPC.ttsSynthesize, text)
  },
  getModelUrl(): Promise<string | null> {
    return ipcRenderer.invoke(IPC.getModelUrl)
  }
}

contextBridge.exposeInMainWorld('companion', api)
