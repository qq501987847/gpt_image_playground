import type { AppSettings } from '../types'
import { getAgentProfileValidationError } from './agentProfileValidation'
import { isSub2ApiKeyUsable, type Sub2ApiKey } from './sub2api'

export function shouldOpenAgentSetup(settings: AppSettings, keys: Sub2ApiKey[]) {
  if (!keys.some(isSub2ApiKeyUsable)) return false
  return Boolean(getAgentProfileValidationError(settings, { requireHybrid: true, keys }))
}
