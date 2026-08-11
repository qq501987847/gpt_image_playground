import { describe, expect, it } from 'vitest'
import { getModelBrand } from './modelBrand'

describe('model brand', () => {
  it('uses Nano Banana only for the two supported Gemini image models', () => {
    expect(getModelBrand('gemini-3-pro-image-preview')).toBe('nano-banana')
    expect(getModelBrand('gemini-3.1-flash-image-preview')).toBe('nano-banana')
    expect(getModelBrand('gemini-3-flash-preview')).toBe('gemini')
  })

  it('recognizes common model families without guessing unknown brands', () => {
    expect(getModelBrand('grok-4.5')).toBe('grok')
    expect(getModelBrand('gpt-image-2')).toBe('openai')
    expect(getModelBrand('o4-mini')).toBe('openai')
    expect(getModelBrand('claude-sonnet-4')).toBe('claude')
    expect(getModelBrand('deepseek-v3')).toBe('deepseek')
    expect(getModelBrand('qwen-image')).toBe('qwen')
    expect(getModelBrand('flux-1.1-pro')).toBe('flux')
    expect(getModelBrand('custom-image-model')).toBeNull()
  })
})
