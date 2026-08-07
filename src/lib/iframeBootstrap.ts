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
  return value.split(',').map((item: string) => item.trim()).filter((item: string) => /^https:\/\//.test(item))
}

export function bootstrapIframeContext(
  location: Pick<Location, 'href' | 'search'> = window.location,
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.sessionStorage,
  allowedOrigins = getAllowedOrigins(),
  replaceUrl: (url: string) => void = (url) => window.history.replaceState(null, '', url),
): IframeBootstrapContext | null {
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
    origin = url.origin === srcHost.replace(/\/$/, '') && url.protocol === 'https:' ? url.origin : ''
  } catch {
    return null
  }
  if (!userId || !origin || !allowedOrigins.includes(origin)) return null
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
