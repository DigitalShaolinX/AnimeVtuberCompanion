import { app } from 'electron'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WebContents } from 'electron'

/**
 * Lightweight always-on diagnostics. Mirrors key main-process events and the
 * renderer's console/errors to userData/diagnostics.log (and stdout) so a user
 * can hand over one file when something misbehaves, and so the headless smoke
 * test has something to assert against.
 */
let logPath = ''

export function diagnosticsLogPath(): string {
  return logPath
}

export function initDiagnostics(): void {
  logPath = join(app.getPath('userData'), 'diagnostics.log')
  const header =
    [
      '=== Live2D Companion diagnostics ===',
      `time:      ${new Date().toISOString()}`,
      `app:       ${app.getVersion()}`,
      `electron:  ${process.versions.electron}   chrome: ${process.versions.chrome}   node: ${process.versions.node}`,
      `platform:  ${process.platform} ${process.arch}`,
      `userData:  ${app.getPath('userData')}`,
      `log file:  ${logPath}`
    ].join('\n') + '\n\n'
  try {
    writeFileSync(logPath, header)
  } catch {
    /* logging must never crash the app */
  }
  process.on('uncaughtException', (e) => log(`[main] uncaughtException: ${e?.stack ?? e}`))
  process.on('unhandledRejection', (r) => log(`[main] unhandledRejection: ${String(r)}`))
}

export function log(line: string): void {
  const stamped = `${new Date().toISOString().slice(11, 23)}  ${line}`
  console.log(stamped)
  try {
    if (logPath) appendFileSync(logPath, stamped + '\n')
  } catch {
    /* ignore */
  }
}

const LEVELS = ['verbose', 'info', 'warning', 'error']

/** Wire a renderer's console + crash/fail events into the log. */
export function attachRendererDiagnostics(wc: WebContents): void {
  wc.on(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'console-message' as any,
    (_e: unknown, level: number, message: string, line: number, sourceId: string) => {
      // Only surface warnings/errors to keep the log readable.
      if (typeof level === 'number' && level >= 2) {
        log(`[renderer ${LEVELS[level] ?? level}] ${message}  (${sourceId}:${line})`)
      }
    }
  )
  wc.on('render-process-gone', (_e, details) =>
    log(`[renderer] process gone: ${details.reason} (exit ${details.exitCode})`)
  )
  wc.on('did-fail-load', (_e, code, desc, url) =>
    log(`[renderer] did-fail-load ${code} ${desc} ${url}`)
  )
  wc.on('preload-error', (_e, preloadPath, err) =>
    log(`[renderer] preload-error ${preloadPath}: ${err?.stack ?? err}`)
  )
  wc.on('unresponsive', () => log('[renderer] unresponsive'))
}
