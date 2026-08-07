import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverSub2ApiModels, isSub2ApiKeyUsable, loadSub2ApiIdentity, readKeyBinding, writeKeyBinding } from './sub2api'

describe('Sub2API identity and key bindings', () => {
  afterEach(() => vi.restoreAllMocks())

  it('loads profile and full keys with the menu JWT', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'u1', username: 'Wei' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'k1', key: 'secret', group: 'pro', status: 'active' }] })))
    const result = await loadSub2ApiIdentity({ userId: 'u1', token: 'jwt', origin: 'https://sub.example', theme: null, lang: null, uiMode: null, srcUrl: null })
    expect(result).toMatchObject({ user: { id: 'u1', name: 'Wei' }, keys: [{ id: 'k1', value: 'secret', group: 'pro' }] })
    expect(fetchMock.mock.calls.every((call) => (call[1] as RequestInit).headers && ((call[1] as RequestInit).headers as Record<string, string>).Authorization === 'Bearer jwt')).toBe(true)
  })

  it('discovers models independently through the protocol endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ models: [{ name: 'models/gemini-3-pro-image-preview' }] })))
    await expect(discoverSub2ApiModels('https://sub.example', { id: 'k1', name: '', value: 'secret', group: '', status: 'active' }, 'gemini')).resolves.toEqual(['gemini-3-pro-image-preview'])
    expect(fetchMock.mock.calls[0][0]).toBe('https://sub.example/v1beta/models')
  })

  it('marks disabled, expired, and exhausted keys unusable', () => {
    const base = { id: 'k1', name: '', value: 'secret', group: '', status: 'active' }
    expect(isSub2ApiKeyUsable(base)).toBe(true)
    expect(isSub2ApiKeyUsable({ ...base, status: 'disabled' })).toBe(false)
    expect(isSub2ApiKeyUsable({ ...base, expiresAt: '2020-01-01T00:00:00Z' })).toBe(false)
    expect(isSub2ApiKeyUsable({ ...base, remaining: 0 })).toBe(false)
  })

  it('persists only the key id under origin, user, and profile', async () => {
    const values = new Map<string, string>()
    const metadata = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => void values.set(key, value),
      removeItem: async (key: string) => void values.delete(key),
    }
    const runtime = { metadata } as never
    const context = { origin: 'https://sub.example', userId: 'u1' }
    await writeKeyBinding(runtime, context, 'profile-1', 'key-id')
    expect([...values.values()]).toEqual(['key-id'])
    await expect(readKeyBinding(runtime, context, 'profile-1')).resolves.toBe('key-id')
  })
})
