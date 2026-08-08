import { createServer } from 'node:http'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createHttpHandler } from './app.js'
import type { AssetService } from './domain.js'
import type { AssetRecord } from './types.js'

const servers: Array<ReturnType<typeof createServer>> = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})

async function listen(handler: ReturnType<typeof createHttpHandler>) {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('测试服务启动失败')
  return `http://127.0.0.1:${address.port}`
}

const record: AssetRecord = {
  id: 'asset-1',
  sourceOrigin: 'https://sub.example',
  userId: 'user-1',
  taskId: 'task-1',
  original: { kind: 'original', objectKey: 'temporary/asset-1/original', bytes: 3, mediaType: 'image/png' },
  status: 'initialized',
  createdAt: new Date('2026-08-08T00:00:00.000Z'),
  updatedAt: new Date('2026-08-08T00:00:00.000Z'),
  expiresAt: new Date('2026-08-09T00:00:00.000Z'),
}

describe('online asset HTTP API', () => {
  it('exposes a credential-free health check without invoking identity verification', async () => {
    const verify = vi.fn()
    const handler = createHttpHandler({} as AssetService, { verify }, ['https://awai.example'])
    const url = await listen(handler)
    const response = await fetch(`${url}/healthz`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(verify).not.toHaveBeenCalled()
  })

  it('rejects claimed-user and verified JWT identity mismatch before asset initialization', async () => {
    const initialize = vi.fn()
    const handler = createHttpHandler(
      { initialize } as unknown as AssetService,
      { verify: vi.fn(async () => ({ userId: 'user-1' })) },
      ['https://awai.example'],
    )
    const url = await listen(handler)
    const response = await fetch(`${url}/v1/assets`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer menu-jwt',
        'x-sub2api-origin': 'https://sub.example',
        'x-awai-user-id': 'user-2',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ taskId: 'task-1', original: { bytes: 3, mediaType: 'image/png' } }),
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: 'identity_mismatch' } })
    expect(initialize).not.toHaveBeenCalled()
  })

  it('authenticates and returns a constrained direct-upload initialization response', async () => {
    const initialize = vi.fn(async () => ({
      record,
      uploads: [{ kind: 'original', objectKey: record.original.objectKey, mediaType: 'image/png', url: 'https://objects.example/signed' }],
    }))
    const handler = createHttpHandler(
      { initialize } as unknown as AssetService,
      { verify: vi.fn(async () => ({ userId: 'user-1' })) },
      ['https://awai.example'],
    )
    const url = await listen(handler)
    const response = await fetch(`${url}/v1/assets`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer menu-jwt',
        'x-sub2api-origin': 'https://sub.example',
        'x-awai-user-id': 'user-1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ taskId: 'task-1', original: { bytes: 3, mediaType: 'image/png' } }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      asset: { id: 'asset-1', expiresAt: '2026-08-09T00:00:00.000Z' },
      uploads: [{ objectKey: 'temporary/asset-1/original', url: 'https://objects.example/signed' }],
    })
  })
})
