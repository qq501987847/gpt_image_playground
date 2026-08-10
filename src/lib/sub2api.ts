import type { ApiProvider } from '../types'
import type { RuntimeContract } from './runtime'
import type { IframeBootstrapContext } from './iframeBootstrap'

export interface Sub2ApiUser {
  id: string
  name: string
}

export interface Sub2ApiKey {
  id: string
  name: string
  value: string
  group: string
  status: string
  expiresAt?: string
  remaining?: number
}

export function getSub2ApiKeyLabel(key: Pick<Sub2ApiKey, 'id' | 'name' | 'group'>) {
  const name = key.name || key.id
  return key.group ? `${key.group} · ${name}` : name
}

export function getSub2ApiImageBillingTier(size: string) {
  const normalized = size.trim().toLowerCase()
  if (normalized === '1k') return '1K'
  if (normalized === '2k') return '2K'
  if (normalized === '4k') return '4K'
  const match = normalized.match(/^(\d+)x(\d+)$/)
  if (!match) return null
  const maxEdge = Math.max(Number(match[1]), Number(match[2]))
  if (maxEdge <= 1024) return '1K'
  if (maxEdge <= 2048) return '2K'
  return '4K'
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function unwrapData(value: unknown): unknown {
  const record = getRecord(value)
  return record.data ?? value
}

function getString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === 'string') return String(record[key])
    if (typeof record[key] === 'number' && Number.isFinite(record[key])) return String(record[key])
  }
  return ''
}

async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = getRecord(getRecord(payload).error)
    throw new Error(getString(error, 'message') || getString(getRecord(payload), 'message') || `Sub2API 请求失败（HTTP ${response.status}）`)
  }
  return payload
}

export function isSub2ApiKeyUsable(key: Sub2ApiKey, now = Date.now()) {
  if (!['active', 'enabled', 'normal', '1', ''].includes(key.status.toLowerCase())) return false
  if (key.expiresAt && Date.parse(key.expiresAt) <= now) return false
  return key.remaining == null || key.remaining > 0
}

export async function loadSub2ApiIdentity(context: IframeBootstrapContext) {
  const headers = { Authorization: `Bearer ${context.token}` }
  const [profilePayload, keysPayload] = await Promise.all([
    fetchJson(`${context.origin}/api/v1/user/profile`, { headers }),
    fetchJson(`${context.origin}/api/v1/keys?page=1&page_size=1000`, { headers }),
  ])
  const profile = getRecord(unwrapData(profilePayload))
  const keysData = unwrapData(keysPayload)
  const keysRecord = getRecord(keysData)
  const firstKeyItems = Array.isArray(keysData) ? keysData : Array.isArray(keysRecord.items) ? keysRecord.items as unknown[] : []
  const pages = Math.max(1, Number(keysRecord.pages) || 1)
  const additionalKeys = await Promise.all(Array.from({ length: pages - 1 }, (_, idx) =>
    fetchJson(`${context.origin}/api/v1/keys?page=${idx + 2}&page_size=1000`, { headers }),
  ))
  const keyItems = [
    ...firstKeyItems,
    ...additionalKeys.flatMap((payload) => {
      const data = unwrapData(payload)
      return Array.isArray(data) ? data : Array.isArray(getRecord(data).items) ? getRecord(data).items as unknown[] : []
    }),
  ]
  const user: Sub2ApiUser = {
    id: getString(profile, 'id', 'user_id') || context.userId,
    name: getString(profile, 'name', 'username', 'display_name'),
  }
  const keys = keyItems.map((item): Sub2ApiKey => {
    const record = getRecord(item)
    const explicitRemaining = Number(record.remaining ?? record.remaining_quota ?? record.balance)
    const quota = Number(record.quota)
    const quotaUsed = Number(record.quota_used)
    const remaining = Number.isFinite(explicitRemaining)
      ? explicitRemaining
      : Number.isFinite(quota) && quota > 0 && Number.isFinite(quotaUsed) ? quota - quotaUsed : undefined
    const group = getRecord(record.group)
    return {
      id: getString(record, 'id', 'key_id'),
      name: getString(record, 'name'),
      value: getString(record, 'key', 'value', 'api_key'),
      group: getString(record, 'group_name') || getString(group, 'name'),
      status: getString(record, 'status'),
      expiresAt: getString(record, 'expires_at', 'expired_at') || undefined,
      remaining,
    }
  }).filter((key) => key.id && key.value)
  return { user, keys }
}

export async function discoverSub2ApiModels(origin: string, key: Sub2ApiKey, provider: ApiProvider) {
  const path = provider === 'gemini' ? '/v1beta/models' : '/v1/models'
  const payload = await fetchJson(`${origin}${path}`, { headers: { Authorization: `Bearer ${key.value}` } })
  const record = getRecord(payload)
  const items = provider === 'gemini' ? record.models : record.data
  if (!Array.isArray(items)) return []
  return items.map((item) => {
    const model = getRecord(item)
    const id = getString(model, 'id', 'name').replace(/^models\//, '')
    return id
  }).filter(Boolean)
}

function bindingKey(context: Pick<IframeBootstrapContext, 'origin' | 'userId'>, profileId: string) {
  return `sub2api-binding:${encodeURIComponent(context.origin)}:${encodeURIComponent(context.userId)}:${encodeURIComponent(profileId)}`
}

export function readKeyBinding(runtime: RuntimeContract, context: Pick<IframeBootstrapContext, 'origin' | 'userId'>, profileId: string) {
  return runtime.metadata.getItem(bindingKey(context, profileId))
}

export function writeKeyBinding(runtime: RuntimeContract, context: Pick<IframeBootstrapContext, 'origin' | 'userId'>, profileId: string, keyId: string | null) {
  const key = bindingKey(context, profileId)
  return keyId ? runtime.metadata.setItem(key, keyId) : runtime.metadata.removeItem(key)
}
