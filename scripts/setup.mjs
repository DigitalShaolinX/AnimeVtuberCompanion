/**
 * One-click setup / doctor for the Live2D Companion.
 *
 * Checks every prerequisite and fixes whatever is missing, then leaves the app
 * ready to launch. Safe to run repeatedly — every step is idempotent.
 *
 *   node scripts/setup.mjs          # check + fix, print a status report
 *   node scripts/setup.mjs --start  # ...then launch the app (npm run dev)
 *
 * Note: this is a Node script, so Node must already exist to run it. The
 * platform launchers (start.bat / start.sh) install Node first, then call this.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const IS_WIN = process.platform === 'win32'
const DEFAULT_MODEL = 'llama3.2'
const OLLAMA_HOST = process.env.OLLAMA_HOST?.replace(/\/$/, '') ?? 'http://localhost:11434'

const args = new Set(process.argv.slice(2))
const results = [] // { label, ok, note }

// ---- tiny console helpers ------------------------------------------------
const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s)
const bold = (s) => c('1', s)
const green = (s) => c('32', s)
const red = (s) => c('31', s)
const yellow = (s) => c('33', s)
const dim = (s) => c('2', s)

function step(label) {
  process.stdout.write(`${dim('•')} ${label} … `)
}
function ok(note = '') {
  console.log(green('ok') + (note ? ` ${dim(note)}` : ''))
}
function warn(note = '') {
  console.log(yellow('skipped') + (note ? ` ${dim('— ' + note)}` : ''))
}
function fail(note = '') {
  console.log(red('failed') + (note ? ` ${dim('— ' + note)}` : ''))
}
function record(label, status, note = '') {
  results.push({ label, status, note })
}

function run(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: opts.quiet ? 'pipe' : 'inherit',
    shell: IS_WIN, // resolve .cmd/.bat shims (npm, winget) on Windows
    encoding: 'utf8',
    ...opts
  })
}

function commandExists(cmd) {
  const probe = IS_WIN
    ? run('where', [cmd], { quiet: true })
    : run('command', ['-v', cmd], { quiet: true, shell: true })
  return probe.status === 0
}

async function httpOk(url, ms = 1500) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    return res.ok ? res : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- checks --------------------------------------------------------------

function checkNode() {
  step('Node.js runtime')
  const [maj, min] = process.versions.node.split('.').map(Number)
  const good = maj > 20 || (maj === 20 && min >= 11)
  if (good) {
    ok(`v${process.versions.node}`)
    record('Node.js', 'ok', `v${process.versions.node}`)
  } else {
    fail(`v${process.versions.node} — need >= 20.11`)
    record('Node.js', 'fail', `v${process.versions.node} is too old; install Node 20.11+ (LTS)`)
  }
  return good
}

function ensureDependencies() {
  step('Project dependencies')
  const installed = existsSync(join(ROOT, 'node_modules')) && depsSatisfied()
  if (installed) {
    ok('already installed')
    record('Dependencies', 'ok')
    return true
  }
  console.log(dim('installing (npm install)…'))
  const r = run('npm', ['install'])
  if (r.status === 0) {
    record('Dependencies', 'ok', 'installed')
    return true
  }
  fail('npm install failed')
  record('Dependencies', 'fail', 'run `npm install` manually and check the error output')
  return false
}

function depsSatisfied() {
  // Cheap sanity check: a few key packages are present on disk. (A subpath
  // require.resolve would trip over packages that restrict "exports".)
  const nm = join(ROOT, 'node_modules')
  return ['electron', 'pixi.js', 'pixi-live2d-display-lipsyncpatch', 'react'].every((p) =>
    existsSync(join(nm, p))
  )
}

function findModel() {
  const dir = join(ROOT, 'resources', 'models')
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try {
      entries = readdirSync(cur)
    } catch {
      continue
    }
    for (const name of entries) {
      const full = join(cur, name)
      let info
      try {
        info = statSync(full)
      } catch {
        continue
      }
      if (info.isDirectory()) stack.push(full)
      else if (name.toLowerCase().endsWith('.model3.json')) return full
    }
  }
  return null
}

function ensureAssets() {
  step('Live2D assets (Cubism Core + sample model)')
  const core = join(ROOT, 'src', 'renderer', 'public', 'cubism', 'live2dcubismcore.min.js')
  const haveCore = existsSync(core)
  const haveModel = !!findModel()
  if (haveCore && haveModel) {
    ok('present')
    record('Assets', 'ok')
    return true
  }
  console.log(dim('downloading (npm run fetch-assets)…'))
  run('npm', ['run', 'fetch-assets'])
  const okNow = existsSync(core) && !!findModel()
  if (okNow) {
    record('Assets', 'ok', 'downloaded')
    return true
  }
  record(
    'Assets',
    'warn',
    'download blocked — re-run `npm run fetch-assets` on a connected machine, ' +
      'or drop your own model into resources/models/ and live2dcubismcore.min.js ' +
      'into src/renderer/public/cubism/'
  )
  return false
}

function ensureOllamaInstalled() {
  step('Ollama installed')
  if (commandExists('ollama')) {
    ok()
    record('Ollama installed', 'ok')
    return true
  }
  if (IS_WIN) {
    console.log(dim('not found — installing via winget…'))
    const r = run('winget', [
      'install',
      '-e',
      '--id',
      'Ollama.Ollama',
      '--accept-source-agreements',
      '--accept-package-agreements'
    ])
    if (r.status === 0 && commandExists('ollama')) {
      record('Ollama installed', 'ok', 'installed via winget')
      return true
    }
  }
  fail('not installed')
  record(
    'Ollama installed',
    'warn',
    'install it from https://ollama.com/download (then re-run this setup)'
  )
  return false
}

async function ensureOllamaRunning() {
  step('Ollama server')
  if (await httpOk(`${OLLAMA_HOST}/api/tags`)) {
    ok('already running')
    record('Ollama server', 'ok')
    return true
  }
  if (!commandExists('ollama')) {
    warn('Ollama not installed')
    record('Ollama server', 'warn', 'install Ollama first')
    return false
  }
  console.log(dim('starting `ollama serve` in the background…'))
  const child = spawn('ollama', ['serve'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    shell: IS_WIN
  })
  child.unref()
  for (let i = 0; i < 20; i++) {
    await sleep(750)
    if (await httpOk(`${OLLAMA_HOST}/api/tags`)) {
      record('Ollama server', 'ok', 'started')
      return true
    }
  }
  fail('did not come up')
  record('Ollama server', 'warn', 'start it manually with `ollama serve`')
  return false
}

async function ensureModel() {
  step(`Model "${DEFAULT_MODEL}"`)
  const res = await httpOk(`${OLLAMA_HOST}/api/tags`)
  if (!res) {
    warn('Ollama server not reachable')
    record('Model', 'warn', `pull it later with \`ollama pull ${DEFAULT_MODEL}\``)
    return false
  }
  let tags = []
  try {
    const json = await res.json()
    tags = (json.models ?? []).map((m) => m.name)
  } catch {
    /* ignore */
  }
  const have = tags.some((t) => t === DEFAULT_MODEL || t.startsWith(`${DEFAULT_MODEL}:`))
  if (have) {
    ok('present')
    record('Model', 'ok', DEFAULT_MODEL)
    return true
  }
  console.log(dim(`pulling ${DEFAULT_MODEL} (this can take a few minutes)…`))
  const r = run('ollama', ['pull', DEFAULT_MODEL])
  if (r.status === 0) {
    record('Model', 'ok', `pulled ${DEFAULT_MODEL}`)
    return true
  }
  record('Model', 'warn', `pull it manually with \`ollama pull ${DEFAULT_MODEL}\``)
  return false
}

