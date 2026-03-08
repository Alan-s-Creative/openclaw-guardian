import { Command } from 'commander'
import { createStoreFromEnv, resolveConfigPath } from './runtime.js'

export function statusCmd() {
  return new Command('status')
    .description('Show current Guardian status')
    .option('--json', 'output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const [configPath, store] = await Promise.all([resolveConfigPath(), createStoreFromEnv()])
      const snapshots = await store.list()
      const lastSnapshot = snapshots[0]

      const status = {
        configPath: configPath ?? 'not found',
        watching: false,
        lastSnapshot: lastSnapshot
          ? {
              id: lastSnapshot.id,
              timestamp: lastSnapshot.timestamp,
              trigger: lastSnapshot.trigger,
            }
          : null,
      }

      if (opts.json) {
        console.log(JSON.stringify(status, null, 2))
        return
      }

      console.log(`Config: ${status.configPath}`)
      console.log(`Watching: ${status.watching}`)
      console.log(`Last snapshot: ${status.lastSnapshot?.id ?? 'none'}`)
    })
}
