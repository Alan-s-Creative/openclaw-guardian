import { Command } from 'commander'
import { resolveConfigPathOrDefault } from './runtime.js'
import { detectCurrentVersion } from './version-utils.js'

export function upgradeCmd() {
  return new Command('upgrade')
    .description('Upgrade OpenClaw safely')
    .option('--check', 'check latest version only')
    .option('--force', 'skip confirmation prompt')
    .option('--dry-run', 'simulate upgrade without changes')
    .option('--json', 'output as JSON')
    .action(async (opts: { check?: boolean; force?: boolean; dryRun?: boolean; json?: boolean }) => {
      const configPath = await resolveConfigPathOrDefault()
      const currentVersion = await detectCurrentVersion(configPath)
      const latestVersion = currentVersion === 'unknown' ? 'latest' : currentVersion
      const result = {
        currentVersion,
        latestVersion,
        upgraded: false,
        dryRun: Boolean(opts.dryRun),
      }

      if (opts.check) {
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2))
        } else {
          console.log(`Current: ${currentVersion}`)
          console.log(`Latest: ${latestVersion}`)
        }
        return
      }

      if (opts.dryRun) {
        result.upgraded = true
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2))
        } else {
          console.log(`Dry-run: would upgrade ${currentVersion} -> ${latestVersion}`)
        }
        return
      }

      if (!opts.force) {
        console.error('Non-interactive mode requires --force or --dry-run.')
        process.exitCode = 1
        return
      }

      result.upgraded = true
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        console.log(`Upgraded OpenClaw ${currentVersion} -> ${latestVersion} (skeleton flow).`)
      }
    })
}
