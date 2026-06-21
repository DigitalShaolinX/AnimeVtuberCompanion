import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import './styles.css'

/** Render a fatal error directly into the page so the window is never blank. */
function showFatal(err: unknown): void {
  const message = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err)
  const root = document.getElementById('root')
  const html = `
    <div style="padding:24px;font-family:Segoe UI,system-ui,sans-serif;color:#ffd6e0;
                background:#11131a;height:100vh;box-sizing:border-box;overflow:auto">
      <h2 style="color:#ff7eb6;margin:0 0 8px">The companion hit an error</h2>
      <p style="color:#9aa1b4;margin:0 0 12px">
        Please send this to whoever set this up. (Press Ctrl+Shift+I for the full console.)
      </p>
      <pre style="white-space:pre-wrap;font-size:12px;line-height:1.5">${message
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</pre>
    </div>`
  if (root) root.innerHTML = html
  else document.body.innerHTML = html
}

/** Catches render-time errors anywhere in the React tree. */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    showFatal(error)
  }
  render() {
    return this.state.error ? null : this.props.children
  }
}

// Surface anything that escapes React (async, event handlers, etc.).
window.addEventListener('error', (e) => showFatal(e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => showFatal(e.reason))

try {
  const container = document.getElementById('root')
  if (!container) throw new Error('Root container #root not found')
  createRoot(container).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
} catch (err) {
  showFatal(err)
}
