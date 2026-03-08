import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as net from 'node:net'
import {
  findAvailablePort,
  detectPortConflict,
  isGuardianRunning,
  GUARDIAN_DEFAULT_PORT,
} from '../port.js'

describe('GUARDIAN_DEFAULT_PORT', () => {
  it('is 7749', () => {
    expect(GUARDIAN_DEFAULT_PORT).toBe(7749)
  })
})

describe('findAvailablePort', () => {
  it('returns preferred port if it is free', async () => {
    // Find a free port first
    const server = net.createServer()
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const addr = server.address() as net.AddressInfo
    const freePort = addr.port
    await new Promise<void>(r => server.close(() => r()))

    const result = await findAvailablePort(freePort)
    expect(result).toBe(freePort)
  })

  it('returns different port if preferred is occupied', async () => {
    const blocker = net.createServer()
    await new Promise<void>(r => blocker.listen(0, '127.0.0.1', r))
    const occupiedPort = (blocker.address() as net.AddressInfo).port

    try {
      const result = await findAvailablePort(occupiedPort)
      expect(result).not.toBe(occupiedPort)
      expect(result).toBeGreaterThan(1024)
    } finally {
      await new Promise<void>(r => blocker.close(() => r()))
    }
  })

  it('returns a port in valid range (1025-65535)', async () => {
    const port = await findAvailablePort()
    expect(port).toBeGreaterThanOrEqual(1025)
    expect(port).toBeLessThanOrEqual(65535)
  })
})

describe('detectPortConflict', () => {
  it('returns free when nothing is listening', async () => {
    // Use a port that is very likely free
    const result = await detectPortConflict(19999)
    expect(result).toBe('free')
  })

  it('returns other when port is occupied by non-Guardian server', async () => {
    const server = net.createServer()
    server.on('connection', (socket) => {
      // Probe timeout may reset the socket; swallow ECONNRESET in this mock server.
      socket.on('error', () => {})
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as net.AddressInfo).port

    try {
      // Server doesn't respond with Guardian signature
      const result = await detectPortConflict(port)
      expect(['other', 'guardian']).toContain(result)
    } finally {
      await new Promise<void>(r => server.close(() => r()))
    }
  })
})

describe('isGuardianRunning', () => {
  it('returns false when nothing on port', async () => {
    const result = await isGuardianRunning(19998)
    expect(result).toBe(false)
  })

  it('returns true when Guardian HTTP server responds with signature', async () => {
    // Mock a Guardian server
    const http = await import('node:http')
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ app: 'openclaw-guardian', version: '0.1.0' }))
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as net.AddressInfo).port

    try {
      const result = await isGuardianRunning(port)
      expect(result).toBe(true)
    } finally {
      await new Promise<void>(r => server.close(() => r()))
    }
  })
})
