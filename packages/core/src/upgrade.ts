import { spawnSync } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

const OPENCLAW_NPM_REGISTRY = 'https://registry.npmjs.org/openclaw'

export interface VersionCheckResult {
  current: string
  latest: string
  versions: string[]
  updateAvailable: boolean
}

export interface HealthCheckResult {
  ok: boolean
  reason?: string
  checks: {
    configExists: boolean
    configValid: boolean
    gatewayRunning?: boolean
  }
}

export interface UpgradeOptions {
  targetVersion?: string
  dryRun?: boolean
  checkOnly?: boolean
  force?: boolean
}

export interface UpgradeResult {
  dryRun: boolean
  checkOnly?: boolean
  targetVersion?: string
  previousVersion?: string
  installed: boolean
  updateAvailable?: boolean
  healthCheck?: HealthCheckResult
  error?: string
}

export interface RollbackOptions {
  targetVersion: string
  dryRun?: boolean
}

export interface RollbackResult {
  targetVersion: string
  dryRun: boolean
  success?: boolean
  error?: string
}

interface NpmRegistryResponse {
  'dist-tags'?: {
    latest?: string
  }
  versions?: string[] | Record<string, unknown>
}

interface HealthCheckOptions {
  configPath?: string
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function parseVersion(output: string): string {
  const trimmed = output.trim()
  if (!trimmed) {
    return 'unknown'
  }

  const semverLike = trimmed.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)
  if (semverLike?.[0]) {
    return semverLike[0]
  }

  return trimmed.split(/\r?\n/)[0]?.trim() || 'unknown'
}

function normalizeVersions(versions: NpmRegistryResponse['versions']): string[] {
  if (Array.isArray(versions)) {
    return versions
  }

  if (versions && typeof versions === 'object') {
    return Object.keys(versions)
  }

  return []
}

function resolveConfigPath(configPath?: string): string {
  if (configPath) {
    return configPath
  }

  if (process.env.GUARDIAN_CONFIG_PATH) {
    return process.env.GUARDIAN_CONFIG_PATH
  }

  return path.join(os.homedir(), '.openclaw', 'openclaw.json')
}

export async function getCurrentVersion(): Promise<string> {
  try {
    const result = spawnSync('openclaw', ['--version'], {
      encoding: 'utf-8',
    })

    if (result.status !== 0) {
      return 'unknown'
    }

    return parseVersion(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)
  } catch {
    return 'unknown'
  }
}

export async function checkLatestVersion(currentVersion?: string): Promise<VersionCheckResult> {
  const current = currentVersion ?? (await getCurrentVersion())
  const response = await fetch(OPENCLAW_NPM_REGISTRY)

  if (!response.ok) {
    throw new Error(`Failed to fetch latest version: ${response.status}`)
  }

  const payload = (await response.json()) as NpmRegistryResponse
  const latest = payload['dist-tags']?.latest ?? 'unknown'
  const versions = normalizeVersions(payload.versions)

  return {
    current,
    latest,
    versions,
    updateAvailable: latest !== 'unknown' && latest !== current,
  }
}

export async function healthCheck(options: HealthCheckOptions = {}): Promise<HealthCheckResult> {
  const configPath = resolveConfigPath(options.configPath)
  const configExists = await fileExists(configPath)

  if (!configExists) {
    return {
      ok: false,
      reason: `Config not found: ${configPath}`,
      checks: {
        configExists: false,
        configValid: false,
      },
    }
  }

  try {
    const raw = await readFile(configPath, 'utf-8')
    JSON.parse(raw)

    return {
      ok: true,
      checks: {
        configExists: true,
        configValid: true,
      },
    }
  } catch {
    return {
      ok: false,
      reason: `Invalid JSON config: ${configPath}`,
      checks: {
        configExists: true,
        configValid: false,
      },
    }
  }
}

export async function performUpgrade(options: UpgradeOptions = {}): Promise<UpgradeResult> {
  const previousVersion = await getCurrentVersion()
  const latestInfo = await checkLatestVersion(previousVersion)
  const targetVersion = options.targetVersion ?? latestInfo.latest
  const dryRun = Boolean(options.dryRun)

  if (dryRun) {
    return {
      dryRun: true,
      targetVersion,
      previousVersion,
      installed: false,
      updateAvailable: latestInfo.updateAvailable,
    }
  }

  if (options.checkOnly) {
    return {
      dryRun: false,
      checkOnly: true,
      targetVersion,
      previousVersion,
      installed: false,
      updateAvailable: latestInfo.updateAvailable,
    }
  }

  if (!options.force && !latestInfo.updateAvailable && !options.targetVersion) {
    return {
      dryRun: false,
      targetVersion,
      previousVersion,
      installed: false,
      updateAvailable: false,
    }
  }

  const install = spawnSync('npm', ['install', '-g', `openclaw@${targetVersion}`], {
    encoding: 'utf-8',
  })

  if (install.status !== 0) {
    return {
      dryRun: false,
      targetVersion,
      previousVersion,
      installed: false,
      updateAvailable: latestInfo.updateAvailable,
      error: (install.stderr || install.stdout || 'Upgrade failed').toString().trim(),
    }
  }

  const postHealthCheck = await healthCheck()

  return {
    dryRun: false,
    targetVersion,
    previousVersion,
    installed: true,
    updateAvailable: latestInfo.updateAvailable,
    healthCheck: postHealthCheck,
    error: postHealthCheck.ok ? undefined : postHealthCheck.reason,
  }
}

export async function rollbackUpgrade(options: RollbackOptions): Promise<RollbackResult> {
  if (options.dryRun) {
    return {
      targetVersion: options.targetVersion,
      dryRun: true,
    }
  }

  const install = spawnSync('npm', ['install', '-g', `openclaw@${options.targetVersion}`], {
    encoding: 'utf-8',
  })

  if (install.status !== 0) {
    return {
      targetVersion: options.targetVersion,
      dryRun: false,
      success: false,
      error: (install.stderr || install.stdout || 'Rollback failed').toString().trim(),
    }
  }

  return {
    targetVersion: options.targetVersion,
    dryRun: false,
    success: true,
  }
}
