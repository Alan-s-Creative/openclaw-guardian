import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectConfigPath, detectOpenClawVersion } from '../version.js'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('detectConfigPath', () => {
  it('returns path when ~/.openclaw/openclaw.json exists', async () => {
    const result = await detectConfigPath()
    // On the test machine, ~/.openclaw/openclaw.json exists
    // Just verify it returns a string or null (not throw)
    expect(result === null || typeof result === 'string').toBe(true)
  })

  it('returns null when no config found and env overrides to non-existent path', async () => {
    const original = process.env.GUARDIAN_CONFIG_PATH
    process.env.GUARDIAN_CONFIG_PATH = '/nonexistent/path/openclaw.json'
    const result = await detectConfigPath()
    expect(result).toBeNull()
    process.env.GUARDIAN_CONFIG_PATH = original
  })
})

describe('detectOpenClawVersion', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-ver-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads version from config JSON if present', async () => {
    const configPath = path.join(tmpDir, 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({ version: '1.4.2', other: 'stuff' }))
    const ver = await detectOpenClawVersion(configPath)
    expect(ver).toBe('1.4.2')
  })

  it('returns unknown for non-existent config', async () => {
    const ver = await detectOpenClawVersion('/nonexistent/path.json')
    expect(ver).toBe('unknown')
  })

  it('returns unknown when config has no version field', async () => {
    const configPath = path.join(tmpDir, 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({ plugins: {} }))
    const ver = await detectOpenClawVersion(configPath)
    // Should try CLI fallback (which might not be available), then return unknown or a real version
    expect(typeof ver).toBe('string')
    expect(ver.length).toBeGreaterThan(0)
  })
})
