import { describe, expect, it, vi } from 'vitest'

import { Sub2ApiIdentityVerifier } from './auth.js'

describe('Sub2API identity verifier', () => {
  it('rejects unknown origins before sending the menu JWT', async () => {
    const request = vi.fn<typeof fetch>()
    const verifier = new Sub2ApiIdentityVerifier(['https://sub.example'], request)
    await expect(verifier.verify('https://evil.example', 'menu-jwt')).rejects.toMatchObject({ code: 'origin_rejected' })
    expect(request).not.toHaveBeenCalled()
  })

  it('uses only the menu JWT to verify the user profile', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { id: 'user-1' } }), { status: 200 }))
    const verifier = new Sub2ApiIdentityVerifier(['https://sub.example'], request)
    await expect(verifier.verify('https://sub.example', 'menu-jwt')).resolves.toEqual({ userId: 'user-1' })
    expect(request).toHaveBeenCalledWith('https://sub.example/api/v1/user/profile', {
      headers: { Authorization: 'Bearer menu-jwt', Accept: 'application/json' },
      redirect: 'error',
    })
    expect(JSON.stringify(request.mock.calls)).not.toContain('api-key')
  })
})
