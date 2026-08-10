import type { ApiProfile, AppSettings } from '../types'
import { createDefaultGeminiProfile, createDefaultOpenAIProfile } from './apiProfiles'
import { bindSub2ApiProfile } from './sub2apiSession'

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function upsertProfile(profiles: ApiProfile[], profile: ApiProfile) {
  return profiles.some((item) => item.id === profile.id)
    ? profiles.map((item) => item.id === profile.id ? profile : item)
    : [...profiles, profile]
}

export async function bindAgentTextSelection(settings: AppSettings, keyId: string, model: string) {
  const existing = settings.profiles.find((profile) =>
    profile.keyId === keyId && profile.provider === 'openai' && profile.model === model && profile.apiMode === 'responses',
  )
  const next = existing ?? createDefaultOpenAIProfile({
    id: newId('responses'),
    name: `${model} · 文本`,
    model,
    apiMode: 'responses',
    keyId,
  })
  const profile = await bindSub2ApiProfile(next, keyId)
  return { profile, profiles: upsertProfile(settings.profiles, profile) }
}

export async function bindAgentImageSelection(settings: AppSettings, keyId: string, provider: 'openai' | 'gemini', model: string) {
  const existing = settings.profiles.find((profile) =>
    profile.keyId === keyId && profile.provider === provider && profile.model === model && profile.apiMode === 'images',
  )
  const next = existing ?? (provider === 'gemini'
    ? createDefaultGeminiProfile({ id: newId('image'), name: `${model} · 生图`, model, keyId })
    : createDefaultOpenAIProfile({ id: newId('image'), name: `${model} · 生图`, model, apiMode: 'images', keyId }))
  const profile = await bindSub2ApiProfile(next, keyId)
  return { profile, profiles: upsertProfile(settings.profiles, profile) }
}
