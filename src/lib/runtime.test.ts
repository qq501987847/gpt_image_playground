import { describe, expect, it } from 'vitest'
import { stripCredentialPlaintext } from './runtime'

describe('桌面运行时凭据持久化', () => {
  it('递归清除配置中的 Key 明文并保留凭据 ID', () => {
    const value = stripCredentialPlaintext(JSON.stringify({
      state: {
        settings: {
          apiKey: 'root-secret',
          profiles: [
            { id: 'text', keyId: 'credential-1', apiKey: 'text-secret' },
            { id: 'image', keyId: 'credential-1', apiKey: 'image-secret' },
          ],
        },
      },
    }))

    expect(JSON.parse(value)).toEqual({
      state: {
        settings: {
          apiKey: '',
          profiles: [
            { id: 'text', keyId: 'credential-1', apiKey: '' },
            { id: 'image', keyId: 'credential-1', apiKey: '' },
          ],
        },
      },
    })
    expect(value).not.toContain('secret')
  })
})
