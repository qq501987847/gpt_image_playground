import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverSub2ApiModels, getSub2ApiImageBillingTier, getSub2ApiKeyLabel, isSub2ApiKeyUsable, loadSub2ApiIdentity, readKeyBinding, writeKeyBinding } from './sub2api'

describe('Sub2API identity and key bindings', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the Sub2API group before the Key name', () => {
    expect(getSub2ApiKeyLabel({ id: '100', name: '主 Key', group: 'OpenAI' })).toBe('OpenAI · 主 Key')
    expect(getSub2ApiKeyLabel({ id: '101', name: '', group: '' })).toBe('101')
  })

  it('matches Sub2API longest-edge image billing tiers', () => {
    expect(getSub2ApiImageBillingTier('1024x1024')).toBe('1K')
    expect(getSub2ApiImageBillingTier('720x1280')).toBe('2K')
    expect(getSub2ApiImageBillingTier('2048x1152')).toBe('2K')
    expect(getSub2ApiImageBillingTier('2160x3840')).toBe('4K')
    expect(getSub2ApiImageBillingTier('auto')).toBeNull()
  })

  it('loads profile and full keys with the menu JWT', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 1, username: 'Wei' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { items: [{ id: 100, key: 'secret', group: { id: 2, name: 'Pro' }, quota: 10, quota_used: 3, status: 'active' }], pages: 2 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { items: [{ id: 101, key: 'second', group: { id: 3, name: 'Gemini' }, quota: 0, quota_used: 0, status: 'active' }], pages: 2 } })))
    const result = await loadSub2ApiIdentity({ userId: '1', token: 'jwt', origin: 'https://sub.example', theme: null, lang: null, uiMode: null, srcUrl: null })
    expect(result).toMatchObject({ user: { id: '1', name: 'Wei' }, keys: [
      { id: '100', value: 'secret', group: 'Pro', remaining: 7 },
      { id: '101', value: 'second', group: 'Gemini' },
    ] })
    expect(fetchMock.mock.calls.map((call) => call[0])).toContain('https://sub.example/api/v1/keys?page=2&page_size=1000')
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
