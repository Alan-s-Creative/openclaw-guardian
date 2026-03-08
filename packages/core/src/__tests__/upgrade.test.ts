import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  checkLatestVersion,
  getCurrentVersion,
  performUpgrade,
  rollbackUpgrade,
  healthCheck,
  type UpgradeOptions,
  type UpgradeResult,
} from '../upgrade.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, stdout: '2026.3.2\n', stderr: '' })),
}))

const mockNpmResponse = (versions: string[], latest: string) => ({
  ok: true,
  json: async () => ({ 'dist-tags': { latest }, versions }),
})

describe('checkLatestVersion', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns latest version from npm registry', async () => {
    mockFetch.mockResolvedValue(mockNpmResponse(['1.0.0', '1.1.0', '2.0.0'], '2.0.0'))
    const result = await checkLatestVersion()
    expect(result.latest).toBe('2.0.0')
    expect(result.versions).toContain('1.0.0')
  })

  it('indicates if update is available', async () => {
    mockFetch.mockResolvedValue(mockNpmResponse(['1.0.0', '2.0.0'], '2.0.0'))
    const result = await checkLatestVersion('1.0.0')
    expect(result.updateAvailable).toBe(true)
  })

  it('indicates no update when already on latest', async () => {
    mockFetch.mockResolvedValue(mockNpmResponse(['2.0.0'], '2.0.0'))
    const result = await checkLatestVersion('2.0.0')
    expect(result.updateAvailable).toBe(false)
  })

  it('throws on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    await expect(checkLatestVersion()).rejects.toThrow('Network error')
  })
})

describe('getCurrentVersion', () => {
  it('returns a version string', async () => {
    const ver = await getCurrentVersion()
    expect(typeof ver).toBe('string')
    expect(ver.length).toBeGreaterThan(0)
  })
})

describe('healthCheck', () => {
  it('returns ok:false when config path does not exist', async () => {
    const result = await healthCheck({ configPath: '/nonexistent/openclaw.json' })
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('returns ok:true when config is valid JSON and exists', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-hc-'))
    const configPath = path.join(tmpDir, 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({ version: '1.0' }))
    const result = await healthCheck({ configPath })
    expect(result.ok).toBe(true)
    fs.rmSync(tmpDir, { recursive: true })
  })
})

describe('performUpgrade', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns dry-run result without installing', async () => {
    mockFetch.mockResolvedValue(mockNpmResponse(['1.0.0', '2.0.0'], '2.0.0'))
    const result = await performUpgrade({ dryRun: true, targetVersion: '2.0.0' })
    expect(result.dryRun).toBe(true)
    expect(result.targetVersion).toBe('2.0.0')
    expect(result.installed).toBe(false)
  })

  it('check-only mode returns version info without installing', async () => {
    mockFetch.mockResolvedValue(mockNpmResponse(['1.0.0', '2.0.0'], '2.0.0'))
    const result = await performUpgrade({ checkOnly: true })
    expect(result.updateAvailable).toBeDefined()
    expect(result.installed).toBe(false)
  })
})

describe('rollbackUpgrade', () => {
  it('returns dry-run rollback info', async () => {
    const result = await rollbackUpgrade({ targetVersion: '1.0.0', dryRun: true })
    expect(result.targetVersion).toBe('1.0.0')
    expect(result.dryRun).toBe(true)
  })
})

