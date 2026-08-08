import { readFile } from 'node:fs/promises'

import { GetBucketLifecycleConfigurationCommand, S3Client } from '@aws-sdk/client-s3'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AssetService, RETENTION_MS, UPLOAD_URL_SECONDS } from './domain.js'
import { PostgresAssetRepository } from './postgres.js'
import { S3ObjectStore } from './s3.js'

const enabled = process.env.AWAI_INTEGRATION_TEST === '1'
const databaseUrl = process.env.AWAI_TEST_DATABASE_URL ?? 'postgresql://awai:awai-test@127.0.0.1:55432/awai'
const s3Endpoint = process.env.AWAI_TEST_S3_ENDPOINT ?? 'http://127.0.0.1:59000'
const bucket = 'awai-assets'
const pool = new Pool({ connectionString: databaseUrl })
const client = new S3Client({
  region: 'us-east-1',
  endpoint: s3Endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId: 'awai-test', secretAccessKey: 'awai-test-secret' },
})

describe.runIf(enabled)('online asset PostgreSQL/S3 integration', () => {
  beforeAll(async () => {
    const migration = await readFile(new URL('../migrations/001_temporary_assets.sql', import.meta.url), 'utf8')
    await pool.query(migration)
    await pool.query('TRUNCATE temporary_assets')
  })

  afterAll(async () => {
    await pool.query('TRUNCATE temporary_assets')
    await pool.end()
    client.destroy()
  })

  it('uses real adapters for direct upload, confirmation, expiry cleanup and quota release', async () => {
    const lifecycle = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))
    expect(lifecycle.Rules?.some((rule) => rule.Expiration?.Days === 1)).toBe(true)

    const repository = new PostgresAssetRepository(pool)
    const objects = new S3ObjectStore(client, bucket)
    const identity = { sourceOrigin: 'https://sub.example', userId: 'integration-user' }
    let now = new Date('2026-08-08T00:00:00.000Z')
    let sequence = 0
    const service = new AssetService(repository, objects, () => now, () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`)
    const input = {
      taskId: 'integration-task',
      original: { bytes: 4, mediaType: 'image/png' },
      thumbnail: { bytes: 3, mediaType: 'image/webp' },
    }

    const initialized = await service.initialize(identity, input)
    expect(initialized.record.expiresAt.getTime()).toBe(now.getTime() + RETENTION_MS)
    for (const upload of initialized.uploads) {
      const bytes = upload.kind === 'original' ? new Uint8Array([1, 2, 3, 4]) : new Uint8Array([5, 6, 7])
      const response = await fetch(upload.url, { method: 'PUT', headers: { 'content-type': upload.mediaType }, body: bytes })
      expect(response.ok).toBe(true)
    }
    await service.confirm(identity, initialized.record.id)
    expect(await repository.getConfirmedBytes(identity.sourceOrigin, identity.userId, now)).toBe(7)
    expect(await service.list(identity)).toHaveLength(1)

    now = new Date(now.getTime() + RETENTION_MS + 1)
    expect(await service.cleanup()).toBe(1)
    expect(await repository.getConfirmedBytes(identity.sourceOrigin, identity.userId, now)).toBe(0)
    expect(await objects.stat(initialized.record.original.objectKey)).toBeNull()

    const abandoned = await service.initialize(identity, input)
    now = new Date(now.getTime() + UPLOAD_URL_SECONDS * 1000 + 1)
    expect(await service.cleanup()).toBe(1)
    expect(await repository.getOwned(abandoned.record.id, identity.sourceOrigin, identity.userId)).toBeNull()
    expect(await service.cleanup()).toBe(0)
  }, 30_000)
})
