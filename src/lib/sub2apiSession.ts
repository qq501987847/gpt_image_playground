import { useSyncExternalStore } from 'react'
import type { ApiProfile } from '../types'
import { appRuntime, createDesktopCredential, invokeDesktop, isDesktopRuntime, listDesktopCredentials } from './runtime'
import { bootstrapIframeContext, type IframeBootstrapContext } from './iframeBootstrap'
import { discoverSub2ApiModels, isSub2ApiKeyUsable, loadSub2ApiIdentity, readKeyBinding, writeKeyBinding, type Sub2ApiKey, type Sub2ApiUser } from './sub2api'

interface Sub2ApiSessionState {
  status: 'standalone' | 'loading' | 'ready' | 'invalid' | 'error'
  context: IframeBootstrapContext | null
  user: Sub2ApiUser | null
  keys: Sub2ApiKey[]
  error: string | null
}

const releaseMode = import.meta.env.VITE_AWAI_RELEASE_MODE === 'true'
let state: Sub2ApiSessionState = {
  status: releaseMode && !isDesktopRuntime ? 'loading' : 'standalone',
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
  if (isDesktopRuntime) {
    if (!profile.keyId) throw new Error('请先选择可用凭据')
    const value = await appRuntime.credentials.get(profile.keyId)
    if (!value) throw new Error('凭据缺失，需要重新绑定')
    const origin = await invokeDesktop<string>('desktop_base_url')
    return discoverSub2ApiModels(origin, { id: profile.keyId, name: '', value, group: '', status: 'active' }, profile.provider)
  }
  if (state.status !== 'ready' || !state.context) return []
  const key = state.keys.find((item) => item.id === profile.keyId && isSub2ApiKeyUsable(item))
  if (!key) throw new Error('请先选择可用 Key')
  return discoverSub2ApiModels(state.context.origin, key, profile.provider)
}

export async function addDesktopCredential(label: string, value: string) {
  await createDesktopCredential(label, value)
  return initializeSub2ApiSession()
}