// ---- report --------------------------------------------------------------

function printReport() {
  console.log('\n' + bold('Setup summary'))
  const mark = { ok: green('✓'), warn: yellow('!'), fail: red('✗') }
  for (const r of results) {
    console.log(`  ${mark[r.status] ?? '?'} ${r.label}${r.note ? dim('  — ' + r.note) : ''}`)
  }
  const hardFail = results.some((r) => r.status === 'fail')
  const anyWarn = results.some((r) => r.status === 'warn')
  console.log('')
  if (hardFail) {
    console.log(red(bold('Not ready.')) + ' Resolve the ✗ items above, then re-run setup.')
  } else if (anyWarn) {
    console.log(
      yellow(bold('Almost there.')) +
        ' The app will launch, but the ! items above limit it (e.g. she may not render or reply until fixed).'
    )
  } else {
    console.log(green(bold('All set!')) + ' Everything is installed and running.')
  }
  return !hardFail
}

// ---- main ----------------------------------------------------------------

async function main() {
  console.log(bold('\nLive2D Companion — one-click setup\n'))

  if (!checkNode()) {
    printReport()
    process.exit(1)
  }
  const depsOk = ensureDependencies()
  if (!depsOk) {
    printReport()
    process.exit(1)
  }
  ensureAssets()
  ensureOllamaInstalled()
  await ensureOllamaRunning()
  await ensureModel()

  const ready = printReport()

  if (args.has('--start') && ready) {
    console.log(bold('\nLaunching the app (npm run dev)…\n'))
    const r = run('npm', ['run', 'dev'])
    process.exit(r.status ?? 0)
  } else if (!args.has('--start')) {
    console.log(dim('\nRun `npm run dev` to start, or re-run with --start to launch now.'))
  }
  process.exit(ready ? 0 : 1)
}

main().catch((err) => {
  console.error(red('\nSetup crashed:'), err)
  process.exit(1)
})
