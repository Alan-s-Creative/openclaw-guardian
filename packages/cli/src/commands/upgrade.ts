import { Command } from 'commander'
import { loadCoreModule } from './runtime.js'

interface UpgradeResult {
  dryRun: boolean
  checkOnly?: boolean
  targetVersion?: string
  previousVersion?: string
  installed: boolean
  updateAvailable?: boolean
  error?: string
}

type PerformUpgradeFn = (options?: {
  dryRun?: boolean
  checkOnly?: boolean
  force?: boolean
}) => Promise<UpgradeResult>

export function upgradeCmd() {
  return new Command('upgrade')
    .description('Upgrade OpenClaw safely')
    .option('--check', 'check latest version only')
    .option('--force', 'skip confirmation prompt')
    .option('--dry-run', 'simulate upgrade without changes')
    .option('--json', 'output as JSON')
    .action(async (opts: { check?: boolean; force?: boolean; dryRun?: boolean; json?: boolean }) => {
      const core = await loadCoreModule()
      const performUpgrade = core?.performUpgrade as PerformUpgradeFn | undefined

      if (typeof performUpgrade !== 'function') {
        console.error('Upgrade engine unavailable. Build @openclaw-guardian/core first.')
        process.exitCode = 1
        return
      }

      if (!opts.force && !opts.dryRun && !opts.check) {
        console.error('Non-interactive mode requires --force, --check, or --dry-run.')
        process.exitCode = 1
        return
      }

      let result: UpgradeResult
      try {
        result = await performUpgrade({
          checkOnly: Boolean(opts.check),
          dryRun: Boolean(opts.dryRun),
          force: Boolean(opts.force),
        })
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'Upgrade failed.')
        process.exitCode = 1
        return
      }

      const output = {
        currentVersion: result.previousVersion ?? 'unknown',
        latestVersion: result.targetVersion ?? 'unknown',
        upgraded: result.installed,
        dryRun: result.dryRun,
        checkOnly: Boolean(result.checkOnly),
        updateAvailable: result.updateAvailable ?? false,
        error: result.error,
      }

      if (opts.check) {
        if (opts.json) {
          console.log(JSON.stringify(output, null, 2))
        } else {
          console.log(`Current: ${output.currentVersion}`)
          console.log(`Latest: ${output.latestVersion}`)
          console.log(`Update available: ${output.updateAvailable}`)
        }
        return
      }

      if (opts.dryRun) {
        if (opts.json) {
          console.log(JSON.stringify(output, null, 2))
        } else {
          console.log(`Dry-run: would upgrade ${output.currentVersion} -> ${output.latestVersion}`)
        }
        return
      }

      if (result.error) {
        if (opts.json) {
          console.log(JSON.stringify(output, null, 2))
        } else {
          console.error(result.error)
        }
        process.exitCode = 1
        return
      }

      if (opts.json) {
        console.log(JSON.stringify(output, null, 2))
      } else {
        console.log(`Upgraded OpenClaw ${output.currentVersion} -> ${output.latestVersion}.`)
      }
    })
}
