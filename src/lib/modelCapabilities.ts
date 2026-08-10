import { DEFAULT_PARAMS, type ApiMode, type ApiProfile, type ApiProvider, type TaskParams } from '../types'
import { GEMINI_IMAGE_SIZES, GEMINI_PRESET_MODELS, getGeminiAspectRatios } from './geminiCapabilities'

export type ModelProtocol = 'openai' | 'gemini'
export type ModelField = 'size' | 'quality' | 'n' | 'output_format' | 'output_compression' | 'background' | 'moderation' | 'transparent_output' | 'geminiAspectRatio' | 'geminiImageSize'
export type ModelPurpose = 'image' | 'responses'

export interface ModelCapability {
  protocol: ModelProtocol
  verified: boolean
  fields: ModelField[]
  sizes: string[]
  qualities: TaskParams['quality'][]
  imageSizes?: readonly TaskParams['geminiImageSize'][]
  aspectRatios?: string[]
}

const OPENAI_BASE_FIELDS: ModelField[] = ['size', 'n']
const GEMINI_BASE_FIELDS: ModelField[] = ['geminiAspectRatio', 'geminiImageSize']
const GPT_IMAGE_2_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536']
const IMAGE_MODEL_ID = /(?:^|[-_.])(?:gpt-image|image|images|imagen|dall-e|flux|midjourney)(?:[-_.]|$)/i
const OPENAI_TEXT_MODEL_ID = /^(?:gpt-(?:[345](?:[.-]|$)|4o(?:[-.]|$)|oss(?:[-.]|$))|o[134](?:[-.]|$)|chatgpt|codex)/i
const GEMINI_TEXT_MODEL_ID = /^gemini-/i
export const GPT_IMAGE_2_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9', '9:21', '1:3', '3:1', '2:1', '1:2'] as const
export const GPT_IMAGE_2_RESOLUTIONS = ['1K', '2K', '4K'] as const

function isExplicitImageModel(model: string) {
  return IMAGE_MODEL_ID.test(model.trim())
}

export function filterDiscoveredModels(provider: ApiProvider, models: string[], purpose: ModelPurpose) {
  if (purpose === 'responses') {
    if (provider !== 'openai') return []
    return models.filter((model) => !isExplicitImageModel(model))
  }
  return models.filter(isExplicitImageModel)
}

export function isImageGenerationProfile(profile: Pick<ApiProfile, 'provider' | 'model' | 'apiMode'>) {
  if (profile.apiMode !== 'images') return false
  if (isExplicitImageModel(profile.model)) return true
  if (profile.provider === 'openai') return !OPENAI_TEXT_MODEL_ID.test(profile.model.trim())
  if (profile.provider === 'gemini') return !GEMINI_TEXT_MODEL_ID.test(profile.model.trim())
  return true
}

export function isResponsesProfile(profile: Pick<ApiProfile, 'provider' | 'model' | 'apiMode'>) {
  return profile.provider === 'openai' && profile.apiMode === 'responses' && !isExplicitImageModel(profile.model)
}

const GPT_IMAGE_2_SIZE_MAP: Record<string, Record<string, string>> = {
  '1:1': { '1K': '1024x1024', '2K': '2048x2048', '4K': '2880x2880' },
  '16:9': { '1K': '1280x720', '2K': '2048x1152', '4K': '3840x2160' },
  '9:16': { '1K': '720x1280', '2K': '1152x2048', '4K': '2160x3840' },
  '4:3': { '1K': '1152x864', '2K': '2304x1728', '4K': '3264x2448' },
  '3:4': { '1K': '864x1152', '2K': '1728x2304', '4K': '2448x3264' },
  '3:2': { '1K': '1536x1024', '2K': '2048x1360', '4K': '3504x2336' },
  '2:3': { '1K': '1024x1536', '2K': '1360x2048', '4K': '2336x3504' },
  '5:4': { '1K': '1120x896', '2K': '2240x1792', '4K': '3200x2560' },
  '4:5': { '1K': '896x1120', '2K': '1792x2240', '4K': '2560x3200' },
  '21:9': { '1K': '1456x624', '2K': '2912x1248', '4K': '3840x1648' },
  '9:21': { '1K': '624x1456', '2K': '1248x2912', '4K': '1648x3840' },
  '1:3': { '2K': '688x2048', '4K': '1280x3840' },
  '3:1': { '2K': '2048x688', '4K': '3840x1280' },
  '2:1': { '1K': '1536x768', '2K': '3072x1536', '4K': '3840x1920' },
  '1:2': { '1K': '768x1536', '2K': '1536x3072', '4K': '1920x3840' },
}

