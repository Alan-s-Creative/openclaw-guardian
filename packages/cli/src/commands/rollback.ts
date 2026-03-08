import { Command } from 'commander'
import { loadCoreModule, resolveConfigPathOrDefault } from './runtime.js'
import { detectCurrentVersion } from './version-utils.js'

interface RollbackResult {
  targetVersion: string
  dryRun: boolean
  success?: boolean
  error?: string
}

type RollbackUpgradeFn = (options: {
  targetVersion: string
  dryRun?: boolean
}) => Promise<RollbackResult>

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

      const core = await loadCoreModule()
      const rollbackUpgrade = core?.rollbackUpgrade as RollbackUpgradeFn | undefined
      if (typeof rollbackUpgrade !== 'function') {
        console.error('Rollback engine unavailable. Build @openclaw-guardian/core first.')
        process.exitCode = 1
        return
      }

      const configPath = await resolveConfigPathOrDefault()
      const currentVersion = await detectCurrentVersion(configPath)
      let rollback: RollbackResult
      try {
        rollback = await rollbackUpgrade({
          targetVersion: opts.to,
          dryRun: Boolean(opts.dryRun),
        })
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'Rollback failed.')
        process.exitCode = 1
        return
      }

      const result = {
        from: currentVersion,
        to: rollback.targetVersion,
        rolledBack: Boolean(rollback.success),
        dryRun: rollback.dryRun,
        error: rollback.error,
      }

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2))
        if (rollback.error) {
          process.exitCode = 1
        }
        return
      }

      if (opts.dryRun) {
        console.log(`Dry-run: would rollback ${currentVersion} -> ${opts.to}`)
      } else if (rollback.error) {
        console.error(rollback.error)
        process.exitCode = 1
      } else {
        console.log(`Rolled back OpenClaw ${currentVersion} -> ${opts.to}.`)
      }
    })
}
