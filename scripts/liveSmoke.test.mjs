import { describe, expect, it, vi } from 'vitest'

import { runLiveSmoke } from './liveSmoke.mjs'

const env = {
  AWAI_SMOKE_CONFIRM_CHARGES: 'I_ACCEPT_MODEL_CHARGES',
  AWAI_SMOKE_WEB_ORIGIN: 'https://awai.example',
  AWAI_SMOKE_ASSET_SERVICE_ORIGIN: 'https://assets.example',
  AWAI_SMOKE_SUB2API_ORIGIN: 'https://sub.example',
  AWAI_SMOKE_MENU_JWT: 'menu-jwt',
  AWAI_SMOKE_USER_ID: 'user-1',
  AWAI_SMOKE_KEY_ID: 'key-1',
  AWAI_SMOKE_EXPECTED_VERSION: '0.1.0',
  AWAI_SMOKE_OPENAI_IMAGE_MODEL: 'gpt-image-2',
  AWAI_SMOKE_RESPONSES_MODEL: 'gpt-5',
  AWAI_SMOKE_GEMINI_MODEL: 'gemini-3.1-flash-image-preview',
}

function response(body, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('access-control-allow-origin', 'https://awai.example')
  if (typeof body === 'string' || body instanceof Uint8Array || body == null) return new Response(body, { ...init, headers })
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(body), { ...init, headers })
}

describe('live release smoke', () => {
  it('requires explicit charge confirmation before making any request', async () => {
    const request = vi.fn()
    await expect(runLiveSmoke({ ...env, AWAI_SMOKE_CONFIRM_CHARGES: '' }, request)).rejects.toThrow('确认模型冒烟费用')
    expect(request).not.toHaveBeenCalled()
  })

  it('uses the menu-owned Key for model, Agent, image and cloud-asset paths', async () => {
    let responsesCalls = 0
    const request = vi.fn(async (url, init = {}) => {
      const target = String(url)
      const method = init.method ?? 'GET'
      if (target === 'https://awai.example/') return response('<title>AWAI创作工作台</title>')
      if (target === 'https://awai.example/version.json') return response({ version: '0.1.0' })
      if (target === 'https://assets.example/readyz') return response({ status: 'ready' })
      if (target === 'https://sub.example/api/v1/user/profile' && method === 'GET') return response({ data: { id: 'user-1' } })
      if (target === 'https://sub.example/api/v1/keys?page=1&page_size=1000') return response({ data: { items: [{ id: 'key-1', value: 'menu-derived-key' }] } })
      if (target === 'https://sub.example/api/v1/user/profile' && method === 'OPTIONS') return new Response(null, { status: 403 })
      if (target === 'https://sub.example/v1/models') return response({ data: [{ id: 'gpt-image-2' }, { id: 'gpt-5' }, { id: 'gemini-3.1-flash-image-preview' }] })
      if (target === 'https://sub.example/v1/responses') {
        responsesCalls += 1
        return responsesCalls === 1
          ? response({ id: 'resp-1', output: [{ type: 'function_call', name: 'generate_image_batch', call_id: 'call-1', arguments: '{"prompt":"blue square"}' }] })
          : response({ output: [{ content: [{ type: 'output_text', text: 'AWAI_AGENT_OK' }] }] })
      }
      if (target === 'https://sub.example/v1/images/generations') return response({ data: [{ b64_json: 'image' }] })
      if (target === 'https://sub.example/v1beta/models/gemini-3.1-flash-image-preview:generateContent') {
        return response({ candidates: [{ content: { parts: [{ inlineData: { data: 'image' } }] } }] })
      }
      if (target === 'https://assets.example/v1/assets' && method === 'POST') {
        return response({ asset: { id: 'asset-1' }, uploads: [{ kind: 'original', url: 'https://objects.example/upload' }] }, { status: 201 })
      }
      if (target === 'https://objects.example/upload') return response(null)
      if (target === 'https://assets.example/v1/assets/asset-1/confirm') return response({ asset: { id: 'asset-1', status: 'available' } })
      if (target === 'https://assets.example/v1/assets' && method === 'GET') {
        return response({ assets: [{ id: 'asset-1', downloads: { original: 'https://objects.example/download' } }] })
      }
      if (target === 'https://objects.example/download') return response(new Uint8Array([137, 80, 78, 71]))
      if (target === 'https://assets.example/v1/assets/asset-1' && method === 'DELETE') return response(null, { status: 204 })
      throw new Error(`unexpected request: ${method} ${target}`)
    })

    await expect(runLiveSmoke(env, request)).resolves.toHaveLength(17)
    expect(request).toHaveBeenCalledTimes(17)
    const paidCalls = request.mock.calls.filter(([url]) => [
      '/v1/responses',
      '/v1/images/generations',
      ':generateContent',
    ].some((part) => String(url).includes(part)))
    expect(paidCalls).toHaveLength(4)
    for (const [, init] of paidCalls) expect(init.headers.Authorization).toBe('Bearer menu-derived-key')
    expect(JSON.parse(paidCalls.find(([url]) => String(url).endsWith('/v1/responses'))[1].body)).toMatchObject({
      tools: [{ name: 'generate_image_batch' }],
    })
  })

  it('rejects an empty Key list before any billable request', async () => {
    const bodies = [
      '<title>AWAI创作工作台</title>',
      { version: '0.1.0' },
      { status: 'ready' },
      { data: { id: 'user-1' } },
      { data: [] },
    ]
    const request = vi.fn(async () => response(bodies.shift()))
    await expect(runLiveSmoke(env, request)).rejects.toThrow('Key 列表为空')
    expect(request).toHaveBeenCalledTimes(5)
  })
})
