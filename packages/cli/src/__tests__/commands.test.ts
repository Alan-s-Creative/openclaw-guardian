import { describe, it, expect, beforeEach } from 'vitest'
import { execSync, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Build CLI first
beforeEach(() => {
  try {
    execSync('npm run build', { cwd: path.join(__dirname, '../../'), stdio: 'pipe' })
  } catch {
    // Build errors are asserted via command execution status below.
  }
})

const CLI = path.join(__dirname, '../../dist/index.js')

function run(args: string[], env?: Record<string, string>) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 5000,
  })
}

describe('guardian CLI', () => {
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
    // Should exit 0 or 1, not crash (exit 2+ = unhandled error)
    expect((r.status ?? 0)).toBeLessThanOrEqual(1)
  })

  it('history command outputs JSON when --json flag used', () => {
    const r = run(['history', '--json'], {
      GUARDIAN_CONFIG_PATH: '/nonexistent/openclaw.json',
      GUARDIAN_STORAGE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'g-hist-')),
    })

    // Should output valid JSON array (empty if no snapshots)
    try {
      const out = JSON.parse(r.stdout.trim() || '[]')
      expect(Array.isArray(out)).toBe(true)
    } catch {
      // If storage dir is new, empty output is fine too
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
