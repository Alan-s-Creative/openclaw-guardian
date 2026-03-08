import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createWatcher } from '../watcher.js'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('createWatcher', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('emits change event when file is modified', async () => {
    const configPath = path.join(tmpDir, 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({ version: '1.0' }))

    const watcher = createWatcher({ paths: [configPath], debounceMs: 50 })
    const changeHandler = vi.fn()
    watcher.on('change', changeHandler)
    await watcher.start()

    await new Promise((r) => setTimeout(r, 100))
    fs.writeFileSync(configPath, JSON.stringify({ version: '2.0' }))
    await new Promise((r) => setTimeout(r, 200))

    await watcher.stop()
    expect(changeHandler).toHaveBeenCalledWith(configPath)
  })

  it('emits corrupt event when file contains invalid JSON', async () => {
    const configPath = path.join(tmpDir, 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({ version: '1.0' }))

    const watcher = createWatcher({ paths: [configPath], debounceMs: 50 })
    const corruptHandler = vi.fn()
    watcher.on('corrupt', corruptHandler)
    await watcher.start()

    await new Promise((r) => setTimeout(r, 100))
    fs.writeFileSync(configPath, '{ invalid json !!!')
    await new Promise((r) => setTimeout(r, 200))

    await watcher.stop()
    expect(corruptHandler).toHaveBeenCalledWith(configPath)
  })

  it('emits missing event when file is deleted', async () => {
    const configPath = path.join(tmpDir, 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({ version: '1.0' }))

    const watcher = createWatcher({ paths: [configPath], debounceMs: 50 })
    const missingHandler = vi.fn()
    watcher.on('missing', missingHandler)
    await watcher.start()

    await new Promise((r) => setTimeout(r, 100))
    fs.unlinkSync(configPath)
    await new Promise((r) => setTimeout(r, 200))

    await watcher.stop()
    expect(missingHandler).toHaveBeenCalledWith(configPath)
  })

  it('does not emit corrupt for valid JSON change', async () => {
    const configPath = path.join(tmpDir, 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({ version: '1.0' }))

    const watcher = createWatcher({ paths: [configPath], debounceMs: 50 })
    const corruptHandler = vi.fn()
    watcher.on('corrupt', corruptHandler)
    watcher.on('change', vi.fn())
    await watcher.start()

    await new Promise((r) => setTimeout(r, 100))
    fs.writeFileSync(configPath, JSON.stringify({ version: '2.0', newKey: true }))
    await new Promise((r) => setTimeout(r, 200))

    await watcher.stop()
    expect(corruptHandler).not.toHaveBeenCalled()
  })
})
