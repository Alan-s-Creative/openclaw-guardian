import { readFile } from 'node:fs/promises'

export async function detectCurrentVersion(configPath: string): Promise<string> {
  try {
    const raw = await readFile(configPath, 'utf-8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    if (typeof parsed.version === 'string' && parsed.version.trim()) {
      return parsed.version.trim()
    }
  } catch {
    // Return unknown when config is missing/corrupt.
  }
  return 'unknown'
}
