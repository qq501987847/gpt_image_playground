export interface IframeBootstrapContext {
  userId: string
  token: string
  theme: string | null
  lang: string | null
  uiMode: string | null
  origin: string
  srcUrl: string | null
}

function getAllowedOrigins(value = import.meta.env.VITE_AWAI_SUB2API_ALLOWED_ORIGINS || '') {
  return value.split(',').map((item: string) => item.trim()).filter((item: string) => {
    try {
      const url = new URL(item)
      return url.protocol === 'https:' && url.origin === item && !url.username && !url.password
    } catch {
      return false
    }
  })
}

function normalizeDevelopmentOrigin(value: string) {
  try {
    const url = new URL(value)
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    return url.protocol === 'http:' && url.origin === value && loopback && !url.username && !url.password ? url.origin : ''
  } catch {
    return ''
  }
}

function getDevelopmentOrigin(value = import.meta.env.VITE_AWAI_DEV_SUB2API_ORIGIN || '') {
  if (!import.meta.env.DEV || import.meta.env.VITE_AWAI_RELEASE_MODE === 'true') return ''
  return normalizeDevelopmentOrigin(value)
}

export function bootstrapIframeContext(
  location: Pick<Location, 'href' | 'search'> = window.location,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.sessionStorage,
  allowedOrigins = getAllowedOrigins(),
  replaceUrl: (url: string) => void = (url) => window.history.replaceState(null, '', url),
  developmentOrigin = getDevelopmentOrigin(),
): IframeBootstrapContext | null {
  const devOrigin = normalizeDevelopmentOrigin(developmentOrigin)
  const params = new URLSearchParams(location.search)
  const urlToken = params.get('token') || ''
  if (urlToken) {
    const cleaned = new URL(location.href)
    cleaned.searchParams.delete('token')
    replaceUrl(`${cleaned.pathname}${cleaned.search}${cleaned.hash}`)
  }
  const userId = params.get('user_id') || ''
  const srcHost = params.get('src_host') || ''
  let origin = ''
  try {
    const url = new URL(srcHost)
    const exactOrigin = url.origin === srcHost.replace(/\/$/, '') && !url.username && !url.password
    origin = exactOrigin && (url.protocol === 'https:' || url.origin === devOrigin) ? url.origin : ''
  } catch {
    return null
  }
  if (!userId || !origin || (!allowedOrigins.includes(origin) && origin !== devOrigin)) return null
  const tokenKey = `awai-sub2api-token:${encodeURIComponent(origin)}:${encodeURIComponent(userId)}`
  const token = urlToken || storage.getItem(tokenKey) || ''
  if (!token) return null
  if (urlToken) storage.setItem(tokenKey, token)
  return {
    userId,
    token,
    theme: params.get('theme'),
    lang: params.get('lang'),
    uiMode: params.get('ui_mode'),
    origin,
    srcUrl: params.get('src_url'),
  }
}
