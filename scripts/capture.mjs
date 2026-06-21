/**
 * Cross-platform launcher for the headless capture run.
 *
 * Boots the built app with COMPANION_CAPTURE=1 so the main process screenshots
 * the window and writes diagnostics/latest.png + latest.json, then exits. On
 * Linux without a display it wraps the run in xvfb. The agent loop calls this,
 * then reads the PNG + JSON to "see" the app.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronBin = require('electron') // resolves to the electron executable path

const isWin = process.platform === 'win32'
const hasDisplay = isWin || process.platform === 'darwin' || !!process.env.DISPLAY

const env = { ...process.env, COMPANION_CAPTURE: '1' }
const electronArgs = ['.', '--no-sandbox', '--disable-gpu']

let cmd
let args
if (hasDisplay) {
  cmd = electronBin
  args = electronArgs
} else {
  // Headless Linux (CI / cloud): provide a virtual display.
  cmd = 'xvfb-run'
  args = ['-a', electronBin, ...electronArgs]
}

const child = spawn(cmd, args, { stdio: 'inherit', env, shell: isWin })
child.on('exit', (code) => process.exit(code ?? 0))
child.on('error', (err) => {
  console.error('Failed to launch capture run:', err.message)
  process.exit(1)
})
