import { Command } from 'commander'
import {
  createWatcher,
  detectPortConflict,
  findAvailablePort,
  GUARDIAN_DEFAULT_PORT,
} from '@openclaw-guardian/core'
import * as readline from 'node:readline'
import { resolveConfigPathOrDefault } from './runtime.js'

interface WatchOptions {
  port: string
  prompt: boolean
  json?: boolean
}

async function promptYN(question: string): Promise<boolean> {
  // non-interactive fallback
  if (!process.stdin.isTTY) return false
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question + ' [Y/n] ', (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() !== 'n')
    })
  })
}

async function promptPort(defaultPort: number): Promise<number> {
  if (!process.stdin.isTTY) return findAvailablePort()
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`Enter port (leave empty to auto-assign): `, async (answer) => {
      rl.close()
      const input = answer.trim()
      if (!input) {
        const auto = await findAvailablePort()
        console.log(`Auto-assigned port: ${auto}`)
        resolve(auto)
      } else {
        const num = Number.parseInt(input, 10)
        if (Number.isNaN(num) || num < 1025 || num > 65535) {
          console.log('Invalid port, auto-assigning...')
          resolve(await findAvailablePort())
        } else {
          resolve(num)
        }
      }
    })
  })
}

function parseEnvPort(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const value = Number.parseInt(raw, 10)
  if (Number.isNaN(value)) return undefined
  return value
}

export function watchCmd() {
  return new Command('watch')
    .description('Start watching OpenClaw config')
    .option('--port <port>', 'daemon port (or "auto")', String(GUARDIAN_DEFAULT_PORT))
    .option('--no-prompt', 'non-interactive, auto-assign port on conflict')
    .option('--json', 'output as JSON')
    .action(async (opts: WatchOptions) => {
      const envPort = parseEnvPort(process.env.GUARDIAN_PORT)
      let preferredPort = envPort
      if (preferredPort === undefined) {
        preferredPort = opts.port === 'auto' ? undefined : parseEnvPort(opts.port)
      }

      const basePort = preferredPort ?? GUARDIAN_DEFAULT_PORT
      const conflict = await detectPortConflict(basePort)
      let finalPort: number

      if (conflict === 'free') {
        finalPort = basePort
      } else if (conflict === 'guardian') {
        if (opts.prompt === false) {
          finalPort = await findAvailablePort()
          console.log(`Guardian already running on port ${basePort}. Auto-assigned: ${finalPort}`)
        } else {
          console.log(`\nGuardian is already running on port ${basePort}.`)
          const runSecond = await promptYN('Start a second instance?')
          if (!runSecond) {
            console.log('Connecting to existing instance...')
            process.exit(0)
          }
          finalPort = await promptPort(basePort)
        }
      } else {
        console.log(`Port ${basePort} is in use by another process. Auto-assigning...`)
        finalPort = await findAvailablePort()
        console.log(`Using port: ${finalPort}`)
      }

      if (opts.json) {
        console.log(JSON.stringify({ status: 'watching', port: finalPort }))
        return
      }

      const configPath = await resolveConfigPathOrDefault()
      console.log(`Watching config on port ${finalPort}...`)
      console.log(`Config: ${configPath}`)

      const watcher = createWatcher({ paths: [configPath] })

      watcher.on('change', (filePath) => {
        console.log(`[change] ${filePath}`)
      })
      watcher.on('corrupt', (filePath) => {
        console.log(`[corrupt] ${filePath}`)
      })
      watcher.on('missing', (filePath) => {
        console.log(`[missing] ${filePath}`)
      })

      await watcher.start()

      // TODO: start HTTP health server in ALA-413 iteration
    })
}
