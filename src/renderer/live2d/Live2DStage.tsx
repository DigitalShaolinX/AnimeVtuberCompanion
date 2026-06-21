import { useEffect, useRef, useState } from 'react'
import type { Live2DController } from './live2dController'

interface Live2DStageProps {
  /** Receives the initialised controller once the model has loaded. */
  onReady: (controller: Live2DController) => void
}

export function Live2DStage({ onReady }: Live2DStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<string>('Loading companion…')
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let controller: Live2DController | null = null
    let disposed = false
    let onResize: (() => void) | null = null

    ;(async () => {
      try {
        // Loaded lazily so a PIXI/Live2D failure degrades to an on-screen
        // message instead of blanking the whole app.
        const { Live2DController } = await import('./live2dController')
        controller = new Live2DController()
        await controller.init(canvas)

        const url = await window.companion.getModelUrl()
        if (!url) {
          setStatus(
            'No Live2D model found. The asset download may have been blocked — ' +
              'run "npm run fetch-assets" (or re-run start.bat), then reopen.'
          )
          return
        }
        await controller.load(url)
        if (disposed) {
          controller.destroy()
          return
        }
        setStatus('')
        onResize = () => controller?.resize()
        window.addEventListener('resize', onResize)
        onReadyRef.current(controller)
      } catch (err) {
        console.error('[Live2DStage] load failed:', err)
        setStatus(`Could not load the avatar: ${(err as Error).message}`)
      }
    })()

    return () => {
      disposed = true
      if (onResize) window.removeEventListener('resize', onResize)
      controller?.destroy()
    }
  }, [])

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="stage-canvas" />
      {status && <div className="stage-status">{status}</div>}
    </div>
  )
}
