import { useEffect, useRef, useState } from 'react'
import { Live2DController } from './live2dController'

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

    const controller = new Live2DController()
    let disposed = false

    ;(async () => {
      try {
        await controller.init(canvas)
        const url = await window.companion.getModelUrl()
        if (!url) {
          setStatus('No model found. Run "npm run fetch-assets" to download the sample model.')
          return
        }
        await controller.load(url)
        if (disposed) return
        setStatus('')
        onReadyRef.current(controller)
      } catch (err) {
        setStatus(`Could not load model: ${(err as Error).message}`)
      }
    })()

    const onResize = () => controller.resize()
    window.addEventListener('resize', onResize)

    return () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      controller.destroy()
    }
  }, [])

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="stage-canvas" />
      {status && <div className="stage-status">{status}</div>}
    </div>
  )
}
