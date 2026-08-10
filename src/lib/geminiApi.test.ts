import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { createDefaultGeminiProfile, DEFAULT_SETTINGS } from './apiProfiles'
import { buildGeminiRequest, callGeminiImageApi, parseGeminiResponse } from './geminiApi'

describe('Gemini native image API', () => {
  afterEach(() => vi.restoreAllMocks())

  it('omits automatic ratio and resolution fields', () => {
    expect(buildGeminiRequest('draw', { ...DEFAULT_PARAMS, geminiAspectRatio: 'auto', geminiImageSize: 'auto' }, [])).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'draw' }] }],
    })
  })

  it('serializes references and native image options without OpenAI-only fields', () => {
    const body = buildGeminiRequest('edit', { ...DEFAULT_PARAMS, geminiAspectRatio: '16:9', geminiImageSize: '2K' }, ['data:image/png;base64,aW1hZ2U='])
    expect(body).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'edit' }, { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }] }],
      generationConfig: { imageConfig: { aspectRatio: '16:9', imageSize: '2K' } },
    })
    expect(JSON.stringify(body)).not.toMatch(/mask|quality|moderation|transparent|compression|\"n\"/)
  })

  it('extracts images and companion text from every candidate', () => {
    expect(parseGeminiResponse({ candidates: [
      { content: { parts: [{ text: 'first' }, { inlineData: { mimeType: 'image/png', data: 'one' } }] } },
      { content: { parts: [{ text: 'second' }, { inlineData: { mimeType: 'image/jpeg', data: 'two' } }] } },
    ] })).toMatchObject({
      images: ['data:image/png;base64,one', 'data:image/jpeg;base64,two'],
      revisedPrompts: ['first\nsecond', 'first\nsecond'],
    })
  })

  it('uses the configured Sub2API origin and surfaces upstream errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 }))
    const profile = createDefaultGeminiProfile({ baseUrl: 'https://sub2api.example/', apiKey: 'key', model: 'gemini-3-pro-image-preview' })
    await expect(callGeminiImageApi({ settings: DEFAULT_SETTINGS, prompt: 'draw', params: DEFAULT_PARAMS, inputImageDataUrls: [] }, profile)).rejects.toThrow('quota')
    expect(fetchMock.mock.calls[0][0]).toBe('https://sub2api.example/v1beta/models/gemini-3-pro-image-preview:generateContent')
  })

  it('uses app-level output count to issue concurrent single-image requests', async () => {
    let requestCount = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      requestCount++
      expect(JSON.parse(String(init?.body))).not.toHaveProperty('n')
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: `image-${requestCount}` } }] } }] }))
    })
    const profile = createDefaultGeminiProfile({ baseUrl: 'https://sub2api.example/', apiKey: 'key', model: 'gemini-3-pro-image-preview' })

    await expect(callGeminiImageApi({ settings: DEFAULT_SETTINGS, prompt: 'draw', params: { ...DEFAULT_PARAMS, n: 3 }, inputImageDataUrls: [] }, profile)).resolves.toMatchObject({
      images: ['data:image/png;base64,image-1', 'data:image/png;base64,image-2', 'data:image/png;base64,image-3'],
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
