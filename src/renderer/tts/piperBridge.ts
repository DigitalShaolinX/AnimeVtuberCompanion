/**
 * Renderer-side bridge to the main-process Piper synthesizer. Main spawns the
 * piper binary, writes a WAV, and returns a file:// URL which the Live2D fork's
 * model.speak() can sample for real amplitude lip-sync.
 */
export async function synthesize(text: string): Promise<string> {
  const { wavUrl } = await window.companion.synthesize(text)
  return wavUrl
}
