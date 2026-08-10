import type { ApiProfile, AppSettings } from '../types'
import { getAgentImageApiProfile, getAgentTextApiProfile, normalizeSettings, validateApiProfile } from './apiProfiles'
import { isImageGenerationProfile } from './modelCapabilities'
import { isSub2ApiKeyUsable, type Sub2ApiKey } from './sub2api'

export interface AgentProfileValidationError {
  profile: ApiProfile | null
  message: string
}

interface AgentProfileValidationOptions {
  requireHybrid?: boolean
  keys?: Sub2ApiKey[]
}

function getKeyError(profile: ApiProfile, label: string, keys: Sub2ApiKey[] | undefined) {
  if (!keys) return null
  const key = keys.find((item) => item.id === profile.keyId)
  if (key && isSub2ApiKeyUsable(key)) return null
  return `${label}分组已删除、禁用或失效，请重新选择。`
}

export function getAgentProfileValidationError(
  settings: AppSettings,
  opts: AgentProfileValidationOptions = {},
): AgentProfileValidationError | null {
  const normalized = normalizeSettings(settings)
  if (opts.requireHybrid && normalized.agentApiConfigMode !== 'hybrid') {
    return { profile: null, message: '在线版 Agent 需要同时配置文本模型和生图模型。' }
  }

  const textProfile = getAgentTextApiProfile(normalized)
  if (!textProfile || textProfile.provider !== 'openai' || textProfile.apiMode !== 'responses') {
    return { profile: textProfile, message: 'Agent 模式需要使用支持 Responses API 的 OpenAI 兼容文本模型配置。' }
  }
  const textKeyError = getKeyError(textProfile, '文本', opts.keys)
  if (textKeyError) return { profile: textProfile, message: textKeyError }
  const textProfileError = validateApiProfile(textProfile)
  if (textProfileError) return { profile: textProfile, message: `文本模型 API 配置不完整：${textProfileError}` }

  if (normalized.agentApiConfigMode !== 'hybrid') return null

  const imageProfile = getAgentImageApiProfile(normalized)
  if (!imageProfile) return { profile: null, message: '图像模型 API 配置不存在，请重新选择生图分组和模型。' }
  if (!isImageGenerationProfile(imageProfile)) return { profile: imageProfile, message: 'Agent 图像工具需要使用 Images API 或 Gemini 图像模型配置。' }
  const imageKeyError = getKeyError(imageProfile, '生图', opts.keys)
  if (imageKeyError) return { profile: imageProfile, message: imageKeyError }
  const imageProfileError = validateApiProfile(imageProfile)
  if (imageProfileError) return { profile: imageProfile, message: `图像模型 API 配置不完整：${imageProfileError}` }

  return null
}
