import { useSyncExternalStore } from 'react'
import type { ApiProfile } from '../types'
import { appRuntime, createDesktopCredential, invokeDesktop, isDesktopRuntime, listDesktopCredentials } from './runtime'
import { bootstrapIframeContext, type IframeBootstrapContext } from './iframeBootstrap'
import { discoverSub2ApiModels, isSub2ApiKeyUsable, loadSub2ApiIdentity, readKeyBinding, splitSub2ApiModels, writeKeyBinding, type Sub2ApiKey, type Sub2ApiUser } from './sub2api'

interface Sub2ApiSessionState {
  status: 'standalone' | 'loading' | 'ready' | 'invalid' | 'error'
  context: IframeBootstrapContext | null
  user: Sub2ApiUser | null
  keys: Sub2ApiKey[]
  error: string | null
}

const releaseMode = import.meta.env.VITE_AWAI_RELEASE_MODE === 'true'
// 本地开发默认使用内存模拟数据，设置为 false 后恢复真实 iframe JWT 请求。
const devMockEnabled = import.meta.env.DEV && !releaseMode && import.meta.env.VITE_AWAI_SUB2API_MOCK !== 'false'

const devMockKeys: Sub2ApiKey[] = [
  {
    id: 'dev-key-pro-primary',
    name: '开发主 Key',
    value: 'dev-mock-key-primary',
    group: 'Pro',
    status: 'active',
    remaining: 100000,
  },
  {
    id: 'dev-key-pro-secondary',
    name: '开发备用 Key',
    value: 'dev-mock-key-secondary',
    group: 'Pro',
    status: 'active',
    remaining: 50000,
  },
  {
    id: 'dev-key-gemini',
    name: '开发 Gemini Key',
    value: 'dev-mock-key-gemini',
    group: 'Gemini',
    status: 'active',
    remaining: 20000,
  },
]

const devMockModels: Record<string, { openai: string[], gemini: string[] }> = {
  'dev-key-pro-primary': {
    openai: ['gpt-image-2', 'gpt-5.6-sol', 'gpt-4.1'],
    gemini: ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'],
  },
  'dev-key-pro-secondary': {
    openai: ['gpt-image-2', 'gpt-4o', 'gpt-4.1-mini'],
    gemini: ['gemini-3-pro-image-preview'],
  },
  'dev-key-gemini': {
    openai: ['gpt-4.1-mini'],
    gemini: ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
  },
}

function createDevMockContext(): IframeBootstrapContext {
  return {
    userId: 'dev-user',
    token: 'dev-menu-jwt',
    origin: window.location.origin,
    theme: null,
    lang: 'zh',
    uiMode: 'dev-mock',
    srcUrl: null,
  }
}

function getDevMockModels(keyId: string, provider: 'openai' | 'gemini') {
  return devMockModels[keyId]?.[provider] ?? []
}

let state: Sub2ApiSessionState = {
  status: devMockEnabled ? 'loading' : releaseMode && !isDesktopRuntime ? 'loading' : 'standalone',
  context: null,
  user: null,
  keys: [],
  error: null,
}
const listeners = new Set<() => void>()

function setState(next: Sub2ApiSessionState) {
  state = next
  listeners.forEach((listener) => listener())
}

export async function initializeSub2ApiSession() {
  if (isDesktopRuntime) {
    const credentials = await listDesktopCredentials()
    setState({
      status: 'ready',
      context: null,
      user: { id: 'desktop', name: '桌面用户' },
      keys: credentials.map((credential) => ({
        id: credential.id,
        name: credential.label,
        value: '',
        group: '',
        status: credential.available ? 'active' : 'missing',
      })),
      error: null,
    })
    return state
  }
  if (devMockEnabled) {
    const context = createDevMockContext()
    setState({
      status: 'ready',
      context,
      user: { id: 'dev-user', name: '本地开发用户' },
      keys: devMockKeys,
      error: null,
    })
    return state
  }
  const params = new URLSearchParams(window.location.search)
  const embedded = ['user_id', 'token', 'src_host', 'src_url', 'ui_mode'].some((key) => params.has(key))
  if (!embedded) {
    if (releaseMode) setState({ status: 'invalid', context: null, user: null, keys: [], error: '请从 Sub2API 进入 AWAI创作工作台' })
    return state
  }
  const context = bootstrapIframeContext()
  if (!context) {
    setState({ status: 'invalid', context: null, user: null, keys: [], error: '入口无效' })
    return state
  }
  setState({ status: 'loading', context, user: null, keys: [], error: null })
  try {
    const identity = await loadSub2ApiIdentity(context)
    if (identity.user.id !== context.userId) throw new Error('入口用户与 Sub2API 身份不一致')
    setState({ status: 'ready', context, user: identity.user, keys: identity.keys, error: null })
  } catch (error) {
    setState({ status: 'error', context, user: null, keys: [], error: error instanceof Error ? error.message : String(error) })
  }
  return state
}

