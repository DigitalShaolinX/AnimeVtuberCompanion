import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PiperResult, Settings } from '@shared/types'

/**
 * Synthesize `text` to a WAV file using a local Piper binary and return a
 * file:// URL the renderer can hand to model.speak() for amplitude lip-sync.
 *
 * Piper reads text on stdin and writes a WAV to the path given by
 * `--output_file`. We use a per-call temp file so concurrent turns don't race.
 */
export async function synthesizeWithPiper(text: string, settings: Settings): Promise<PiperResult> {
  if (!settings.piperPath || !settings.piperVoicePath) {
    throw new Error('Piper is selected but piperPath / piperVoicePath are not configured.')
  }

  const dir = await mkdtemp(join(tmpdir(), 'companion-tts-'))
  const wavPath = join(dir, `speech-${Date.now()}.wav`)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      settings.piperPath as string,
      ['--model', settings.piperVoicePath as string, '--output_file', wavPath],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    )

    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`piper exited with code ${code}: ${stderr.trim()}`))
    })

    proc.stdin.write(text)
    proc.stdin.end()
  })

  // Ensure the temp file exists / is flushed before returning the URL.
  await writeFile(wavPath, '', { flag: 'a' }).catch(() => {})

  return { wavUrl: pathToFileURL(wavPath).href }
}
