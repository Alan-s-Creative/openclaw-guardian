import { Command } from 'commander'
import { resolveConfigPath } from './runtime.js'

export function watchCmd() {
  return new Command('watch')
    .description('Start watching OpenClaw config')
    .option('--json', 'output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const configPath = await resolveConfigPath()
      const payload = {
        configPath: configPath ?? 'not found',
        watching: true,
      }

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2))
        return
      }

      console.log('Watching config...')
      console.log(`Config: ${payload.configPath}`)
    })
}
