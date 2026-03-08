import { Command } from 'commander'
import { createStoreFromEnv } from './runtime.js'

export function restoreCmd() {
  return new Command('restore')
    .description('Restore config from snapshot')
    .argument('[id]', 'snapshot id to restore (positional)')
    .option('--list', 'list available snapshots')
    .option('--latest', 'restore the most recent snapshot')
    .option('--id <id>', 'snapshot id to restore')
    .option('--json', 'output as JSON')
    .action(async (positionalId: string | undefined, opts: { list?: boolean; latest?: boolean; id?: string; json?: boolean }) => {
      const store = await createStoreFromEnv()
      let id = positionalId ?? opts.id

      if (opts.latest) {
        const list = await store.list()
        if (list.length === 0) {
          console.error('No snapshots found')
          process.exit(1)
        }
        id = list[0].id
      }

      if (opts.list || !id) {
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
          const triggerStr = typeof snapshot.trigger === 'string' ? snapshot.trigger : JSON.stringify(snapshot.trigger)
          console.log(`${snapshot.id}  ${snapshot.timestamp}  ${triggerStr}`)
        }
        return
      }

      await store.restore(id)
      if (opts.json) {
        console.log(JSON.stringify({ restored: true, snapshotId: id }, null, 2))
        return
      }

      console.log(`Restored snapshot ${id}`)
    })
}
