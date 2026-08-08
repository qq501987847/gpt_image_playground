import { describe, expect, it, vi } from 'vitest'

import { runLiveSmoke } from './liveSmoke.mjs'

const env = {
  AWAI_SMOKE_CONFIRM_CHARGES: 'I_ACCEPT_MODEL_CHARGES',
  AWAI_SMOKE_WEB_ORIGIN: 'https://awai.example',
  AWAI_SMOKE_ASSET_SERVICE_ORIGIN: 'https://assets.example',
  AWAI_SMOKE_SUB2API_ORIGIN: 'https://sub.example',
  AWAI_SMOKE_MENU_JWT: 'menu-jwt',
  AWAI_SMOKE_USER_ID: 'user-1',
  AWAI_SMOKE_GATEWAY_KEY: 'gateway-key',
  AWAI_SMOKE_EXPECTED_VERSION: '0.1.0',
  AWAI_SMOKE_OPENAI_IMAGE_MODEL: 'gpt-image-2',
  AWAI_SMOKE_RESPONSES_MODEL: 'gpt-5',
  AWAI_SMOKE_GEMINI_MODEL: 'gemini-3.1-flash-image-preview',
}

describe('live release smoke', () => {
  it('requires explicit charge confirmation before making any request', async () => {
    const request = vi.fn()
    await expect(runLiveSmoke({ ...env, AWAI_SMOKE_CONFIRM_CHARGES: '' }, request)).rejects.toThrow('确认模型冒烟费用')
    expect(request).not.toHaveBeenCalled()
  })

  it('checks deployed Web, service CORS, Sub2API identity/models and all paid protocol paths', async () => {
    const bodies = [
      '<title>AWAI创作工作台</title>',
      { version: '0.1.0' },
      { status: 'ok' },
      { data: { id: 'user-1' } },
      { data: { items: [{ id: 'key-1' }] } },
      null,
      { data: [{ id: 'gpt-image-2' }, { id: 'gpt-5' }] },
      { models: [{ name: 'gemini-3.1-flash-image-preview' }] },
      { data: [{ b64_json: 'image' }] },
      { output: [{ content: [{ type: 'output_text', text: 'AWAI_OK' }] }] },
      { candidates: [{ content: { parts: [{ inlineData: { data: 'image' } }] } }] },
    ]
    const request = vi.fn(async (url) => {
      const body = bodies.shift()
      const approvedCors = String(url).includes('/healthz') || String(url).startsWith('https://sub.example') && body !== null
      const headers = approvedCors ? { 'access-control-allow-origin': 'https://awai.example' } : undefined
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers })
    })
    await expect(runLiveSmoke(env, request)).resolves.toHaveLength(11)
    expect(request).toHaveBeenCalledTimes(11)
    expect(request.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      'https://sub.example/v1/images/generations',
      'https://sub.example/v1/responses',
      'https://sub.example/v1beta/models/gemini-3.1-flash-image-preview:generateContent',
    ]))
  })

  it('rejects an empty Key list before any billable request', async () => {
    const bodies = [
      '<title>AWAI创作工作台</title>',
      { version: '0.1.0' },
      { status: 'ok' },
      { data: { id: 'user-1' } },
      { data: [] },
    ]
    const request = vi.fn(async () => new Response(JSON.stringify(bodies.shift()), {
      status: 200,
      headers: { 'access-control-allow-origin': 'https://awai.example' },
    }))
    await expect(runLiveSmoke(env, request)).rejects.toThrow('Key 列表为空')
    expect(request).toHaveBeenCalledTimes(5)
  })
})
