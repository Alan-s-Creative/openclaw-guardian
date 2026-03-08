import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import * as path from 'node:path'

export interface VersionInfo {
  version: string
  isCurrent: boolean
  isLatest: boolean
  publishedAt?: string
}

export interface VersionListResult {
  versions: VersionInfo[]
  current: string
  latest: string
}

export interface SwitchOptions {
  dryRun?: boolean
  currentVersion?: string
  force?: boolean
}

export interface SwitchResult {
  targetVersion: string
  previousVersion?: string
  dryRun: boolean
  installed: boolean
  majorVersionJump: boolean
  warning?: string
  error?: string
}

export interface VersionHistoryEntry {
  version: string
  installedAt: string
}

export interface RollbackOptions {
  dryRun?: boolean
}

export interface RollbackResult {
  targetVersion: string
  dryRun: boolean
  installed: boolean
  error?: string
}

interface NpmRegistryResponse {
  'dist-tags'?: {
    latest?: string
  }
  versions?: Record<string, unknown>
}

function parseMajor(version: string): number | null {
  const [majorPart] = version.trim().split('.')
  const parsed = Number.parseInt(majorPart ?? '', 10)
  return Number.isNaN(parsed) ? null : parsed
}

function compareVersionsDesc(a: string, b: string): number {
  const partsA = a.split('.').map(part => Number.parseInt(part, 10) || 0)
  const partsB = b.split('.').map(part => Number.parseInt(part, 10) || 0)
  const maxLength = Math.max(partsA.length, partsB.length)

  for (let idx = 0; idx < maxLength; idx += 1) {
    const diff = (partsB[idx] ?? 0) - (partsA[idx] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }

  return 0
}

export async function listAvailableVersions(currentVersion = ''): Promise<VersionListResult> {
  const response = await fetch('https://registry.npmjs.org/openclaw')
  if (!response.ok) {
    throw new Error(`Failed to fetch versions: ${response.status}`)
  }

  const payload = (await response.json()) as NpmRegistryResponse
  const latest = payload['dist-tags']?.latest ?? ''
  const versions = Object.keys(payload.versions ?? {}).sort(compareVersionsDesc)

  return {
    versions: versions.map(version => ({
      version,
      isCurrent: version === currentVersion,
      isLatest: version === latest,
    })),
    current: currentVersion,
    latest,
  }
}

export function detectMajorVersionJump(from: string, to: string): boolean {
  const fromMajor = parseMajor(from)
  const toMajor = parseMajor(to)

  if (fromMajor === null || toMajor === null) {
    return false
  }

  return toMajor - fromMajor >= 1
}

export async function switchVersion(targetVersion: string, options: SwitchOptions = {}): Promise<SwitchResult> {
  const dryRun = options.dryRun ?? false
  const previousVersion = options.currentVersion
  const majorVersionJump = previousVersion
    ? detectMajorVersionJump(previousVersion, targetVersion)
    : false
  const warning = majorVersionJump
    ? `Potential breaking changes: major version jump from ${previousVersion} to ${targetVersion}.`
    : undefined

  if (dryRun) {
    return {
      targetVersion,
      previousVersion,
      dryRun: true,
      installed: false,
      majorVersionJump,
      warning,
    }
  }

  const install = spawnSync('npm', ['install', '-g', `openclaw@${targetVersion}`], {
    encoding: 'utf-8',
  })

  if (install.status !== 0) {
    return {
      targetVersion,
      previousVersion,
      dryRun: false,
      installed: false,
      majorVersionJump,
      warning,
      error: (install.stderr || install.stdout || 'Failed to install target version').trim(),
    }
  }

  return {
    targetVersion,
    previousVersion,
    dryRun: false,
    installed: true,
    majorVersionJump,
    warning,
  }
}

export async function getVersionHistory(storageDir: string): Promise<VersionHistoryEntry[]> {
  const historyPath = path.join(storageDir, 'version-history.json')

  try {
    const raw = await readFile(historyPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((entry): entry is VersionHistoryEntry => (
      typeof entry === 'object'
      && entry !== null
      && typeof (entry as VersionHistoryEntry).version === 'string'
      && typeof (entry as VersionHistoryEntry).installedAt === 'string'
    ))
  } catch {
    return []
  }
}

export async function rollbackToVersion(targetVersion: string, options: RollbackOptions = {}): Promise<RollbackResult> {
  const dryRun = options.dryRun ?? false

  if (dryRun) {
    return {
      targetVersion,
      dryRun: true,
      installed: false,
    }
  }

  const install = spawnSync('npm', ['install', '-g', `openclaw@${targetVersion}`], {
    encoding: 'utf-8',
  })

  if (install.status !== 0) {
    return {
      targetVersion,
      dryRun: false,
      installed: false,
      error: (install.stderr || install.stdout || 'Failed to rollback version').trim(),
    }
  }

  return {
    targetVersion,
    dryRun: false,
    installed: true,
  }
}
