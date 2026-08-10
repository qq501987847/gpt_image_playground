import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../types'
import { DEFAULT_SETTINGS, createDefaultOpenAIProfile } from './apiProfiles'

vi.mock('./sub2apiSession', () => ({
  bindSub2ApiProfile: (profile: object, keyId: string) => Promise.resolve({ ...profile, keyId, apiKey: `secret-${keyId}` }),
}))

describe('agent profile selection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reuses an existing text profile', async () => {
    const existing = createDefaultOpenAIProfile({ id: 'text', model: 'gpt-5', apiMode: 'responses', keyId: 'key-1' })
    const settings = { ...DEFAULT_SETTINGS, profiles: [existing] } as AppSettings
    const { bindAgentTextSelection } = await import('./agentProfileSelection')

    const result = await bindAgentTextSelection(settings, 'key-1', 'gpt-5')

    expect(result.profile.id).toBe('text')
    expect(result.profiles).toHaveLength(1)
    expect(result.profile.apiKey).toBe('secret-key-1')
  })

  it('creates a Gemini image profile with the native provider', async () => {
    const settings = { ...DEFAULT_SETTINGS, profiles: [] } as AppSettings
    const { bindAgentImageSelection } = await import('./agentProfileSelection')

    const result = await bindAgentImageSelection(settings, 'key-2', 'gemini', 'gemini-image')

    expect(result.profile).toMatchObject({ provider: 'gemini', apiMode: 'images', model: 'gemini-image', keyId: 'key-2' })
    expect(result.profiles).toEqual([result.profile])
  })
})