export function getGptImage2SizeOptions(ratio: string) {
  return GPT_IMAGE_2_SIZE_MAP[ratio] ?? {}
}

export function getGptImage2RequestSize(params: Pick<TaskParams, 'size' | 'geminiAspectRatio' | 'geminiImageSize'>) {
  if ((!params.geminiAspectRatio || params.geminiAspectRatio === 'auto') && params.size !== 'auto') return params.size
  const ratio = !params.geminiAspectRatio || params.geminiAspectRatio === 'auto' ? '1:1' : params.geminiAspectRatio
  const resolution = params.geminiImageSize ?? 'auto'
  if (resolution !== 'auto') {
    const sizes = getGptImage2SizeOptions(ratio)
    return sizes[resolution] ?? sizes['2K'] ?? params.size
  }
  if (params.size !== 'auto') return params.size
  return params.size
}

export function getModelProtocol(provider: ApiProvider): ModelProtocol {
  return provider === 'gemini' ? 'gemini' : 'openai'
}

export function getModelParamsKey(profile: Pick<ApiProfile, 'provider' | 'model'>) {
  return `${profile.provider}:${profile.model.trim() || 'unknown'}`
}

export function getModelCapability(provider: ApiProvider, model: string, apiMode: ApiMode = 'images'): ModelCapability {
  const protocol = getModelProtocol(provider)
  if (protocol === 'gemini') {
    const verified = (GEMINI_PRESET_MODELS as readonly string[]).includes(model)
    return {
      protocol,
      verified,
      fields: verified ? GEMINI_BASE_FIELDS : [],
      sizes: [],
      qualities: [],
      imageSizes: verified ? GEMINI_IMAGE_SIZES : ['auto'],
      aspectRatios: verified ? ['auto', ...getGeminiAspectRatios(model)] : ['auto'],
    }
  }

  if (apiMode === 'responses') {
    return {
      protocol,
      verified: false,
      fields: OPENAI_BASE_FIELDS,
      sizes: ['auto'],
      qualities: ['auto'],
    }
  }

  if (model === 'gpt-image-2') {
    return {
      protocol,
      verified: true,
      fields: ['size', 'quality', 'n', 'output_format', 'output_compression', 'background', 'moderation', 'transparent_output', 'geminiAspectRatio', 'geminiImageSize'],
      sizes: GPT_IMAGE_2_SIZES,
      qualities: ['auto', 'low', 'medium', 'high'],
      imageSizes: GPT_IMAGE_2_RESOLUTIONS,
      aspectRatios: [...GPT_IMAGE_2_ASPECT_RATIOS],
    }
  }

  return {
    protocol,
    verified: false,
    fields: OPENAI_BASE_FIELDS,
    sizes: ['auto'],
    qualities: ['auto'],
  }
}

export function modelSupportsField(capability: ModelCapability, field: ModelField) {
  return capability.fields.includes(field)
}

