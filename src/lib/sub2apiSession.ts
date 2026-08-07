import { useSyncExternalStore } from 'react'
import type { ApiProfile } from '../types'
import { browserRuntime } from './runtime'
import { bootstrapIframeContext, type IframeBootstrapContext } from './iframeBootstrap'
import { discoverSub2ApiModels, isSub2ApiKeyUsable, loadSub2ApiIdentity, readKeyBinding, writeKeyBinding, type Sub2ApiKey, type Sub2ApiUser } from './sub2api'

interface Sub2ApiSessionState {
  status: 'standalone' | 'loading' | 'ready' | 'invalid' | 'error'
  context: IframeBootstrapContext | null
  user: Sub2ApiUser | null
  keys: Sub2ApiKey[]
  error: string | null
}

let state: Sub2ApiSessionState = { status: 'standalone', context: null, user: null, keys: [], error: null }
const listeners = new Set<() => void>()

function setState(next: Sub2ApiSessionState) {
  state = next
  listeners.forEach((listener) => listener())
}

export async function initializeSub2ApiSession() {
  const params = new URLSearchParams(window.location.search)
  const embedded = ['user_id', 'token', 'src_host', 'src_url', 'ui_mode'].some((key) => params.has(key))
  if (!embedded) return state
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
  if (state.status !== 'ready' || !state.context) return profiles
  return Promise.all(profiles.map(async (profile) => {
    const keyId = profile.keyId ?? await readKeyBinding(browserRuntime, state.context!, profile.id)
    const key = state.keys.find((item) => item.id === keyId && isSub2ApiKeyUsable(item))
    return { ...profile, baseUrl: state.context!.origin, keyId: keyId ?? null, apiKey: key?.value ?? '' }
  }))
}

export async function bindSub2ApiProfile(profile: ApiProfile, keyId: string | null) {
  if (state.status !== 'ready' || !state.context) return { ...profile, keyId: null, apiKey: '' }
  const key = state.keys.find((item) => item.id === keyId && isSub2ApiKeyUsable(item))
  await writeKeyBinding(browserRuntime, state.context, profile.id, key?.id ?? null)
  return { ...profile, baseUrl: state.context.origin, keyId: key?.id ?? null, apiKey: key?.value ?? '' }
}

export async function discoverProfileModels(profile: ApiProfile) {
  if (state.status !== 'ready' || !state.context) return []
  const key = state.keys.find((item) => item.id === profile.keyId && isSub2ApiKeyUsable(item))
  if (!key) throw new Error('请先选择可用 Key')
  return discoverSub2ApiModels(state.context.origin, key, profile.provider)
}
