import { describe, expect, it } from 'vitest'
import { bootstrapIframeContext } from './iframeBootstrap'

describe('iframe bootstrap', () => {
  it('accepts an exact allowed HTTPS origin, stores its token, and removes it from the URL', () => {
    const urls: string[] = []
    const storage = new Map<string, string>()
    const context = bootstrapIframeContext(new URL('https://awai.example/?user_id=u1&token=jwt&src_host=https%3A%2F%2Fsub2api.example&theme=dark&lang=zh&ui_mode=embed'), {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    }, ['https://sub2api.example'], (url) => urls.push(url))
    expect(context).toMatchObject({ userId: 'u1', token: 'jwt', origin: 'https://sub2api.example', theme: 'dark', lang: 'zh', uiMode: 'embed' })
    expect(storage.get('awai-sub2api-token:https%3A%2F%2Fsub2api.example:u1')).toBe('jwt')
    expect(urls).toEqual(['/?user_id=u1&src_host=https%3A%2F%2Fsub2api.example&theme=dark&lang=zh&ui_mode=embed'])
  })

  it('rejects a non-HTTPS or unapproved origin before storing credentials', () => {
    const storage = new Map<string, string>()
    const urls: string[] = []
    const session = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    }
    expect(bootstrapIframeContext(
      new URL('https://awai.example/?user_id=u1&token=jwt&src_host=http%3A%2F%2Fsub2api.example'),
      session,
      ['https://sub2api.example'],
      (url) => urls.push(url),
    )).toBeNull()
    expect(storage.size).toBe(0)
    expect(urls).toEqual(['/?user_id=u1&src_host=http%3A%2F%2Fsub2api.example'])
  })

  it('accepts only the exact configured loopback HTTP origin for local development', () => {
    const storage = new Map<string, string>()
    const session = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    }
    const context = bootstrapIframeContext(
      new URL('http://127.0.0.1:5173/?user_id=u1&token=jwt&src_host=http%3A%2F%2F127.0.0.1%3A8080'),
      session,
      [],
      () => undefined,
      'http://127.0.0.1:8080',
    )

    expect(context).toMatchObject({ userId: 'u1', origin: 'http://127.0.0.1:8080' })
    expect(bootstrapIframeContext(
      new URL('http://127.0.0.1:5173/?user_id=u1&token=jwt&src_host=http%3A%2F%2Flocalhost%3A8080'),
      session,
      [],
      () => undefined,
      'http://127.0.0.1:8080',
    )).toBeNull()
    expect(bootstrapIframeContext(
      new URL('http://127.0.0.1:5173/?user_id=u1&token=jwt&src_host=http%3A%2F%2F192.168.1.10%3A8080'),
      session,
      [],
      () => undefined,
      'http://192.168.1.10:8080',
    )).toBeNull()
  })

  it('reuses the session token after it has been removed from the URL', () => {
    const storage = new Map([['awai-sub2api-token:https%3A%2F%2Fsub2api.example:u1', 'session-jwt']])
    const context = bootstrapIframeContext(new URL('https://awai.example/?user_id=u1&src_host=https%3A%2F%2Fsub2api.example&src_url=%2Fmenu'), {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    }, ['https://sub2api.example'])

    expect(context).toMatchObject({ token: 'session-jwt', srcUrl: '/menu' })
  })

  it('does not reuse a session token across origins or users', () => {
    const storage = new Map([['awai-sub2api-token:https%3A%2F%2Fsub2api.example:u1', 'session-jwt']])
    const session = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    }

    expect(bootstrapIframeContext(
      new URL('https://awai.example/?user_id=u2&src_host=https%3A%2F%2Fsub2api.example'),
      session,
      ['https://sub2api.example'],
    )).toBeNull()
    expect(bootstrapIframeContext(
      new URL('https://awai.example/?user_id=u1&src_host=https%3A%2F%2Fother.example'),
      session,
      ['https://sub2api.example', 'https://other.example'],
    )).toBeNull()
  })
})