export function getSub2ApiSession() {
  return state
}

export function useSub2ApiSession() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

export async function hydrateSub2ApiProfiles(profiles: ApiProfile[]) {
  if (isDesktopRuntime) {
    const baseUrl = await invokeDesktop<string>('desktop_base_url')
    return Promise.all(profiles.map(async (profile) => {
      const apiKey = profile.keyId ? await appRuntime.credentials.get(profile.keyId) ?? '' : ''
      return { ...profile, baseUrl, apiKey, credentialRebindRequired: Boolean(profile.keyId && !apiKey) }
    }))
  }
  if (state.status !== 'ready' || !state.context) return profiles
  return Promise.all(profiles.map(async (profile) => {
    const keyId = profile.keyId ?? await readKeyBinding(appRuntime, state.context!, profile.id)
    const key = state.keys.find((item) => item.id === keyId && isSub2ApiKeyUsable(item))
    return { ...profile, baseUrl: state.context!.origin, keyId: keyId ?? null, apiKey: key?.value ?? '' }
  }))
}

export async function bindSub2ApiProfile(profile: ApiProfile, keyId: string | null) {
  if (devMockEnabled) {
    const key = devMockKeys.find((item) => item.id === keyId && isSub2ApiKeyUsable(item))
    return { ...profile, baseUrl: window.location.origin, keyId: key?.id ?? null, apiKey: key?.value ?? '' }
  }
  if (isDesktopRuntime) {
    const baseUrl = await invokeDesktop<string>('desktop_base_url')
    const apiKey = keyId ? await appRuntime.credentials.get(keyId) ?? '' : ''
    return { ...profile, baseUrl, keyId, apiKey, credentialRebindRequired: Boolean(keyId && !apiKey) }
  }
  if (state.status !== 'ready' || !state.context) return { ...profile, keyId: null, apiKey: '' }
  const key = state.keys.find((item) => item.id === keyId && isSub2ApiKeyUsable(item))
  await writeKeyBinding(appRuntime, state.context, profile.id, key?.id ?? null)
  return { ...profile, baseUrl: state.context.origin, keyId: key?.id ?? null, apiKey: key?.value ?? '' }
}

export async function discoverProfileModels(profile: ApiProfile) {
  if (devMockEnabled) return getDevMockModels(profile.keyId ?? '', profile.provider === 'gemini' ? 'gemini' : 'openai')
  if (isDesktopRuntime) {
    if (!profile.keyId) throw new Error('请先选择可用凭据')
    const value = await appRuntime.credentials.get(profile.keyId)
    if (!value) throw new Error('凭据缺失，需要重新绑定')
    const origin = await invokeDesktop<string>('desktop_base_url')
    const models = await discoverSub2ApiModels(origin, { id: profile.keyId, name: '', value, group: '', status: 'active' })
    if (profile.provider === 'gemini') return splitSub2ApiModels(models).gemini
    if (profile.provider === 'openai') return splitSub2ApiModels(models).openai
    return models
  }
  if (state.status !== 'ready' || !state.context) return []
  const key = state.keys.find((item) => item.id === profile.keyId && isSub2ApiKeyUsable(item))
  if (!key) throw new Error('请先选择可用 Key')
  const models = await discoverSub2ApiModels(state.context.origin, key)
  if (profile.provider === 'gemini') return splitSub2ApiModels(models).gemini
  if (profile.provider === 'openai') return splitSub2ApiModels(models).openai
  return models
}

export async function discoverModelsForKey(keyId: string): Promise<{ openai: string[], gemini: string[], errors: { openai?: string, gemini?: string } }> {
  if (devMockEnabled) {
    await new Promise((resolve) => window.setTimeout(resolve, 140))
    return { openai: getDevMockModels(keyId, 'openai'), gemini: getDevMockModels(keyId, 'gemini'), errors: {} }
  }
  const getKey = async (): Promise<Sub2ApiKey> => {
    if (isDesktopRuntime) {
      const value = await appRuntime.credentials.get(keyId)
      if (!value) throw new Error('凭据缺失，需要重新绑定')
      return { id: keyId, name: '', value, group: '', status: 'active' }
    }
    const key = state.keys.find((item) => item.id === keyId && isSub2ApiKeyUsable(item))
    if (!key) throw new Error('请先选择可用 Key')
    return key
  }

  const key = await getKey()
  const origin = isDesktopRuntime ? await invokeDesktop<string>('desktop_base_url') : state.context?.origin
  if (!origin) throw new Error('Sub2API 会话未就绪')
  const models = splitSub2ApiModels(await discoverSub2ApiModels(origin, key))
  return {
    ...models,
    errors: {},
  }
}

export async function addDesktopCredential(label: string, value: string) {
  await createDesktopCredential(label, value)
  return initializeSub2ApiSession()
}
