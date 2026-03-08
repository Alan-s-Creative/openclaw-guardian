import { Command } from 'commander'
import { resolveConfigPathOrDefault } from './runtime.js'
import { detectCurrentVersion } from './version-utils.js'

export function rollbackCmd() {
  return new Command('rollback')
    .description('Rollback OpenClaw to a previous version')
    .option('--to <version>', 'target version to rollback to')
    .option('--dry-run', 'simulate rollback without changes')
    .option('--json', 'output as JSON')
    .action(async (opts: { to?: string; dryRun?: boolean; json?: boolean }) => {
      if (!opts.to) {
        console.error('Please provide --to <version>.')
        process.exitCode = 1
        return
      }

      const configPath = await resolveConfigPathOrDefault()
      const currentVersion = await detectCurrentVersion(configPath)
      const result = {
        from: currentVersion,
        to: opts.to,
        rolledBack: true,
        dryRun: Boolean(opts.dryRun),
      }

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }

      if (opts.dryRun) {
        console.log(`Dry-run: would rollback ${currentVersion} -> ${opts.to}`)
      } else {
        console.log(`Rolled back OpenClaw ${currentVersion} -> ${opts.to} (skeleton flow).`)
      }
    })
}
