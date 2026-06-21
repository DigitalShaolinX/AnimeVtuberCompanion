import * as PIXI from 'pixi.js'
// Import the Cubism 4/5-only entry. The package's combined "." entry also pulls
// in the Cubism 2 runtime (which references window.Live2D at load and can throw
// in a fresh renderer); /cubism4 is the correct, lighter path for .model3.json
// models like the Hiyori sample.
import { Live2DModel } from 'pixi-live2d-display-lipsyncpatch/cubism4'
import { resolveExpression } from './emotion'
import type { Emotion } from '@shared/types'

const MOUTH_PARAM = 'ParamMouthOpenY'
const EYE_L = 'ParamEyeLOpen'
const EYE_R = 'ParamEyeROpen'

interface CoreModel {
  setParameterValueById(id: string, value: number, weight?: number): void
  getParameterValueById?(id: string): number
}

/**
 * Owns the PIXI application and the Live2D model. Responsible for load,
 * scale/position/resize, expressions, the timer-based mouth-flap envelope used
 * by Web Speech, real amplitude lip-sync via model.speak(), and a blink
 * fallback for models whose manifest declares no eye-blink group.
 *
 * This is the fragile PIXI 7 + Cubism 4/5 + lip-sync integration point, so it
 * is written defensively: every model-specific capability is feature-detected
 * and missing pieces degrade gracefully instead of throwing.
 */
export class Live2DController {
  private app: PIXI.Application | null = null
  private model: InstanceType<typeof Live2DModel> | null = null
  private expressionNames: string[] = []

  // Mouth-flap envelope state (Web Speech has no audio stream to sample).
  private flapUntil = 0
  private flapPhase = 0

  // Blink fallback state (only used when the model lacks an auto-blink group).
  private needsBlinkFallback = false
  private nextBlinkAt = 0
  private blinkValue = 1

  async init(canvas: HTMLCanvasElement): Promise<void> {
    // Register PIXI's shared ticker so the fork auto-updates motion/physics/
    // breath. Done here (not at module load) so an init issue can be caught.
    Live2DModel.registerTicker(PIXI.Ticker)

    this.app = new PIXI.Application({
      view: canvas,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      resizeTo: canvas.parentElement ?? window
    })
    this.app.ticker.add(this.onTick)
  }

  /** Load a model from a .model3.json URL and fit it into the stage. */
  async load(modelUrl: string): Promise<void> {
    if (!this.app) throw new Error('Live2DController.init must run before load')
    if (!window.Live2DCubismCore) {
      throw new Error('Cubism Core runtime is not loaded. Run the fetch-assets script.')
    }

    if (this.model) {
      this.app.stage.removeChild(this.model)
      this.model.destroy()
      this.model = null
    }

    const model = await Live2DModel.from(modelUrl, { autoInteract: false })
    this.model = model
    this.app.stage.addChild(model)
    model.anchor.set(0.5, 0.5)

    this.expressionNames = this.readExpressionNames(model)
    this.needsBlinkFallback = !this.hasEyeBlinkGroup(model)
    this.fit()

    // Light click reaction: poke a random body motion if any exist.
    model.on('hit', () => this.poke())
  }

  /** Recompute scale/position from the current canvas size. */
  fit(): void {
    if (!this.app || !this.model) return
    const { width, height } = this.app.renderer
    const m = this.model
    const bounds = m.getLocalBounds()
    const safeW = bounds.width || m.width || 1
    const safeH = bounds.height || m.height || 1
    // Fit within the stage (whichever of width/height binds first) and centre
    // her. anchor is 0.5/0.5, so position == centre of her bounding box.
    const scale = Math.min((height * 0.95) / safeH, (width * 0.95) / safeW)
    m.scale.set(scale)
    m.x = width / 2
    m.y = height / 2
  }

  resize(): void {
    this.fit()
  }

