import { execFile as execFileCb } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCb)

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function detectVersionFromCli(): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFile('openclaw', ['--version'], {
      timeout: 1500,
    })
    const output = `${stdout ?? ''}\n${stderr ?? ''}`.trim()
    if (!output) {
      return null
    }

    const semverMatch = output.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)
    if (semverMatch?.[0]) {
      return semverMatch[0]
    }

    return output.split(/\r?\n/)[0]?.trim() || null
  } catch {
    return null
  }
}

export async function detectOpenClawVersion(configPath: string): Promise<string> {
  let parsed: { version?: unknown } | null = null

  try {
    const raw = await readFile(configPath, 'utf-8')
    parsed = JSON.parse(raw) as { version?: unknown }
    if (typeof parsed.version === 'string' && parsed.version.trim()) {
      return parsed.version.trim()
    }
  } catch {
    return 'unknown'
  }

  if (parsed) {
    const cliVersion = await detectVersionFromCli()
    if (cliVersion) {
      return cliVersion
    }
  }

  return 'unknown'
}

export async function detectConfigPath(): Promise<string | null> {
  const configuredPath = process.env.GUARDIAN_CONFIG_PATH
  if (configuredPath) {
    return (await pathExists(configuredPath)) ? configuredPath : null
  }

  const home = os.homedir()
  const candidates = [
    path.join(home, '.openclaw', 'openclaw.json'),
    path.join(home, 'Library', 'Application Support', 'openclaw', 'openclaw.json'),
  ]

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }

  return null
}
