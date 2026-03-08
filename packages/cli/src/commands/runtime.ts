import { access, readFile, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), 'openclaw.json')
const CORE_MODULE = '@openclaw-guardian/core'

interface SnapshotRecord {
  id: string
  timestamp: string
  trigger: string
  openclawVersion?: string
  [key: string]: unknown
}

interface SnapshotStoreLike {
  list: () => Promise<SnapshotRecord[]>
  restore: (id: string) => Promise<void>
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function loadCoreModule(): Promise<Record<string, unknown> | null> {
  try {
    const specifier = CORE_MODULE
    return (await import(specifier)) as Record<string, unknown>
  } catch {
    return null
  }
}

function getFallbackCandidates(): string[] {
  const home = os.homedir()
  return [
    path.join(home, '.openclaw', 'openclaw.json'),
    path.join(home, 'Library', 'Application Support', 'openclaw', 'openclaw.json'),
  ]
}

async function readSnapshotsFromStorage(storageDir: string): Promise<SnapshotRecord[]> {
  const indexPath = path.join(storageDir, 'index.json')
  try {
    const raw = await readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown

    // Support both formats: array of objects or { ids: string[] }
    if (Array.isArray(parsed)) {
      return (parsed as SnapshotRecord[])
        .filter((r): r is SnapshotRecord => r !== null && typeof r === 'object' && 'id' in r)
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    }

    const obj = parsed as { ids?: unknown }
    const ids = Array.isArray(obj.ids)
      ? obj.ids.filter((id): id is string => typeof id === 'string')
      : []

    const records = await Promise.all(
      ids.map(async (id) => {
        try {
          const raw = await readFile(path.join(storageDir, `${id}.json`), 'utf-8')
          return JSON.parse(raw) as SnapshotRecord
        } catch {
          return null
        }
      }),
    )

    return records
      .filter((record): record is SnapshotRecord => record !== null)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
  } catch {
    return []
  }
}

function createFallbackStore(storageDir: string, configPath: string): SnapshotStoreLike {
  return {
    list: async () => readSnapshotsFromStorage(storageDir),
    restore: async (id: string) => {
      const snapshots = await readSnapshotsFromStorage(storageDir)
      const target = snapshots.find((snapshot) => snapshot.id === id)
      if (!target) {
        throw new Error(`Snapshot not found: ${id}`)
      }

      const snapshotValue = target.configSnapshot
      const content =
        typeof snapshotValue === 'string'
          ? snapshotValue
          : `${JSON.stringify(snapshotValue ?? {}, null, 2)}\n`
      await writeFile(configPath, content, 'utf-8')
    },
  }
}

export function resolveStorageDir(): string {
  const configuredStorageDir = process.env.GUARDIAN_STORAGE_DIR?.trim()
  if (configuredStorageDir) {
    return configuredStorageDir
  }

  return path.join(os.homedir(), '.guardian', 'snapshots')
}

export async function resolveConfigPath(): Promise<string | null> {
  const configuredPath = process.env.GUARDIAN_CONFIG_PATH?.trim()
  if (configuredPath) {
    return configuredPath
  }

  const core = await loadCoreModule()
  if (core && typeof core.detectConfigPath === 'function') {
    const detected = (await core.detectConfigPath()) as string | null
    return detected
  }

  const candidates = getFallbackCandidates()
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }

  return null
}

export async function resolveConfigPathOrDefault(): Promise<string> {
  const configPath = await resolveConfigPath()
  return configPath ?? DEFAULT_CONFIG_PATH
}

export async function createStoreFromEnv() {
  const storageDir = resolveStorageDir()
  const configPath = await resolveConfigPathOrDefault()
  const core = await loadCoreModule()

  if (core && typeof core.createSnapshotStore === 'function') {
    return core.createSnapshotStore({
      storageDir,
      configPath,
    }) as SnapshotStoreLike
  }

  return createFallbackStore(storageDir, configPath)
}
