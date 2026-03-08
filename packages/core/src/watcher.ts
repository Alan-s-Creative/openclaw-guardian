import chokidar from 'chokidar'
import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'

export interface WatcherConfig {
  paths: string[]
  debounceMs?: number
}

export type WatcherEvent = 'change' | 'corrupt' | 'missing'

export function createWatcher(config: WatcherConfig) {
  const watcher = chokidar.watch(config.paths, {
    ignoreInitial: true,
  })
  const emitter = new EventEmitter()
  const debounceMs = config.debounceMs ?? 500
  const timers = new Map<string, NodeJS.Timeout>()
  let started = false

  const evaluatePath = async (filePath: string): Promise<void> => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      JSON.parse(content)
      emitter.emit('change', filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        emitter.emit('missing', filePath)
        return
      }
      emitter.emit('corrupt', filePath)
    }
  }

  const scheduleCheck = (filePath: string): void => {
    const existing = timers.get(filePath)
    if (existing) {
      clearTimeout(existing)
    }

    const next = setTimeout(() => {
      timers.delete(filePath)
      void evaluatePath(filePath)
    }, debounceMs)

    timers.set(filePath, next)
  }

  return {
    start: async () => {
      if (started) {
        return
      }

      started = true
      watcher.on('add', scheduleCheck)
      watcher.on('change', scheduleCheck)
      watcher.on('unlink', scheduleCheck)

      await new Promise<void>((resolve, reject) => {
        const onReady = (): void => {
          watcher.off('ready', onReady)
          watcher.off('error', onError)
          resolve()
        }
        const onError = (error: unknown): void => {
          watcher.off('ready', onReady)
          watcher.off('error', onError)
          reject(error as Error)
        }
        watcher.on('ready', onReady)
        watcher.on('error', onError)
      })
    },
    stop: async () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
      await watcher.close()
      started = false
    },
    on: (event: WatcherEvent, handler: (path: string) => void) => {
      emitter.on(event, handler)
    },
  }
}
