import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSnapshotStore } from '../snapshot.js'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('SnapshotStore', () => {
  let tmpDir: string
  let configPath: string
  let store: ReturnType<typeof createSnapshotStore>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-snap-'))
    configPath = path.join(tmpDir, 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({ version: '1.4.2', plugins: { firecrawl: true } }))
    store = createSnapshotStore({ storageDir: path.join(tmpDir, 'snapshots'), configPath })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a snapshot with correct metadata', async () => {
    const snap = await store.create('manual')
    expect(snap.id).toMatch(/^snap_/)
    expect(snap.trigger).toBe('manual')
    expect(snap.configHash).toMatch(/^sha256:/)
    expect(snap.configSnapshot).toMatchObject({ plugins: { firecrawl: true } })
    expect(snap.openclawVersion).toBe('1.4.2')
  })

  it('lists snapshots in reverse chronological order', async () => {
    await store.create('change')
    await new Promise((r) => setTimeout(r, 10))
    await store.create('manual')
    const list = await store.list()
    expect(list.length).toBe(2)
    expect(new Date(list[0].timestamp) > new Date(list[1].timestamp)).toBe(true)
  })

  it('keeps max 20 snapshots (rolling)', async () => {
    for (let i = 0; i < 25; i++) {
      fs.writeFileSync(configPath, JSON.stringify({ version: '1.0', i }))
      await store.create('change')
      await new Promise((r) => setTimeout(r, 5))
    }
    const list = await store.list()
    expect(list.length).toBe(20)
  })

  it('restores config from snapshot', async () => {
    const snap = await store.create('manual')
    fs.writeFileSync(configPath, JSON.stringify({ version: '2.0', broken: true }))
    await store.restore(snap.id)
    const restored = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(restored).toMatchObject({ version: '1.4.2', plugins: { firecrawl: true } })
  })

  it('diff returns unified diff between two snapshots', async () => {
    const snap1 = await store.create('change')
    fs.writeFileSync(configPath, JSON.stringify({ version: '2.0', newKey: 'added' }))
    const snap2 = await store.create('change')
    const diff = await store.diff(snap1.id, snap2.id)
    expect(diff).toContain('1.4.2')
    expect(diff).toContain('2.0')
  })

  it('get returns full snapshot by id', async () => {
    const snap = await store.create('pre-upgrade')
    const got = await store.get(snap.id)
    expect(got).not.toBeNull()
    expect(got!.id).toBe(snap.id)
    expect(got!.trigger).toBe('pre-upgrade')
  })

  it('records diff_summary for config changes', async () => {
    await store.create('change')
    fs.writeFileSync(configPath, JSON.stringify({ version: '2.0', newPlugin: true }))
    const snap2 = await store.create('change')
    expect(snap2.diffSummary.length).toBeGreaterThan(0)
  })
})
