import { describe, expect, it } from 'vitest'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS, normalizeSettings } from './apiProfiles'
import { getAgentProfileValidationError } from './agentProfileValidation'
import type { Sub2ApiKey } from './sub2api'

const textProfile = createDefaultOpenAIProfile({
  id: 'text-profile',
  apiKey: 'text-secret',
  apiMode: 'responses',
  model: 'gpt-4.1',
  keyId: 'text-key',
})
const imageProfile = createDefaultOpenAIProfile({
  id: 'image-profile',
  apiKey: 'image-secret',
  apiMode: 'images',
  model: 'gpt-image-2',
  keyId: 'image-key',
})
const activeKey = (id: string): Sub2ApiKey => ({
  id,
  name: id,
  value: `${id}-secret`,
  group: id,
  status: 'active',
})
const hybridSettings = normalizeSettings({
  ...DEFAULT_SETTINGS,
  profiles: [textProfile, imageProfile],
  activeProfileId: imageProfile.id,
  agentApiConfigMode: 'hybrid',
  agentTextProfileId: textProfile.id,
  agentImageProfileId: imageProfile.id,
})

describe('getAgentProfileValidationError', () => {
  it('requires mixed text and image configuration online', () => {
    const settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      profiles: [textProfile],
      activeProfileId: textProfile.id,
      agentApiConfigMode: 'off',
    })

    expect(getAgentProfileValidationError(settings, { requireHybrid: true })?.message).toContain('同时配置')
    expect(getAgentProfileValidationError(settings)).toBeNull()
  })

  it('accepts two usable Sub2API groups', () => {
    expect(getAgentProfileValidationError(hybridSettings, {
      requireHybrid: true,
      keys: [activeKey('text-key'), activeKey('image-key')],
    })).toBeNull()
  })

  it('rejects a deleted image group', () => {
    expect(getAgentProfileValidationError(hybridSettings, {
      requireHybrid: true,
      keys: [activeKey('text-key')],
    })?.message).toContain('生图分组已删除')
  })

  it('rejects a disabled text group', () => {
    expect(getAgentProfileValidationError(hybridSettings, {
      requireHybrid: true,
      keys: [{ ...activeKey('text-key'), status: 'disabled' }, activeKey('image-key')],
    })?.message).toContain('文本分组已删除、禁用或失效')
  })
})
