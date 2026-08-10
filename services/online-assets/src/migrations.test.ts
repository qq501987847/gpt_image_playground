import { describe, expect, it, vi } from 'vitest'

import { runMigrations } from './migrations.js'

describe('online asset migrations', () => {
  it('runs the bundled temporary asset schema before serving traffic', async () => {
    const query = vi.fn(async () => ({ rows: [] }))

    await runMigrations({ query })

    expect(query).toHaveBeenCalledOnce()
    expect(query.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS temporary_assets')
  })
})
