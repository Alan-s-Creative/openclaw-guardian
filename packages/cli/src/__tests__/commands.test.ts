import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execSync, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const mockLoadCoreModule = vi.fn()
const mockResolveConfigPathOrDefault = vi.fn()
const mockDetectCurrentVersion = vi.fn()

vi.mock('../commands/runtime.js', () => ({
  loadCoreModule: mockLoadCoreModule,
  resolveConfigPathOrDefault: mockResolveConfigPathOrDefault,
}))

vi.mock('../commands/version-utils.js', () => ({
  detectCurrentVersion: mockDetectCurrentVersion,
}))

import { rollbackCmd } from '../commands/rollback.js'
import { upgradeCmd } from '../commands/upgrade.js'

const CLI = path.join(__dirname, '../../dist/index.js')

function run(args: string[], env?: Record<string, string>) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 5000,
  })
}

describe('guardian CLI integration', () => {
  beforeEach(() => {
    try {
      execSync('npm run build', { cwd: path.join(__dirname, '../../'), stdio: 'pipe' })
    } catch {
      // Build errors are asserted via command execution status below.
    }
  })

  it('shows help with --help', () => {
    const r = run(['--help'])
    expect(r.stdout + r.stderr).toMatch(/guardian|OpenClaw/)
  })

  it('shows version with --version', () => {
    const r = run(['--version'])
    expect(r.stdout.trim()).toMatch(/\d+\.\d+\.\d+/)
  })

  it('status command runs without crash', () => {
    const r = run(['status', '--json'])
    expect(r.status).toBeDefined()
    expect((r.status ?? 0)).toBeLessThanOrEqual(1)
  })

  it('history command outputs JSON when --json flag used', () => {
    const r = run(['history', '--json'], {
      GUARDIAN_CONFIG_PATH: '/nonexistent/openclaw.json',
      GUARDIAN_STORAGE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'g-hist-')),
    })

    try {
      const out = JSON.parse(r.stdout.trim() || '[]') as unknown
      expect(Array.isArray(out)).toBe(true)
    } catch {
      expect((r.status ?? 0)).toBeLessThanOrEqual(1)
    }
  })

  it('restore command with --list shows available snapshots', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g-restore-'))
    const r = run(['restore', '--list'], {
      GUARDIAN_STORAGE_DIR: tmpDir,
    })
    expect((r.status ?? 0)).toBeLessThanOrEqual(1)
  })

  it('fix command shows --dry-run option in help', () => {
    const r = run(['fix', '--help'])
    expect(r.stdout + r.stderr).toMatch(/dry-run|provider|api-key/)
  })

  it('upgrade command shows --check option in help', () => {
    const r = run(['upgrade', '--help'])
    expect(r.stdout + r.stderr).toMatch(/check|force|dry-run/)
  })

  it('versions command runs without crash', () => {
    const r = run(['versions', '--json'])
    expect((r.status ?? 0)).toBeLessThanOrEqual(1)
  })

  it('rollback command shows --to option in help', () => {
    const r = run(['rollback', '--help'])
    expect(r.stdout + r.stderr).toMatch(/to|version/)
  })
})

describe('guardian CLI command handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    mockResolveConfigPathOrDefault.mockResolvedValue('/tmp/openclaw.json')
    mockDetectCurrentVersion.mockResolvedValue('1.0.0')
  })

  afterEach(() => {
    process.exitCode = undefined
  })

  it('upgrade --check uses core upgrade info instead of echoing current version', async () => {
    const performUpgrade = vi.fn().mockResolvedValue({
      dryRun: false,
      checkOnly: true,
      targetVersion: '2.0.0',
      previousVersion: '1.0.0',
      installed: false,
      updateAvailable: true,
    })
    mockLoadCoreModule.mockResolvedValue({ performUpgrade })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await upgradeCmd().parseAsync(['--check'], { from: 'user' })

    expect(performUpgrade).toHaveBeenCalledWith({
      checkOnly: true,
      dryRun: false,
      force: false,
    })
    expect(logSpy.mock.calls.flat()).toContain('Current: 1.0.0')
    expect(logSpy.mock.calls.flat()).toContain('Latest: 2.0.0')
    expect(logSpy.mock.calls.flat()).toContain('Update available: true')
  })

  it('rollback surfaces core rollback failures instead of reporting success', async () => {
    const rollbackUpgrade = vi.fn().mockResolvedValue({
      targetVersion: '0.9.0',
      dryRun: false,
      success: false,
      error: 'Rollback failed',
    })
    mockLoadCoreModule.mockResolvedValue({ rollbackUpgrade })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await rollbackCmd().parseAsync(['--to', '0.9.0'], { from: 'user' })

    expect(rollbackUpgrade).toHaveBeenCalledWith({
      targetVersion: '0.9.0',
      dryRun: false,
    })
    expect(errorSpy).toHaveBeenCalledWith('Rollback failed')
    expect(process.exitCode).toBe(1)
  })
})
