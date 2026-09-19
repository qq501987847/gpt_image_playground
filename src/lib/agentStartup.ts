import type { AppMode, AppSettings } from '../types'
import { getActiveApiProfile, validateApiProfile } from './apiProfiles'
import { getAgentProfileValidationError } from './agentProfileValidation'
import { isImageGenerationProfile } from './modelCapabilities'
import { isSub2ApiKeyUsable, type Sub2ApiKey } from './sub2api'

export function shouldOpenAgentSetup(settings: AppSettings, keys: Sub2ApiKey[], appMode: AppMode = 'gallery') {
  if (!keys.some(isSub2ApiKeyUsable)) return false
  if (appMode === 'gallery') {
    const profile = getActiveApiProfile(settings)
    return !isImageGenerationProfile(profile) || Boolean(validateApiProfile(profile)) ||
      !keys.some((key) => key.id === profile.keyId && isSub2ApiKeyUsable(key))
  }
  return Boolean(getAgentProfileValidationError(settings, { requireHybrid: true, keys }))
}
