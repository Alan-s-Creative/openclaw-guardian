import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { detectOpenClawVersion } from './version.js'

export type SnapshotTrigger = 'change' | 'corrupt' | 'manual' | 'pre-upgrade'

export interface Snapshot {
  id: string
  timestamp: string
  openclawVersion: string
  trigger: SnapshotTrigger
  configHash: string
  diffSummary: string
  diffPatch: string
  configSnapshot: unknown
}

export interface SnapshotStoreConfig {
  storageDir: string
  configPath: string
  maxSnapshots?: number
}

export interface SnapshotStore {
  create: (trigger: SnapshotTrigger) => Promise<Snapshot>
  list: () => Promise<Snapshot[]>
  get: (id: string) => Promise<Snapshot | null>
  restore: (id: string) => Promise<void>
  diff: (id1: string, id2: string) => Promise<string>
}

interface StoredIndex {
  ids: string[]
}

const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9._-]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidSnapshotId(id: string): boolean {
  return SNAPSHOT_ID_PATTERN.test(id)
}

function toStableJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value)
  }
  return JSON.stringify(value)
}

function createUnifiedDiff(before: unknown, after: unknown, id1: string, id2: string): string {
  const beforeLines = toStableJson(before).split('\n')
  const afterLines = toStableJson(after).split('\n')
  const maxLines = Math.max(beforeLines.length, afterLines.length)
  const lines: string[] = [
    `--- ${id1}`,
    `+++ ${id2}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
  ]

  for (let i = 0; i < maxLines; i++) {
    const beforeLine = beforeLines[i]
    const afterLine = afterLines[i]
    if (beforeLine === afterLine) {
      if (beforeLine !== undefined) {
        lines.push(` ${beforeLine}`)
      }
      continue
    }
    if (beforeLine !== undefined) {
      lines.push(`-${beforeLine}`)
    }
    if (afterLine !== undefined) {
      lines.push(`+${afterLine}`)
    }
  }

  return lines.join('\n')
}

function summarizeDiff(previous: unknown, current: unknown): string {
  if (!isRecord(previous) || !isRecord(current)) {
    return previous === current
      ? 'No key-level changes.'
      : `Changed root value (${formatValue(previous)} → ${formatValue(current)})`
  }

  const previousKeys = new Set(Object.keys(previous))
  const currentKeys = new Set(Object.keys(current))

  const added = [...currentKeys].filter((key) => !previousKeys.has(key)).sort()
  const removed = [...previousKeys].filter((key) => !currentKeys.has(key)).sort()

  const changed = [...currentKeys]
    .filter((key) => previousKeys.has(key))
    .filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(current[key]))
    .sort()
    .map((key) => `${key} (${formatValue(previous[key])} → ${formatValue(current[key])})`)

  const parts: string[] = []
  if (added.length > 0) {
    parts.push(`Added: ${added.join(', ')}.`)
  }
  if (removed.length > 0) {
    parts.push(`Removed: ${removed.join(', ')}.`)
  }
  if (changed.length > 0) {
    parts.push(`Changed: ${changed.join(', ')}.`)
  }

  return parts.length > 0 ? parts.join(' ') : 'No key-level changes.'
}

export function createSnapshotStore(config: SnapshotStoreConfig): SnapshotStore {
  const { storageDir, configPath } = config
  const maxSnapshots = config.maxSnapshots ?? 20
  const indexPath = path.join(storageDir, 'index.json')
  let writeQueue = Promise.resolve()

  const snapshotPath = (id: string): string => {
    if (!isValidSnapshotId(id)) {
      throw new Error(`Invalid snapshot id: ${id}`)
    }

    return path.join(storageDir, `${id}.json`)
  }

  const runExclusive = async <T>(operation: () => Promise<T>): Promise<T> => {
    const run = writeQueue.then(operation, operation)
    writeQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  const ensureStorage = async (): Promise<void> => {
    await fs.mkdir(storageDir, { recursive: true })
  }

  const readIndex = async (): Promise<StoredIndex> => {
    await ensureStorage()
    try {
      const raw = await fs.readFile(indexPath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<StoredIndex>
      if (Array.isArray(parsed.ids)) {
        return { ids: parsed.ids.filter((id): id is string => typeof id === 'string') }
      }
    } catch {
      // Return default index if missing/corrupt.
    }
    return { ids: [] }
  }

  const writeIndex = async (index: StoredIndex): Promise<void> => {
    await ensureStorage()
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
  }

  const readSnapshot = async (id: string): Promise<Snapshot | null> => {
    try {
      const raw = await fs.readFile(snapshotPath(id), 'utf-8')
      return JSON.parse(raw) as Snapshot
    } catch {
      return null
    }
  }

  const writeSnapshot = async (snapshot: Snapshot): Promise<void> => {
    await ensureStorage()
    await fs.writeFile(snapshotPath(snapshot.id), JSON.stringify(snapshot, null, 2), 'utf-8')
  }

  const removeSnapshotFile = async (id: string): Promise<void> => {
    try {
      await fs.unlink(snapshotPath(id))
    } catch {
      // Ignore missing files during cleanup.
    }
  }

  const getLatestSnapshot = async (): Promise<Snapshot | null> => {
    const index = await readIndex()
    const latestId = index.ids[index.ids.length - 1]
    if (!latestId) {
      return null
    }
    return readSnapshot(latestId)
  }

  const readCurrentConfig = async (): Promise<{ raw: string; parsed: unknown }> => {
    const raw = await fs.readFile(configPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    return { raw, parsed }
  }

  return {
    create: async (trigger: SnapshotTrigger): Promise<Snapshot> => {
      return runExclusive(async () => {
        const { raw, parsed } = await readCurrentConfig()
        const previous = await getLatestSnapshot()
        const id = `snap_${Date.now()}_${randomUUID().slice(0, 8)}`
        const timestamp = new Date().toISOString()
        const configHash = `sha256:${createHash('sha256').update(raw).digest('hex')}`
        const openclawVersion = await detectOpenClawVersion(configPath)
        const diffPatch = previous
          ? createUnifiedDiff(previous.configSnapshot, parsed, previous.id, id)
          : ''
        const diffSummary = previous ? summarizeDiff(previous.configSnapshot, parsed) : 'First snapshot'

        const snapshot: Snapshot = {
          id,
          timestamp,
          openclawVersion,
          trigger,
          configHash,
          diffSummary,
          diffPatch,
          configSnapshot: parsed,
        }

        await writeSnapshot(snapshot)

        const index = await readIndex()
        index.ids.push(id)
        while (index.ids.length > maxSnapshots) {
          const removedId = index.ids.shift()
          if (removedId) {
            await removeSnapshotFile(removedId)
          }
        }
        await writeIndex(index)

        return snapshot
      })
    },

    list: async (): Promise<Snapshot[]> => {
      const index = await readIndex()
      const snapshots = await Promise.all(index.ids.map((id) => readSnapshot(id)))
      return snapshots
        .filter((snapshot): snapshot is Snapshot => snapshot !== null)
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    },

    get: async (id: string): Promise<Snapshot | null> => {
      return readSnapshot(id)
    },

    restore: async (id: string): Promise<void> => {
      const snapshot = await readSnapshot(id)
      if (!snapshot) {
        throw new Error(`Snapshot not found: ${id}`)
      }
      const content =
        typeof snapshot.configSnapshot === 'string'
          ? snapshot.configSnapshot
          : `${JSON.stringify(snapshot.configSnapshot, null, 2)}\n`
      await fs.writeFile(configPath, content, 'utf-8')
    },

    diff: async (id1: string, id2: string): Promise<string> => {
      const [snap1, snap2] = await Promise.all([readSnapshot(id1), readSnapshot(id2)])
      if (!snap1 || !snap2) {
        throw new Error(`Snapshot not found for diff: ${!snap1 ? id1 : id2}`)
      }
      return createUnifiedDiff(snap1.configSnapshot, snap2.configSnapshot, id1, id2)
    },
  }
}

export const snapshotStore = createSnapshotStore({
  storageDir: path.join(process.cwd(), '.guardian', 'snapshots'),
  configPath: path.join(process.cwd(), 'openclaw.json'),
})
