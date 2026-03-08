import { Command } from 'commander'
import { createStoreFromEnv } from './runtime.js'

function parseLimit(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 20
  }
  return parsed
}

export function historyCmd() {
  return new Command('history')
    .description('Show snapshot history')
    .option('--json', 'output as JSON')
    .option('--limit <n>', 'max snapshots to show (default: 20)', parseLimit, 20)
    .action(async (opts: { json?: boolean; limit: number }) => {
      const store = await createStoreFromEnv()
      const snapshots = (await store.list()).slice(0, opts.limit)

      if (opts.json) {
        console.log(JSON.stringify(snapshots, null, 2))
        return
      }

      if (snapshots.length === 0) {
        console.log('No snapshots found.')
        return
      }

      for (const snapshot of snapshots) {
        const triggerStr = typeof snapshot.trigger === 'string' ? snapshot.trigger : JSON.stringify(snapshot.trigger)
        const versionStr = snapshot.openclawVersion ?? 'unknown'
        console.log(
          `${snapshot.id}  ${snapshot.timestamp}  ${triggerStr}  ${versionStr}`,
        )
      }
    })
}
