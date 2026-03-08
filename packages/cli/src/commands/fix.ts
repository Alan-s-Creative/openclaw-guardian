import { Command } from 'commander'
import { readFile, writeFile } from 'node:fs/promises'
import { resolveConfigPath } from './runtime.js'

type Provider = 'openai' | 'anthropic'
const CORE_MODULE = '@openclaw-guardian/core'

interface FixConfigResult {
  diagnosis: string
  fixedConfig: unknown | null
  diffPatch?: string
}

type FixConfigFn = (
  brokenConfig: string,
  errorLog: string,
  llmConfig: { provider: Provider; apiKey: string },
  options?: { dryRun?: boolean },
) => Promise<FixConfigResult>

function getApiKey(provider: Provider, cliApiKey?: string): string {
  if (cliApiKey?.trim()) {
    return cliApiKey.trim()
  }
  if (provider === 'openai') {
    return process.env.OPENAI_API_KEY?.trim() ?? ''
  }
  return process.env.ANTHROPIC_API_KEY?.trim() ?? ''
}

function serializeConfig(value: unknown): string {
  if (typeof value === 'string') {
    return value.endsWith('\n') ? value : `${value}\n`
  }
  return `${JSON.stringify(value, null, 2)}\n`
}

async function loadFixConfig(): Promise<FixConfigFn | null> {
  try {
    const specifier = CORE_MODULE
    const core = (await import(specifier)) as { fixConfig?: unknown }
    return typeof core.fixConfig === 'function' ? (core.fixConfig as FixConfigFn) : null
  } catch {
    return null
  }
}

export function fixCmd() {
  return new Command('fix')
    .description('Diagnose and fix config with LLM')
    .option('--provider <provider>', 'LLM provider: openai|anthropic', 'openai')
    .option('--api-key <key>', 'API key for chosen provider')
    .option('--dry-run', 'show patch without writing config')
    .action(
      async (opts: { provider: Provider; apiKey?: string; dryRun?: boolean }): Promise<void> => {
        const fixConfig = await loadFixConfig()
        if (!fixConfig) {
          console.error('Fix engine unavailable. Build @openclaw-guardian/core first.')
          process.exitCode = 1
          return
        }

        const provider = opts.provider === 'anthropic' ? 'anthropic' : 'openai'
        const apiKey = getApiKey(provider, opts.apiKey)
        const configPath = await resolveConfigPath()

        if (!configPath) {
          console.error('OpenClaw config not found. Set GUARDIAN_CONFIG_PATH to continue.')
          process.exitCode = 1
          return
        }

        if (!apiKey) {
          console.error(`Missing API key. Pass --api-key or set ${provider.toUpperCase()}_API_KEY.`)
          process.exitCode = 1
          return
        }

        const brokenConfig = await readFile(configPath, 'utf-8')
        const result = await fixConfig(
          brokenConfig,
          'Manual guardian fix command request',
          {
            provider,
            apiKey,
          },
          { dryRun: Boolean(opts.dryRun) },
        )

        console.log(result.diagnosis)
        if (result.diffPatch) {
          console.log(result.diffPatch)
        }

        if (result.fixedConfig === null) {
          console.log('No machine-readable fix returned.')
          return
        }

        if (!opts.dryRun) {
          await writeFile(configPath, serializeConfig(result.fixedConfig), 'utf-8')
          console.log(`Updated config: ${configPath}`)
        }
      },
    )
}
