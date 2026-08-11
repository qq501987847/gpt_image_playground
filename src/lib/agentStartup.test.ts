import { describe, expect, it } from 'vitest'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS, normalizeSettings } from './apiProfiles'
import { shouldOpenAgentSetup } from './agentStartup'
import type { Sub2ApiKey } from './sub2api'

const key = (id: string): Sub2ApiKey => ({
  id,
  name: id,
  value: `${id}-secret`,
  group: id,
  status: 'active',
})

describe('shouldOpenAgentSetup', () => {
  it('does not reopen setup for a valid hybrid configuration', () => {
    const textProfile = createDefaultOpenAIProfile({ id: 'text', apiMode: 'responses', model: 'gpt-4.1', keyId: 'text-key', apiKey: 'text-secret' })
    const imageProfile = createDefaultOpenAIProfile({ id: 'image', apiMode: 'images', model: 'gpt-image-2', keyId: 'image-key', apiKey: 'image-secret' })
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      profiles: [textProfile, imageProfile],
      activeProfileId: imageProfile.id,
      agentApiConfigMode: 'hybrid',
      agentTextProfileId: textProfile.id,
      agentImageProfileId: imageProfile.id,
    })

    expect(shouldOpenAgentSetup(settings, [key('text-key'), key('image-key')])).toBe(false)
  })

  it('opens setup when a usable key exists but Agent is not configured', () => {
    expect(shouldOpenAgentSetup(DEFAULT_SETTINGS, [key('available-key')])).toBe(true)
  })

  it('does not open setup without a usable key', () => {
    expect(shouldOpenAgentSetup(DEFAULT_SETTINGS, [{ ...key('expired-key'), status: 'disabled' }])).toBe(false)
  })
})
