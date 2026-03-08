import * as net from 'node:net'
import * as http from 'node:http'

export const GUARDIAN_DEFAULT_PORT = 7749
const GUARDIAN_SIGNATURE = 'openclaw-guardian'

/** Check if a port is free by attempting to bind */
async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

/** Find a free port, starting from preferred or random */
export async function findAvailablePort(preferred?: number): Promise<number> {
  if (preferred && (await isPortFree(preferred))) {
    return preferred
  }

  // Let OS assign a free port
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
  })
}

/** Check if a Guardian daemon is running on the port */
export async function isGuardianRunning(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const terminateRequest = (req: http.ClientRequest) => {
      const socket = req.socket as (net.Socket & { resetAndDestroy?: () => void }) | undefined
      if (socket && typeof socket.resetAndDestroy === 'function') {
        socket.resetAndDestroy()
        return
      }

      req.destroy()
    }

    const req = http.get(
      { hostname: '127.0.0.1', port, path: '/health' },
      (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          try {
            const data = JSON.parse(body) as { app?: unknown }
            finish(data?.app === GUARDIAN_SIGNATURE)
          } catch {
            finish(false)
          }
        })
      },
    )
    req.on('error', () => finish(false))
    req.setTimeout(1000, () => {
      terminateRequest(req)
      finish(false)
    })
  })
}

/** Detect what is on this port */
export async function detectPortConflict(
  port: number,
): Promise<'guardian' | 'other' | 'free'> {
  const free = await isPortFree(port)
  if (free) {
    return 'free'
  }

  const guardian = await isGuardianRunning(port)
  return guardian ? 'guardian' : 'other'
}
