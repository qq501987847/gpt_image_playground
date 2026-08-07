import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./sub2apiSession', () => ({
  getSub2ApiSession: () => ({
    status: 'ready',
    context: { token: 'menu-jwt', origin: 'https://sub.example' },
  }),
}))

function response(body: unknown, status = 200) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const initialized = (id = 'asset-1', upload = 'https://objects.example/upload') => ({
  asset: { id, expiresAt: '2026-08-09T00:00:00.000Z' },
  uploads: [{ kind: 'original', url: upload, mediaType: 'image/png' }],
})

describe('cloud asset upload client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_AWAI_ASSET_SERVICE_URL', 'https://assets.example')
  })

  it('retries the same object upload twice and preserves a local-only result after final failure', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(initialized(), 201))
      .mockResolvedValue(response(null, 500))
    vi.stubGlobal('fetch', request)
    const { uploadCloudAsset } = await import('./cloudAssets')
    const result = await uploadCloudAsset('task-1', 'image-1', 'data:image/png;base64,AQID')

    expect(result).toMatchObject({ imageId: 'image-1', status: 'local-only' })
    expect(request.mock.calls.filter(([url]) => url === 'https://objects.example/upload')).toHaveLength(3)
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('/v1/assets'))).toHaveLength(1)
  })

  it('retries confirmation only after a successful PUT', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(initialized(), 201))
      .mockResolvedValueOnce(response(null, 200))
      .mockResolvedValueOnce(response({ error: { message: 'temporary' } }, 500))
      .mockResolvedValueOnce(response({ error: { message: 'temporary' } }, 500))
      .mockResolvedValueOnce(response({ asset: { id: 'asset-1' } }, 200))
    vi.stubGlobal('fetch', request)
    const { uploadCloudAsset } = await import('./cloudAssets')
    await expect(uploadCloudAsset('task-1', 'image-1', 'data:image/png;base64,AQID')).resolves.toMatchObject({
      id: 'asset-1',
      status: 'available',
      expiresAt: '2026-08-09T00:00:00.000Z',
    })
    expect(request.mock.calls.filter(([url]) => url === 'https://objects.example/upload')).toHaveLength(1)
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('/confirm'))).toHaveLength(3)
  })

  it('recovers an expired signed URL through one new initialization without model work', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(initialized('asset-1', 'https://objects.example/expired'), 201))
      .mockResolvedValueOnce(response(null, 403))
      .mockResolvedValueOnce(response(null, 403))
      .mockResolvedValueOnce(response(null, 403))
      .mockResolvedValueOnce(response(initialized('asset-2', 'https://objects.example/fresh'), 201))
      .mockResolvedValueOnce(response(null, 200))
      .mockResolvedValueOnce(response({ asset: { id: 'asset-2' } }, 200))
    vi.stubGlobal('fetch', request)
    const { uploadCloudAsset } = await import('./cloudAssets')
    const result = await uploadCloudAsset('task-1', 'image-1', 'data:image/png;base64,AQID')

    expect(result).toMatchObject({ id: 'asset-2', status: 'available' })
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('/v1/assets'))).toHaveLength(2)
    const initBody = JSON.parse(String((request.mock.calls[0][1] as RequestInit).body))
    expect(initBody).toEqual({ taskId: 'task-1', original: { bytes: 3, mediaType: 'image/png' } })
    expect(JSON.stringify(request.mock.calls)).not.toContain('reference')
    expect(JSON.stringify(request.mock.calls)).not.toContain('mask')
  })
})
