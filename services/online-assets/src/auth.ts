import { AssetError } from './domain.js'
import type { IdentityVerifier } from './types.js'

function getUserId(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const data = value as Record<string, unknown>
  const profile = data.data && typeof data.data === 'object' ? data.data as Record<string, unknown> : data
  return String(profile.id ?? profile.user_id ?? '')
}

export class Sub2ApiIdentityVerifier implements IdentityVerifier {
  private allowedOrigins: Set<string>

  constructor(origins: string[], private request: typeof fetch = fetch) {
    this.allowedOrigins = new Set(origins.filter((origin) => /^https:\/\//.test(origin)))
  }

  async verify(sourceOrigin: string, token: string) {
    if (!this.allowedOrigins.has(sourceOrigin)) throw new AssetError('origin_rejected', 'Sub2API 来源不受信任', 403)
    const response = await this.request(`${sourceOrigin}/api/v1/user/profile`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'error',
    })
    if (!response.ok) throw new AssetError('invalid_token', '菜单身份验证失败', 401)
    const userId = getUserId(await response.json())
    if (!userId) throw new AssetError('invalid_identity', 'Sub2API 未返回有效用户身份', 401)
    return { userId }
  }
}
