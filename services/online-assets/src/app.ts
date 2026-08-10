import type { IncomingMessage, ServerResponse } from 'node:http'

import { AssetError, AssetService, type InitializeAssetInput } from './domain.js'
import type { AssetRecord, IdentityVerifier } from './types.js'

function send(res: ServerResponse, status: number, body?: unknown) {
  res.statusCode = status
  if (body == null) {
    res.end()
    return
  }
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > 64 * 1024) throw new AssetError('body_too_large', '请求体过大', 413)
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown
  } catch {
    throw new AssetError('invalid_json', '请求 JSON 无效')
  }
}

function serialize(record: AssetRecord, downloads?: { original: string; thumbnail?: string }) {
  return {
    id: record.id,
    taskId: record.taskId,
    status: record.status,
    bytes: record.original.bytes + (record.thumbnail?.bytes ?? 0),
    mediaType: record.original.mediaType,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    downloads,
  }
}

export function createHttpHandler(
  service: AssetService,
  verifier: IdentityVerifier,
  webOrigins: string[],
  checkReadiness: () => Promise<void> = async () => { throw new Error('readiness probe is not configured') },
) {
  const allowedWebOrigins = new Set(webOrigins)
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://service.local')
    const webOrigin = String(req.headers.origin ?? '')
    if (webOrigin && allowedWebOrigins.has(webOrigin)) {
      res.setHeader('access-control-allow-origin', webOrigin)
      res.setHeader('vary', 'Origin')
      res.setHeader('access-control-allow-headers', 'authorization, content-type, x-sub2api-origin, x-awai-user-id')
      res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS')
    }
    if (req.method === 'OPTIONS') {
      send(res, allowedWebOrigins.has(webOrigin) ? 204 : 403)
      return
    }
    if (req.method === 'GET' && url.pathname === '/healthz') {
      send(res, 200, { status: 'ok' })
      return
    }
    if (req.method === 'GET' && url.pathname === '/readyz') {
      try {
        await checkReadiness()
        send(res, 200, { status: 'ready' })
      } catch {
        send(res, 503, { status: 'unavailable' })
      }
      return
    }

    try {
      const token = String(req.headers.authorization ?? '').match(/^Bearer (.+)$/)?.[1] ?? ''
      const sourceOrigin = String(req.headers['x-sub2api-origin'] ?? '')
      const claimedUserId = String(req.headers['x-awai-user-id'] ?? '')
      if (!token || !sourceOrigin || !claimedUserId) throw new AssetError('unauthorized', '缺少菜单身份信息', 401)
      const verified = await verifier.verify(sourceOrigin, token)
      if (verified.userId !== claimedUserId) throw new AssetError('identity_mismatch', '入口用户与菜单 JWT 身份不一致', 403)
      const identity = { sourceOrigin, userId: verified.userId }
      if (req.method === 'POST' && url.pathname === '/v1/assets') {
        const result = await service.initialize(identity, await readJson(req) as InitializeAssetInput)
        send(res, 201, { asset: serialize(result.record), uploads: result.uploads })
        return
      }
      if (req.method === 'GET' && url.pathname === '/v1/assets') {
        const records = await service.list(identity)
        send(res, 200, { assets: records.map((item) => serialize(item.record, item.downloads)) })
        return
      }
      const match = url.pathname.match(/^\/v1\/assets\/([^/]+)(\/confirm)?$/)
      if (match && req.method === 'POST' && match[2] === '/confirm') {
        send(res, 200, { asset: serialize(await service.confirm(identity, match[1])) })
        return
      }
      if (match && req.method === 'DELETE' && !match[2]) {
        await service.delete(identity, match[1])
        send(res, 204)
        return
      }
      throw new AssetError('not_found', '接口不存在', 404)
    } catch (error) {
      const err = error instanceof AssetError ? error : new AssetError('internal_error', '在线素材服务暂时不可用', 500)
      if (!(error instanceof AssetError)) console.error(error)
      send(res, err.status, { error: { code: err.code, message: err.message } })
    }
  }
}
