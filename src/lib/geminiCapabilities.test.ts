import { describe, expect, it } from 'vitest'
import {
  GEMINI_FLASH_ASPECT_RATIOS,
  GEMINI_IMAGE_SIZES,
  GEMINI_PRESET_MODELS,
  GEMINI_STANDARD_ASPECT_RATIOS,
  getGeminiAspectRatios,
} from './geminiCapabilities'

describe('Gemini image capabilities', () => {
  it('declares both presets and every native resolution choice', () => {
    expect(GEMINI_PRESET_MODELS).toEqual([
      'gemini-3.1-flash-image-preview',
      'gemini-3-pro-image-preview',
    ])
    expect(GEMINI_IMAGE_SIZES).toEqual(['auto', '1K', '2K', '4K'])
  })

  it('adds extreme ratios only to the Flash preset', () => {
    expect(getGeminiAspectRatios('gemini-3.1-flash-image-preview')).toEqual(GEMINI_FLASH_ASPECT_RATIOS)
    expect(getGeminiAspectRatios('gemini-3-pro-image-preview')).toEqual(GEMINI_STANDARD_ASPECT_RATIOS)
    expect(GEMINI_FLASH_ASPECT_RATIOS.slice(-4)).toEqual(['8:1', '4:1', '1:4', '1:8'])
  })

  it('uses standard capabilities for unverified custom model ids', () => {
    expect(getGeminiAspectRatios('custom-gemini-image-model')).toEqual(GEMINI_STANDARD_ASPECT_RATIOS)
  })
})
