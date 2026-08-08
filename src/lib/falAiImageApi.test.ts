import { fal } from '@fal-ai/client'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { createDefaultFalProfile, DEFAULT_FAL_BASE_URL, DEFAULT_SETTINGS } from './apiProfiles'
import { callFalAiImageApi, getFalQueuedImageResult } from './falAiImageApi'

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
    queue: {
      subscribeToStatus: vi.fn(),
      result: vi.fn(),
    },
  },
}))

const falMock = fal as unknown as {
  config: Mock
  subscribe: Mock
  queue: {
    subscribeToStatus: Mock
    result: Mock
  }
}

describe('callFalAiImageApi', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses the default fal endpoint without proxyUrl', async () => {
    falMock.subscribe.mockResolvedValue({
      requestId: 'req-1',
      data: { images: [{ b64_json: 'aW1hZ2U=' }] },
    })

    await callFalAiImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    }, createDefaultFalProfile({ apiKey: 'fal-key', baseUrl: DEFAULT_FAL_BASE_URL }))

    expect(falMock.config).toHaveBeenCalledWith({
      credentials: 'fal-key',
      suppressLocalCredentialsWarning: true,
    })
  })

  it('passes custom fal API URL to the SDK proxyUrl option', async () => {
    falMock.subscribe.mockResolvedValue({
      requestId: 'req-1',
      data: { images: [{ b64_json: 'aW1hZ2U=' }] },
    })

    await callFalAiImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    }, createDefaultFalProfile({
      apiKey: 'fal-key',
      baseUrl: 'https://fal-proxy.example.com/api/fal/',
    }))

    expect(falMock.config).toHaveBeenCalledWith({
      credentials: 'fal-key',
      suppressLocalCredentialsWarning: true,
      proxyUrl: 'https://fal-proxy.example.com/api/fal',
    })
  })

  it('recovers an enqueued FAL request without submitting generation again', async () => {
    falMock.queue.subscribeToStatus.mockResolvedValue({ status: 'COMPLETED' })
    falMock.queue.result.mockResolvedValue({ data: { images: [{ b64_json: 'aW1hZ2U=' }] } })
    const profile = createDefaultFalProfile({ apiKey: 'fal-key' })

    await expect(getFalQueuedImageResult(profile, 'openai/gpt-image-2', 'req-1', { ...DEFAULT_PARAMS })).resolves.toMatchObject({
      images: ['data:image/png;base64,aW1hZ2U='],
    })
    expect(falMock.queue.subscribeToStatus).toHaveBeenCalledWith('openai/gpt-image-2', { requestId: 'req-1', logs: true })
    expect(falMock.queue.result).toHaveBeenCalledWith('openai/gpt-image-2', { requestId: 'req-1' })
    expect(falMock.subscribe).not.toHaveBeenCalled()
  })
})
