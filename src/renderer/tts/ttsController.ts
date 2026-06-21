import type { Settings } from '@shared/types'
import type { Live2DController } from '../live2d/live2dController'
import * as webspeech from './webspeech'
import { synthesize as piperSynthesize } from './piperBridge'

const FLAP_MAX_MS = 60_000

/**
 * Provider switch between Web Speech (timer mouth-flap) and Piper (WAV
 * amplitude lip-sync). The controller it drives owns the actual mouth
 * parameter; this class only decides which envelope feeds it.
 */
export class TtsController {
  constructor(private readonly live2d: Live2DController) {}

  async prime(): Promise<SpeechSynthesisVoice[]> {
    return webspeech.loadVoices()
  }

  /**
   * Speak already-cleaned text (emotion tag stripped). Resolves when audio
   * finishes (best-effort for Web Speech). Never rejects — TTS failures should
   * not break the chat flow.
   */
  async speak(text: string, settings: Settings): Promise<void> {
    const clean = text.trim()
    if (!clean) return

    if (settings.ttsProvider === 'piper') {
      try {
        const wavUrl = await piperSynthesize(clean)
        await this.live2d.speakWav(wavUrl)
        return
      } catch {
        // Fall back to Web Speech if Piper is misconfigured/unavailable.
      }
    }

    await this.speakWebSpeech(clean, settings.voiceName)
  }

  private speakWebSpeech(text: string, voiceName: string | null): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        this.live2d.stopMouthFlap()
        resolve()
      }
      webspeech.speak(text, voiceName, {
        onStart: () => this.live2d.startMouthFlap(FLAP_MAX_MS),
        onEnd: finish,
        onError: finish
      })
    })
  }

  cancel(): void {
    webspeech.cancel()
    this.live2d.stopMouthFlap()
  }
}
