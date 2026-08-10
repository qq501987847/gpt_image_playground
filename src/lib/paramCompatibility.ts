import { DEFAULT_PARAMS, type AppSettings, type TaskParams } from '../types'
import { getActiveApiProfile } from './apiProfiles'
import { normalizeCodexCliImageSize, normalizeImageSize } from './size'

export const DEFAULT_FAL_IMAGE_SIZE = '1360x1024'
export const MAX_FAL_OUTPUT_IMAGES = 4
export const MAX_OPENAI_OUTPUT_IMAGES = 10

export function getOutputImageLimitForSettings(settings: AppSettings) {
  return getActiveApiProfile(settings).provider === 'fal' ? MAX_FAL_OUTPUT_IMAGES : MAX_OPENAI_OUTPUT_IMAGES
}

export function normalizeParamsForSettings(
  params: TaskParams,
  settings: AppSettings,
  options: { hasInputImages?: boolean } = {},
): TaskParams {
  const activeProfile = getActiveApiProfile(settings)
  const outputImageLimit = getOutputImageLimitForSettings(settings)
  const nextParams: TaskParams = {
    ...params,
    size: normalizeImageSize(params.size) || DEFAULT_PARAMS.size,
    n: Math.min(outputImageLimit, Math.max(1, params.n || DEFAULT_PARAMS.n)),
  }

  const modelParams = nextParams

  if (activeProfile.provider === 'openai' && activeProfile.codexCli) {
    modelParams.size = normalizeCodexCliImageSize(modelParams.size)
    modelParams.quality = DEFAULT_PARAMS.quality
  }

  if (activeProfile.provider === 'fal') {
    if (!options.hasInputImages && modelParams.size === 'auto') modelParams.size = DEFAULT_FAL_IMAGE_SIZE
    if (modelParams.quality === 'auto') modelParams.quality = 'high'
    modelParams.moderation = DEFAULT_PARAMS.moderation
    modelParams.output_compression = DEFAULT_PARAMS.output_compression
  }

  if (activeProfile.provider === 'gemini') {
    modelParams.transparent_output = false
    modelParams.output_compression = DEFAULT_PARAMS.output_compression
    modelParams.quality = DEFAULT_PARAMS.quality
    modelParams.moderation = DEFAULT_PARAMS.moderation
  }

  if (modelParams.output_format === 'png') {
    modelParams.output_compression = DEFAULT_PARAMS.output_compression
  }

  return modelParams
}

export function getChangedParams(current: TaskParams, next: TaskParams): Partial<TaskParams> {
  const patch: Partial<TaskParams> = {}
  for (const key of Object.keys(next) as Array<keyof TaskParams>) {
    if (current[key] !== next[key]) {
      ;(patch as Record<keyof TaskParams, TaskParams[keyof TaskParams]>)[key] = next[key]
    }
  }
  return patch
}
