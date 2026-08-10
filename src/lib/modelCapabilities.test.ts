import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { filterDiscoveredModels, getGeminiRequestParams, getGptImage2SizeOptions, getModelCapability, getOpenAIRequestParams, GPT_IMAGE_2_ASPECT_RATIOS, isImageGenerationProfile, isResponsesProfile, normalizeParamsForModel } from './modelCapabilities'

describe('model capabilities', () => {
  it('separates discovered image and Responses models without blocking explicit unknown image profiles', () => {
    const openai = ['gpt-image-2', 'gpt-5.6-sol', 'gpt-4.1', 'vendor-new-model']
    const gemini = ['gemini-3-pro-image-preview', 'gemini-2.5-pro', 'imagen-4.0-generate-001']

    expect(filterDiscoveredModels('openai', openai, 'image')).toEqual(['gpt-image-2'])
    expect(filterDiscoveredModels('openai', openai, 'responses')).toEqual(['gpt-5.6-sol', 'gpt-4.1', 'vendor-new-model'])
    expect(filterDiscoveredModels('gemini', gemini, 'image')).toEqual(['gemini-3-pro-image-preview', 'imagen-4.0-generate-001'])
    expect(isImageGenerationProfile({ provider: 'openai', model: 'gpt-5.6-sol', apiMode: 'images' })).toBe(false)
    expect(isImageGenerationProfile({ provider: 'openai', model: 'vendor-new-image-model', apiMode: 'images' })).toBe(true)
    expect(isImageGenerationProfile({ provider: 'openai', model: 'gpt-image-2', apiMode: 'responses' })).toBe(false)
    expect(isResponsesProfile({ provider: 'openai', model: 'gpt-5.6-sol', apiMode: 'responses' })).toBe(true)
    expect(isResponsesProfile({ provider: 'openai', model: 'gpt-image-2', apiMode: 'responses' })).toBe(false)
  })

  it('describes verified gpt-image-2 fields and filters automatic request values', () => {
    const capability = getModelCapability('openai', 'gpt-image-2')
    expect(capability.verified).toBe(true)
    expect(capability.fields).toContain('background')
    expect(capability.aspectRatios).toContain('16:9')
    expect(capability.fields).toContain('geminiImageSize')
    expect(capability.imageSizes).toEqual(['1K', '2K', '4K'])
    expect(getOpenAIRequestParams(DEFAULT_PARAMS, { provider: 'openai', model: 'gpt-image-2', apiMode: 'images' })).toEqual({ size: '2048x2048', output_format: 'png' })
  })

  it('uses the configured resolution tier for gpt-image-2', () => {
    const params = { ...DEFAULT_PARAMS, geminiAspectRatio: '9:16', geminiImageSize: '1K' as const }
    expect(getOpenAIRequestParams(params, { provider: 'openai', model: 'gpt-image-2', apiMode: 'images' })).toEqual({
      size: '720x1280', output_format: 'png',
    })
    expect(getOpenAIRequestParams({ ...params, geminiImageSize: '4K' }, { provider: 'openai', model: 'gpt-image-2', apiMode: 'images' })).toEqual({
      size: '2160x3840', output_format: 'png',
    })
  })

  it('converts gpt-image-2 ratio controls to its tiered sizes', () => {
    expect(getOpenAIRequestParams({ ...DEFAULT_PARAMS, geminiAspectRatio: '16:9', geminiImageSize: '4K' }, { provider: 'openai', model: 'gpt-image-2', apiMode: 'images' })).toEqual({
      size: '3840x2160', output_format: 'png',
    })
    expect(getOpenAIRequestParams({ ...DEFAULT_PARAMS, geminiAspectRatio: '9:16', geminiImageSize: '2K' }, { provider: 'openai', model: 'gpt-image-2', apiMode: 'images' })).toEqual({
      size: '1152x2048', output_format: 'png',
    })
    expect(getOpenAIRequestParams({ ...DEFAULT_PARAMS, geminiAspectRatio: '1:3', geminiImageSize: '1K' }, { provider: 'openai', model: 'gpt-image-2', apiMode: 'images' })).toEqual({
      size: '688x2048', output_format: 'png',
    })
  })

  it('uses the configured matrix including ratios without a 1K option', () => {
    const expected = {
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
    expect(Object.fromEntries(GPT_IMAGE_2_ASPECT_RATIOS.map((ratio) => [ratio, getGptImage2SizeOptions(ratio)]))).toEqual(expected)
  })

  it('migrates automatic gpt-image-2 resolution to the 2K default', () => {
    expect(normalizeParamsForModel({ ...DEFAULT_PARAMS, geminiImageSize: 'auto' }, { provider: 'openai', model: 'gpt-image-2', apiMode: 'images' })).toMatchObject({ geminiAspectRatio: 'auto', geminiImageSize: '2K' })
  })

  it('sends only verified OpenAI fields', () => {
    const params = { ...DEFAULT_PARAMS, size: '1536x1024', quality: 'high' as const, n: 2, output_format: 'jpeg' as const, output_compression: 70, background: 'opaque' as const, moderation: 'low' as const }
    expect(getOpenAIRequestParams(params, { provider: 'openai', model: 'gpt-image-2', apiMode: 'images' })).toEqual({
      size: '1536x1024', quality: 'high', n: 2, output_format: 'jpeg', output_compression: 70, background: 'opaque', moderation: 'low',
    })
    expect(getOpenAIRequestParams(params, { provider: 'openai', model: 'unknown-image', apiMode: 'images' })).toEqual({ size: '1536x1024', n: 2 })
  })

  it('maps low, medium and high quality selections to OpenAI request values', () => {
    for (const quality of ['low', 'medium', 'high'] as const) {
      expect(getOpenAIRequestParams({ ...DEFAULT_PARAMS, quality }, { provider: 'openai', model: 'gpt-image-2', apiMode: 'images' }).quality).toBe(quality)
    }
  })

  it('keeps Gemini request fields isolated from OpenAI fields', () => {
    const params = { ...DEFAULT_PARAMS, geminiAspectRatio: '16:9', geminiImageSize: '2K' as const }
    expect(getGeminiRequestParams(params, { provider: 'gemini', model: 'gemini-3-pro-image-preview', apiMode: 'images' })).toEqual({ aspectRatio: '16:9', imageSize: '2K' })
    expect(getGeminiRequestParams(params, { provider: 'gemini', model: 'unknown', apiMode: 'images' })).toEqual({})
  })

  it('resets unsupported fields for unknown models', () => {
    expect(normalizeParamsForModel({ ...DEFAULT_PARAMS, quality: 'high', output_format: 'webp', output_compression: 50, moderation: 'low', background: 'opaque' }, { provider: 'openai', model: 'unknown', apiMode: 'images' })).toMatchObject({
      quality: 'auto', output_format: 'png', output_compression: null, moderation: 'auto', background: 'auto',
    })
  })
})
