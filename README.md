# Live2D Anime Companion

A desktop **Live2D anime-girl companion** driven entirely by a **local LLM**
(via [Ollama](https://ollama.com)). She renders as an animated Live2D model,
speaks her replies out loud with lip-sync, shows emotions, and remembers your
conversations across sessions. Everything runs locally on your machine — no
cloud, no accounts.

> Target OS: **Windows**. Built with Electron, so it can run elsewhere, but the
> default Web Speech voices and Piper paths assume Windows.

---

## Features

- **Live2D avatar** — PIXI 7 + Cubism 4/5, with auto idle / blink / breath and
  emotion-driven expressions.
- **Local LLM chat** — streams replies token-by-token from any Ollama model;
  swap models from the settings drawer.
- **Voice + lip-sync** — built-in Windows SAPI voices via the Web Speech API
  (zero install), or optional high-quality [Piper](https://github.com/rhasspy/piper)
  for real amplitude lip-sync.
- **Emotions** — she prefixes each reply with an emotion tag that drives her
  expression; a keyword/punctuation fallback covers models that forget.
- **Persistent memory** — conversation history, learned facts, and a rolling
  summary are stored on disk and reloaded on restart.
- **Editable persona** — the system prompt is fully yours to edit. The
  companion's behaviour is determined solely by the chosen model + your persona.

---

## Quick start (one click)

**Windows:** double-click **`start.bat`**. That's it.

It checks for everything the app needs and installs whatever is missing —
Node.js, project dependencies, the Live2D assets, Ollama, and a default model —
then launches the app. Run it again any time; it's safe to repeat and only does
work that's actually needed.

**macOS / Linux:** run `./start.sh` (needs Node.js already installed).

Prefer to drive it yourself? `npm run setup` runs the same checks/installs
without launching, and prints a status report of what's ready and what isn't.

> The very first run downloads the Live2D model and (if needed) the Ollama
> model, so it can take a few minutes. Later runs are fast.

## Prerequisites (handled automatically by the launcher)

1. **Node.js 20.11+** (Node 22 recommended).
2. **Ollama** installed and running, with a model pulled:
   ```sh
   ollama serve
   ollama pull llama3.2
   ```

## Manual setup

```sh
npm install          # installs deps, then runs fetch-assets (see below)
npm run dev          # launches the app with hot reload
```

`npm install` triggers `scripts/fetch-assets.ts`, which downloads:

- the proprietary **Cubism Core** runtime → `src/renderer/public/cubism/`
- the free **Hiyori** sample model → `resources/models/Hiyori/`

Both locations are gitignored (neither asset is redistributable). If the
download is blocked or fails, the rest of the install still succeeds — just run
it again on a connected machine:

```sh
npm run fetch-assets
```

You can also drop in **your own** `*.model3.json` model under
`resources/models/<YourModel>/` and your own `live2dcubismcore.min.js` under
`src/renderer/public/cubism/`.

## Build & run a production bundle

```sh
npm run build
npm run start
```

## Tests & type-checking

```sh
npm test             # Vitest unit tests (pure logic)
npm run typecheck    # tsc for main/preload and renderer
```

Unit tests cover the fragile pure logic — emotion tag parsing/inference,
Ollama NDJSON stream parsing (including deltas split across network reads), and
prompt/memory assembly. Rendering, TTS, and live Ollama I/O are verified
manually.

---

## Troubleshooting / diagnostics

The app writes a plain-text log every run — share it if something misbehaves:

- **Windows:** `%APPDATA%\live2d-anime-companion\diagnostics.log`
- **macOS:** `~/Library/Application Support/live2d-anime-companion/diagnostics.log`
- **Linux:** `~/.config/live2d-anime-companion/diagnostics.log`

It records app/Electron/Chrome versions, whether the model and Ollama were
found at startup, and any renderer console warnings/errors. The window also
never goes blank: load failures are painted on-screen, and the avatar area
shows a specific message (e.g. "No Live2D model found" or "Could not find
Cubism 4 runtime") so the cause is obvious.

`npm run smoke` boots the app headlessly (via `xvfb` on Linux/CI) and asserts
the renderer mounts and the chat UI is present — the automated guard against
"blank window" regressions. It also runs in CI on every push.

## Let Claude finish it for you (autonomous local loop)

The app can take a screenshot of itself, which lets a Claude Code agent running
on *your* machine see what's on screen and self-correct until the avatar
renders — no human relaying screenshots.

- `npm run capture` boots the app headlessly, screenshots the real window to
  `diagnostics/latest.png`, and writes a structured report (`status`, DOM,
  console errors, whether the model/Ollama were found) to
  `diagnostics/latest.json`.
- `npm run iterate` = build + capture, the single step the loop repeats.

To run the loop:

1. Install **Claude Code** on your PC (VS Code extension, desktop app, or
   `npm i -g @anthropic-ai/claude-code`).
2. Open this project folder in Claude Code.
3. Run the bundled command: **`/iterate`**.

It runs `npm run iterate`, *looks at* `diagnostics/latest.png` + `latest.json`,
diagnoses, makes the smallest fix, and repeats until
`status: "avatar-rendered"` — then type-checks, tests, commits, and pushes.
(The loop is defined in `.claude/commands/iterate.md`.)

## Architecture

One window, three processes (standard Electron isolation):

- **Main** (Node) — owns network + disk. Talks to Ollama, runs optional Piper,
  reads/writes memory + settings in `userData`, and serves the gitignored
  `resources/` folder to the renderer over a privileged `companion://` protocol.
  Exposes a small typed API over IPC.
- **Preload** (`contextIsolation: true`, `nodeIntegration: false`) — a
  `contextBridge` exposing `window.companion` and nothing else.
- **Renderer** (Chromium) — PIXI/Live2D rendering, chat UI, Web Speech TTS,
  lip-sync, emotion mapping. No secrets (fully local).

### Per-turn data flow

```
type + Enter → useChat.send → IPC 'chat:start' → main POST /api/chat {stream:true}
  → main streams NDJSON deltas → webContents.send('chat:token') → UI streams text
  → on 'chat:done': persist turn · parseEmotion → live2dController.playEmotion
                                  · ttsController.speak(cleanText)
per frame: live2dController updates mouth + auto idle/blink/breath
```

### Project layout

```
electron.vite.config.ts        # 3 build roots: main / preload / renderer
scripts/fetch-assets.ts        # first-run download of Cubism Core + sample model
resources/ (gitignored)        # models/<Sample>/...
src/renderer/public/cubism/    # (gitignored) live2dcubismcore.min.js
src/main/
  index.ts                     # lifecycle, BrowserWindow, IPC wiring
  ollama.ts                    # chatStream (NDJSON), listModels, pullModel
  assets.ts                    # companion:// protocol + model discovery
  tts-piper.ts                 # optional: spawn piper → WAV
  store/{db,memory,settings}.ts# persistence: history, facts, rolling summary
src/preload/index.ts           # typed contextBridge API
src/renderer/
  index.html                   # loads cubism core script, then app
  app.tsx                      # <Live2DStage/> + <ChatPanel/> + <SettingsDrawer/>
  live2d/{Live2DStage,live2dController,emotion}
  chat/{ChatPanel,useChat}
  tts/{ttsController,webspeech,piperBridge}
  settings/SettingsDrawer
src/shared/types.ts            # IPC channels + shared types/contract
```

---

## Pinned toolchain

Compatibility here is fragile — these versions are pinned deliberately:

| Concern        | Choice                                                            |
| -------------- | ---------------------------------------------------------------- |
| Shell          | Electron 34, windowed BrowserWindow                              |
| Scaffold/build | electron-vite 2 + React 18 + TS 5.5                              |
| Avatar render  | **pixi.js 7.4.2** (not v8) + **pixi-live2d-display-lipsyncpatch 0.5.0-ls-8** |
| Cubism runtime | `live2dcubismcore.min.js` (proprietary, fetched at install)      |
| LLM            | Ollama `http://localhost:11434` (`/api/chat` NDJSON stream)      |
| TTS (default)  | Web Speech API `speechSynthesis` (Windows SAPI voices)           |
| TTS (optional) | Piper binary in main → WAV (real amplitude lip-sync)             |
| Memory         | lowdb 7 (JSON) in `app.getPath('userData')`                      |
| Validation     | zod (emotion tags, settings, defensive Ollama chunk parsing)     |

`pixi.js` must stay on **v7.4.2**: the lip-sync fork supports PIXI 7 + Cubism
4/5 and provides `model.speak()`. The original `pixi-live2d-display` is
PIXI-v6-only and unmaintained.

A note on lip-sync: `SpeechSynthesisUtterance.onboundary` is unreliable in
Chromium/Electron and Web Speech exposes no audio stream, so the default TTS
uses a timer-based mouth-flap envelope (start on `onstart`, ramp to 0 on
`onend`). The Piper path gets real amplitude lip-sync for free via the fork's
`model.speak(wavUrl)`.

---

## Licensing / assets

**Cubism Core** is proprietary to Live2D Inc. and must not be committed or
redistributed; the **Live2D sample models** likewise can't be redistributed in
this repo. `scripts/fetch-assets.ts` downloads them from the official sources at
install time into gitignored folders — this is simply the technical means of
"use a free sample model," not a bundled asset. Review and comply with the
[Live2D Cubism SDK license](https://www.live2d.com/en/sdk/license/) and the
sample model terms. Drop in your own model any time.
