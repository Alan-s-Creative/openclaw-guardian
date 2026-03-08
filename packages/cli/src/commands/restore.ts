import { Command } from 'commander'
import { createStoreFromEnv } from './runtime.js'

export function restoreCmd() {
  return new Command('restore')
    .description('Restore config from snapshot')
    .option('--list', 'list available snapshots')
    .option('--id <id>', 'snapshot id to restore')
    .option('--json', 'output as JSON')
    .action(async (opts: { list?: boolean; id?: string; json?: boolean }) => {
      const store = await createStoreFromEnv()

      if (opts.list || !opts.id) {
        const snapshots = await store.list()
        if (opts.json) {
          console.log(JSON.stringify(snapshots, null, 2))
          return
        }

        if (snapshots.length === 0) {
          console.log('No snapshots available.')
          return
        }

        for (const snapshot of snapshots) {
          console.log(`${snapshot.id}  ${snapshot.timestamp}  ${snapshot.trigger}`)
        }
        return
      }

      await store.restore(opts.id)
      if (opts.json) {
        console.log(JSON.stringify({ restored: true, snapshotId: opts.id }, null, 2))
        return
      }

      console.log(`Restored snapshot ${opts.id}`)
    })
}
