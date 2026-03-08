import { execFile as execFileCb } from 'node:child_process'
import { Command } from 'commander'
import { promisify } from 'node:util'
import { resolveConfigPathOrDefault } from './runtime.js'
import { detectCurrentVersion } from './version-utils.js'

const execFile = promisify(execFileCb)

interface VersionRow {
  version: string
  current: boolean
}

async function fetchAvailableVersions(): Promise<string[]> {
  try {
    const { stdout } = await execFile('npm', ['view', 'openclaw', 'versions', '--json'], {
      timeout: 4000,
      maxBuffer: 1024 * 512,
    })

    const parsed = JSON.parse(stdout.trim()) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
    if (typeof parsed === 'string') {
      return [parsed]
    }
    return []
  } catch {
    return []
  }
}

export function versionsCmd() {
  return new Command('versions')
    .description('List available OpenClaw versions')
    .option('--json', 'output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const configPath = await resolveConfigPathOrDefault()
      const currentVersion = await detectCurrentVersion(configPath)
      const availableVersions = await fetchAvailableVersions()

      const deduped = Array.from(new Set(availableVersions))
      if (currentVersion !== 'unknown' && !deduped.includes(currentVersion)) {
        deduped.unshift(currentVersion)
      }

      const rows: VersionRow[] = deduped.map((version) => ({
        version,
        current: version === currentVersion,
      }))

      if (opts.json) {
        console.log(JSON.stringify(rows, null, 2))
        return
      }

      if (rows.length === 0) {
        console.log('No versions found.')
        return
      }

      for (const row of rows) {
        const marker = row.current ? '*' : ' '
        console.log(`${marker} ${row.version}`)
      }
    })
}
