---
description: Autonomously drive the Live2D Companion until the avatar renders, using screenshot+diagnostics feedback
allowed-tools: Bash(npm run:*), Bash(npm test:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(ollama:*), Read, Edit, Write, Glob, Grep
---

You are finishing the **Live2D Anime Companion** desktop app on the user's own
machine. You can SEE the running app: `npm run capture` boots it headlessly,
screenshots the real window to `diagnostics/latest.png`, and writes a structured
report to `diagnostics/latest.json`. Use that feedback to self-correct in a loop.

## Goal

The app window shows the Live2D anime girl rendered and animating (idle/blink),
with the chat panel below. Success = `diagnostics/latest.json` has
`"status": "avatar-rendered"` AND the screenshot visibly shows the character.

## Preflight (once)

1. Ensure assets + model exist: `npm run setup`. If `diagnostics`/startup logs
   show the model is missing, run `npm run fetch-assets`. If Ollama has no model,
   the avatar still renders — chatting needs `ollama pull llama3.2`, but don't
   block avatar work on it.
2. `npm install` if `node_modules` is absent.

## The loop (repeat until success or genuinely stuck)

1. Run `npm run iterate` (this builds, then captures).
2. **Read `diagnostics/latest.json`** and **view `diagnostics/latest.png`** (Read
   the PNG — you can see it). Also skim `errors[]` and `stageStatus`.
3. Decide:
   - `status: "avatar-rendered"` and the screenshot shows the character →
     **done**. Run `npm run typecheck` + `npm test`, then `git add -A && git
     commit` with a clear message and `git push`. Report success with the
     screenshot description. STOP.
   - `status: "renderer-ok-no-avatar"` → the React app is fine but the model
     didn't load. Read `stageStatus` + `errors[]` and fix the avatar pipeline
     (model URL/protocol, Cubism runtime loading, PIXI/Live2D init, positioning,
     scale). Common culprits: missing/empty `resources/models`, the cubism core
     `<script>` not loading, shader/CSP issues, model anchored off-screen.
   - `status: "broken"` (renderer didn't mount) → a renderer crash. Read
     `errors[]` and the pink fatal screen text; fix the import/module error.
4. Make the **smallest** fix that addresses the evidence. Re-run the loop.

## Rules

- Stay in scope: this is a Live2D + Ollama companion. Do NOT add features the
  plan didn't ask for (no moderation, filters, telemetry, etc.).
- Keep security tight: do not add `unsafe-eval` to the CSP — PIXI is handled by
  `@pixi/unsafe-eval`. Keep `contextIsolation` on.
- Respect the pinned toolchain (pixi 7.4.2, the lipsync fork, electron 34).
- Before every commit: `npm run typecheck` and `npm test` must pass.
- Commit each working improvement separately with a descriptive message; push
  when the avatar renders.
- If you loop ~6 times with no progress on the same error, stop and write a
  concise summary of what you tried, the current `diagnostics/latest.json`, and
  your best hypothesis — don't thrash.

Begin with the preflight, then start the loop.