  /** Map a logical emotion to the model's real expression and play it. */
  playEmotion(emotion: Emotion): void {
    if (!this.model) return
    const name = resolveExpression(emotion, this.expressionNames)
    if (!name) return
    try {
      this.model.expression(name)
    } catch {
      /* expression name not playable on this model; ignore */
    }
  }

  /**
   * Start the timer-based mouth-flap envelope for `durationMs`. Used while a
   * Web Speech utterance is being spoken (we have no real amplitude).
   */
  startMouthFlap(durationMs: number): void {
    this.flapUntil = performance.now() + Math.max(0, durationMs)
  }

  stopMouthFlap(): void {
    this.flapUntil = 0
    this.setMouth(0)
  }

  /** Real amplitude lip-sync: hand a WAV to the fork's speak(). */
  async speakWav(wavUrl: string): Promise<void> {
    if (!this.model) return
    // The fork samples the audio and drives the mouth parameter itself.
    await this.model.speak(wavUrl, { volume: 1, expression: undefined })
  }

  destroy(): void {
    this.app?.ticker.remove(this.onTick)
    this.model?.destroy()
    this.app?.destroy(false, { children: true })
    this.model = null
    this.app = null
  }

  // --- internals ----------------------------------------------------------

  private onTick = (): void => {
    const core = this.coreModel()
    if (!core) return
    const now = performance.now()

    if (now < this.flapUntil) {
      // ~7 Hz organic-ish flap with a touch of variation.
      this.flapPhase += 0.45
      const base = (Math.sin(this.flapPhase) + 1) / 2
      const jitter = (Math.sin(this.flapPhase * 2.3) + 1) / 4
      this.setMouth(Math.min(1, base * 0.7 + jitter * 0.3))
    } else if (this.flapUntil !== 0) {
      this.setMouth(0)
      this.flapUntil = 0
    }

    if (this.needsBlinkFallback) this.driveBlink(core, now)
  }

  private driveBlink(core: CoreModel, now: number): void {
    if (this.nextBlinkAt === 0) this.nextBlinkAt = now + 2000 + Math.random() * 3000
    if (now >= this.nextBlinkAt && this.blinkValue === 1) {
      this.blinkValue = 0
      this.nextBlinkAt = now + 120 // closed for ~120ms
    } else if (this.blinkValue === 0 && now >= this.nextBlinkAt) {
      this.blinkValue = 1
      this.nextBlinkAt = now + 2000 + Math.random() * 3000
    }
    try {
      core.setParameterValueById(EYE_L, this.blinkValue)
      core.setParameterValueById(EYE_R, this.blinkValue)
    } catch {
      this.needsBlinkFallback = false
    }
  }

  private setMouth(value: number): void {
    const core = this.coreModel()
    if (!core) return
    try {
      core.setParameterValueById(MOUTH_PARAM, value)
    } catch {
      /* parameter absent on this model */
    }
  }

  private poke(): void {
    if (!this.model) return
    try {
      // Trigger a random tap-body motion group if the model defines one.
      this.model.motion('TapBody')
    } catch {
      /* no such group */
    }
  }

  private coreModel(): CoreModel | null {
    const core = this.model?.internalModel?.coreModel as CoreModel | undefined
    return core && typeof core.setParameterValueById === 'function' ? core : null
  }

  private readExpressionNames(model: InstanceType<typeof Live2DModel>): string[] {
    try {
      const settings = model.internalModel?.settings as
        | { expressions?: Array<{ Name?: string; name?: string }> }
        | undefined
      const defs = settings?.expressions ?? []
      return defs.map((e) => e.Name ?? e.name ?? '').filter(Boolean)
    } catch {
      return []
    }
  }

  private hasEyeBlinkGroup(model: InstanceType<typeof Live2DModel>): boolean {
    try {
      const settings = model.internalModel?.settings as
        | { groups?: Array<{ Name?: string; name?: string }> }
        | undefined
      const groups = settings?.groups ?? []
      return groups.some((g) => /eyeblink/i.test(g.Name ?? g.name ?? ''))
    } catch {
      return false
    }
  }
}
