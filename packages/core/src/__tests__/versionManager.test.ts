import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  listAvailableVersions,
  switchVersion,
  rollbackToVersion,
  getVersionHistory,
  detectMajorVersionJump,
  type VersionInfo,
  type SwitchResult,
} from '../versionManager.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '2026.3.2\n', stderr: '' })),
  execFileSync: vi.fn(),
}))

const mockNpmVersions = (versions: string[], latest: string) => ({
  ok: true,
  json: async () => ({
    'dist-tags': { latest },
    versions: Object.fromEntries(versions.map(v => [v, {}])),
  }),
})

describe('listAvailableVersions', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns list of versions from npm', async () => {
    mockFetch.mockResolvedValue(mockNpmVersions(['1.0.0', '1.1.0', '2.0.0'], '2.0.0'))
    const result = await listAvailableVersions()
    expect(result.versions.length).toBeGreaterThan(0)
    expect(result.latest).toBe('2.0.0')
  })

  it('marks current version correctly', async () => {
    mockFetch.mockResolvedValue(mockNpmVersions(['1.0.0', '2.0.0'], '2.0.0'))
    const result = await listAvailableVersions('1.0.0')
    const current = result.versions.find(v => v.isCurrent)
    expect(current?.version).toBe('1.0.0')
  })

  it('marks latest version correctly', async () => {
    mockFetch.mockResolvedValue(mockNpmVersions(['1.0.0', '2.0.0'], '2.0.0'))
    const result = await listAvailableVersions()
    const latest = result.versions.find(v => v.isLatest)
    expect(latest?.version).toBe('2.0.0')
  })

  it('throws on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    await expect(listAvailableVersions()).rejects.toThrow()
  })
})

describe('detectMajorVersionJump', () => {
  it('detects major version jump', () => {
    expect(detectMajorVersionJump('1.0.0', '3.0.0')).toBe(true)
    expect(detectMajorVersionJump('1.5.0', '2.0.0')).toBe(true)
  })

  it('returns false for minor/patch changes', () => {
    expect(detectMajorVersionJump('1.0.0', '1.5.0')).toBe(false)
    expect(detectMajorVersionJump('1.0.0', '1.0.5')).toBe(false)
  })

  it('handles non-semver versions gracefully', () => {
    // OpenClaw uses YYYY.M.D format
    expect(typeof detectMajorVersionJump('2025.1.1', '2026.3.2')).toBe('boolean')
  })
})

describe('switchVersion', () => {
  it('dry-run returns version info without installing', async () => {
    const result = await switchVersion('1.0.0', { dryRun: true })
    expect(result.dryRun).toBe(true)
    expect(result.targetVersion).toBe('1.0.0')
    expect(result.installed).toBe(false)
  })

  it('returns warning on major version jump', async () => {
    const result = await switchVersion('3.0.0', {
      dryRun: true,
      currentVersion: '1.0.0',
    })
    expect(result.majorVersionJump).toBe(true)
    expect(result.warning).toBeDefined()
  })
})

describe('getVersionHistory', () => {
  it('returns version history from storage', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g-vh-'))
    const historyFile = path.join(tmpDir, 'version-history.json')
    fs.writeFileSync(historyFile, JSON.stringify([
      { version: '1.0.0', installedAt: '2026-01-01T00:00:00Z' },
      { version: '2.0.0', installedAt: '2026-03-01T00:00:00Z' },
    ]))
    const history = await getVersionHistory(tmpDir)
    expect(history.length).toBe(2)
    expect(history[0].version).toBeDefined()
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('returns empty array when no history file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g-vh-empty-'))
    const history = await getVersionHistory(tmpDir)
    expect(history).toEqual([])
    fs.rmSync(tmpDir, { recursive: true })
  })
})

describe('rollbackToVersion', () => {
  it('dry-run returns rollback plan', async () => {
    const result = await rollbackToVersion('1.0.0', { dryRun: true })
    expect(result.targetVersion).toBe('1.0.0')
    expect(result.dryRun).toBe(true)
    expect(result.installed).toBe(false)
  })
})
