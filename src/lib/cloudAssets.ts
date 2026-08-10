import type { CloudAssetCopy } from '../types'
import { dataUrlToBytes } from './dataUrl'
import { getSub2ApiSession } from './sub2apiSession'

const MAX_ORIGINAL_BYTES = 30 * 1024 * 1024
const serviceUrl = (import.meta.env.VITE_AWAI_ASSET_SERVICE_URL || '').replace(/\/+$/, '')

// 云端素材流程尚未正式开放，统一关闭上传和相关界面。
export const CLOUD_ASSETS_ENABLED = false

interface CloudAssetResponse {
  asset: {
    id: string
    expiresAt: string
  }
  uploads: Array<{
    kind: 'original' | 'thumbnail'
    url: string
    mediaType: string
  }>
}

interface CloudAssetListResponse {
  assets: Array<{
    id: string
    downloads?: { original?: string }
  }>
}

function getMime(dataUrl: string) {
  return dataUrl.match(/^data:([^;,]+)/)?.[1] || 'application/octet-stream'
}

function toBlob(dataUrl: string) {
  const { bytes } = dataUrlToBytes(dataUrl)
  return new Blob([bytes as BlobPart], { type: getMime(dataUrl) })
}

async function retry<T>(action: () => Promise<T>) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await action()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

function authHeaders() {
  const session = getSub2ApiSession()
  if (session.status !== 'ready' || !session.context) throw new Error('仅嵌入在线版支持云端临时保存')
  return {
    Authorization: `Bearer ${session.context.token}`,
    'x-sub2api-origin': session.context.origin,
    'x-awai-user-id': session.context.userId,
  }
}

async function serviceRequest<T>(path: string, init: RequestInit = {}) {
  if (!serviceUrl) throw new Error('云端临时保存服务未配置')
  const response = await fetch(`${serviceUrl}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...init.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message || `云端请求失败 (${response.status})`)
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

async function initialize(taskId: string, original: Blob, thumbnail?: Blob) {
  return serviceRequest<CloudAssetResponse>('/v1/assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      taskId,
      original: { bytes: original.size, mediaType: original.type },
      ...(thumbnail ? { thumbnail: { bytes: thumbnail.size, mediaType: thumbnail.type } } : {}),
    }),
  })
}

async function uploadFiles(result: CloudAssetResponse, original: Blob, thumbnail?: Blob) {
  for (const upload of result.uploads) {
    const body = upload.kind === 'original' ? original : thumbnail
    if (!body) throw new Error('云端上传清单无效')
    await retry(async () => {
      const response = await fetch(upload.url, { method: 'PUT', headers: { 'content-type': upload.mediaType }, body })
      if (!response.ok) throw new Error(`对象上传失败 (${response.status})`)
    })
  }
}

export async function uploadCloudAsset(taskId: string, imageId: string, originalDataUrl: string, thumbnailDataUrl?: string): Promise<CloudAssetCopy> {
  const original = toBlob(originalDataUrl)
  if (original.size > MAX_ORIGINAL_BYTES) return { imageId, status: 'local-only', error: '原图超过 30 MB 云端上限' }
  const thumbnail = thumbnailDataUrl ? toBlob(thumbnailDataUrl) : undefined

  try {
    let initialized = await initialize(taskId, original, thumbnail)
    try {
      await uploadFiles(initialized, original, thumbnail)
    } catch (error) {
      if (!String(error).includes('(401)') && !String(error).includes('(403)')) throw error
      initialized = await initialize(taskId, original, thumbnail)
      await uploadFiles(initialized, original, thumbnail)
    }
    await retry(() => serviceRequest(`/v1/assets/${encodeURIComponent(initialized.asset.id)}/confirm`, { method: 'POST' }))
    return { id: initialized.asset.id, imageId, status: 'available', expiresAt: initialized.asset.expiresAt }
  } catch (error) {
    return { imageId, status: 'local-only', error: error instanceof Error ? error.message : String(error) }
  }
}

export async function deleteCloudAsset(id: string) {
  await serviceRequest(`/v1/assets/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function deleteAllStoredCloudAssets() {
  const result = await serviceRequest<CloudAssetListResponse>('/v1/assets')
  await Promise.all(result.assets.map((asset) => deleteCloudAsset(asset.id)))
}

export async function getCloudAssetDownload(id: string) {
  const result = await serviceRequest<CloudAssetListResponse>('/v1/assets')
  return result.assets.find((asset) => asset.id === id)?.downloads?.original ?? null
}

export function isCloudAssetsConfigured() {
  return CLOUD_ASSETS_ENABLED && Boolean(serviceUrl)
}