export function normalizeParamsForModel(params: TaskParams, profile: Pick<ApiProfile, 'provider' | 'model' | 'apiMode'>): TaskParams {
  const capability = getModelCapability(profile.provider, profile.model, profile.apiMode)
  const next = { ...params }

  if (!modelSupportsField(capability, 'size')) next.size = DEFAULT_PARAMS.size
  if (!modelSupportsField(capability, 'quality')) next.quality = DEFAULT_PARAMS.quality
  if (!modelSupportsField(capability, 'n')) next.n = DEFAULT_PARAMS.n
  if (!modelSupportsField(capability, 'output_format')) next.output_format = DEFAULT_PARAMS.output_format
  if (!modelSupportsField(capability, 'output_compression')) next.output_compression = DEFAULT_PARAMS.output_compression
  if (!modelSupportsField(capability, 'background')) next.background = DEFAULT_PARAMS.background
  if (!modelSupportsField(capability, 'moderation')) next.moderation = DEFAULT_PARAMS.moderation
  if (!modelSupportsField(capability, 'transparent_output')) next.transparent_output = false
  if (!modelSupportsField(capability, 'geminiAspectRatio')) next.geminiAspectRatio = DEFAULT_PARAMS.geminiAspectRatio
  if (!modelSupportsField(capability, 'geminiImageSize')) next.geminiImageSize = DEFAULT_PARAMS.geminiImageSize

  if (capability.sizes.length && !capability.sizes.includes(next.size)) next.size = DEFAULT_PARAMS.size
  if (capability.qualities.length && !capability.qualities.includes(next.quality)) next.quality = DEFAULT_PARAMS.quality
  if (capability.verified && capability.imageSizes?.length && !capability.imageSizes.includes(next.geminiImageSize ?? 'auto')) next.geminiImageSize = DEFAULT_PARAMS.geminiImageSize
  if (capability.verified && capability.aspectRatios?.length && !capability.aspectRatios.includes(next.geminiAspectRatio ?? 'auto')) {
    next.geminiAspectRatio = profile.model === 'gpt-image-2' && next.geminiAspectRatio !== 'auto' ? '1:1' : 'auto'
  }
  if (next.output_format === 'png') next.output_compression = null

  return next
}

export function getOpenAIRequestParams(params: TaskParams, profile: Pick<ApiProfile, 'provider' | 'model' | 'apiMode'>) {
  if (profile.provider !== 'openai') {
    return {
      size: params.size,
      quality: params.quality,
      output_format: params.output_format,
      moderation: params.moderation,
      ...(params.output_format !== 'png' && params.output_compression != null ? { output_compression: params.output_compression } : {}),
      ...(params.n > 1 ? { n: params.n } : {}),
    }
  }
  const capability = getModelCapability(profile.provider, profile.model, profile.apiMode)
  const size = profile.model === 'gpt-image-2' ? getGptImage2RequestSize(params) : params.size
  return {
    ...(modelSupportsField(capability, 'size') && size !== 'auto' ? { size } : {}),
    ...(modelSupportsField(capability, 'quality') && params.quality !== 'auto' ? { quality: params.quality } : {}),
    ...(modelSupportsField(capability, 'n') && params.n > 1 ? { n: params.n } : {}),
    ...(modelSupportsField(capability, 'output_format') ? { output_format: params.output_format } : {}),
    ...(modelSupportsField(capability, 'output_compression') && params.output_format !== 'png' && params.output_compression != null
      ? { output_compression: params.output_compression }
      : {}),
    ...(modelSupportsField(capability, 'background') && params.background === 'opaque' ? { background: params.background } : {}),
    ...(modelSupportsField(capability, 'moderation') && params.moderation !== 'auto' ? { moderation: params.moderation } : {}),
  }
}

export function getGeminiRequestParams(params: TaskParams, profile: Pick<ApiProfile, 'provider' | 'model' | 'apiMode'>) {
  const capability = getModelCapability(profile.provider, profile.model, profile.apiMode)
  return {
    ...(modelSupportsField(capability, 'geminiAspectRatio') && params.geminiAspectRatio && params.geminiAspectRatio !== 'auto'
      ? { aspectRatio: params.geminiAspectRatio }
      : {}),
    ...(modelSupportsField(capability, 'geminiImageSize') && params.geminiImageSize && params.geminiImageSize !== 'auto'
      ? { imageSize: params.geminiImageSize }
      : {}),
  }
}
