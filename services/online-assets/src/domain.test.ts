import { describe, expect, it } from 'vitest'

import { AssetError, AssetService, MAX_ORIGINAL_BYTES, MAX_USER_BYTES, RETENTION_MS, UPLOAD_URL_SECONDS } from './domain.js'
import type { AssetFile, AssetRecord, AssetRepository, ObjectStore } from './types.js'

class MemoryRepository implements AssetRepository {
  records = new Map<string, AssetRecord>()
  confirmedBytes = 0

  async create(record: AssetRecord) { this.records.set(record.id, record) }
  async getOwned(id: string, sourceOrigin: string, userId: string) {
    const record = this.records.get(id)
    return record?.sourceOrigin === sourceOrigin && record.userId === userId ? record : null
  }
  async listOwned(sourceOrigin: string, userId: string, now: Date) {
    return [...this.records.values()].filter((record) => record.sourceOrigin === sourceOrigin && record.userId === userId && record.status === 'available' && record.expiresAt > now)
  }
  async getConfirmedBytes() { return this.confirmedBytes || [...this.records.values()].filter((record) => record.status === 'available').reduce((total, record) => total + record.original.bytes + (record.thumbnail?.bytes ?? 0), 0) }
  async markAvailable(id: string, files: AssetFile[], confirmedAt: Date) {
    const current = this.records.get(id)!
    const record = {
      ...current,
      original: files.find((file) => file.kind === 'original')!,
      thumbnail: files.find((file) => file.kind === 'thumbnail'),
      status: 'available' as const,
      confirmedAt,
      updatedAt: confirmedAt,
    }
    this.records.set(id, record)
    return record
  }
  async remove(id: string) { this.records.delete(id) }
  async listForCleanup(now: Date, abandonedBefore: Date) {
    return [...this.records.values()].filter((record) => record.expiresAt <= now || (record.status === 'initialized' && record.createdAt <= abandonedBefore))
  }
  async withUserLock<T>(_sourceOrigin: string, _userId: string, action: () => Promise<T>) { return action() }
}

class MemoryObjects implements ObjectStore {
  files = new Map<string, { bytes: number; mediaType: string }>()
  removed: string[][] = []
  uploadValidSeconds: number[] = []

  async createUploadUrl(file: AssetFile, validSeconds: number) {
    this.uploadValidSeconds.push(validSeconds)
    return `https://objects.example/upload/${file.objectKey}`
  }
  async createDownloadUrl(file: AssetFile) { return `https://objects.example/download/${file.objectKey}` }
  async stat(objectKey: string) { return this.files.get(objectKey) ?? null }
  async finalize(file: AssetFile, objectKey: string) {
    const actual = this.files.get(file.objectKey)
    if (!actual) throw new Error('上传对象不存在')
    this.files.set(objectKey, actual)
    return { ...file, ...actual, objectKey }
  }
  async remove(objectKeys: string[]) {
    this.removed.push(objectKeys)
    for (const key of objectKeys) this.files.delete(key)
  }
}

const identity = { sourceOrigin: 'https://sub.example', userId: 'user-1' }
const input = {
  taskId: 'task-1',
  original: { bytes: 100, mediaType: 'image/png' },
  thumbnail: { bytes: 20, mediaType: 'image/webp' },
}

describe('online asset service', () => {
  it('fixes expiry at initialization and signs constrained original and thumbnail uploads for ten minutes', async () => {
    const repository = new MemoryRepository()
    const objects = new MemoryObjects()
    const now = new Date('2026-08-08T00:00:00.000Z')
    const service = new AssetService(repository, objects, () => now, () => 'record-1')
    const result = await service.initialize(identity, input)

    expect(result.record.expiresAt.getTime()).toBe(now.getTime() + RETENTION_MS)
    expect(result.uploads).toEqual([
      expect.objectContaining({ kind: 'original', objectKey: 'temporary/record-1/upload/original' }),
      expect.objectContaining({ kind: 'thumbnail', objectKey: 'temporary/record-1/upload/thumbnail' }),
    ])
    expect(objects.uploadValidSeconds).toEqual([UPLOAD_URL_SECONDS, UPLOAD_URL_SECONDS])
  })

  it('enforces 30 MB and 1 GB limits without deleting existing assets', async () => {
    const repository = new MemoryRepository()
    const objects = new MemoryObjects()
    const service = new AssetService(repository, objects)
    await expect(service.initialize(identity, { ...input, original: { ...input.original, bytes: MAX_ORIGINAL_BYTES + 1 } }))
      .rejects.toMatchObject({ code: 'original_too_large' })
    repository.confirmedBytes = MAX_USER_BYTES - 50
    await expect(service.initialize(identity, input)).rejects.toMatchObject({ code: 'quota_exceeded' })
    expect(objects.removed).toEqual([])
  })

  it('rechecks object metadata and quota before confirmation, then makes duplicate confirmation idempotent', async () => {
    const repository = new MemoryRepository()
    const objects = new MemoryObjects()
    const now = new Date('2026-08-08T00:00:00.000Z')
    const service = new AssetService(repository, objects, () => now, () => 'record-1')
    const initialized = await service.initialize(identity, input)
    objects.files.set(initialized.record.original.objectKey, { bytes: 99, mediaType: 'image/png' })
    objects.files.set(initialized.record.thumbnail!.objectKey, { bytes: 20, mediaType: 'image/webp' })
    await expect(service.confirm(identity, initialized.record.id)).rejects.toMatchObject({ code: 'object_mismatch' })
    objects.files.set(initialized.record.original.objectKey, input.original)
    const confirmed = await service.confirm(identity, initialized.record.id)
    expect(confirmed.status).toBe('available')
    expect(confirmed.original.objectKey).toBe('temporary/record-1/available/original')
    expect(confirmed.thumbnail?.objectKey).toBe('temporary/record-1/available/thumbnail')
    expect(objects.files.has(initialized.record.original.objectKey)).toBe(false)
    await expect(service.confirm(identity, initialized.record.id)).resolves.toEqual(confirmed)
  })

  it('lists exact expiry with downloads and immediately deletes only the owned copy', async () => {
    const repository = new MemoryRepository()
    const objects = new MemoryObjects()
    const service = new AssetService(repository, objects, undefined, () => 'record-1')
    const initialized = await service.initialize(identity, input)
    objects.files.set(initialized.record.original.objectKey, input.original)
    objects.files.set(initialized.record.thumbnail!.objectKey, input.thumbnail)
    await service.confirm(identity, initialized.record.id)
    const listed = await service.list(identity)
    expect(listed[0]).toMatchObject({ downloads: { original: expect.stringContaining('/download/'), thumbnail: expect.stringContaining('/download/') } })
    await service.delete(identity, initialized.record.id)
    expect(repository.records.size).toBe(0)
    expect(objects.removed.at(-1)).toEqual([
      'temporary/record-1/available/original',
      'temporary/record-1/available/thumbnail',
      'temporary/record-1/upload/original',
      'temporary/record-1/upload/thumbnail',
    ])
  })

  it('compensates abandoned and expired records idempotently and releases their quota', async () => {
    const repository = new MemoryRepository()
    const objects = new MemoryObjects()
    let now = new Date('2026-08-08T00:00:00.000Z')
    const service = new AssetService(repository, objects, () => now, () => `record-${repository.records.size + 1}`)
    await service.initialize(identity, input)
    now = new Date(now.getTime() + UPLOAD_URL_SECONDS * 1000 + 1)
    expect(await service.cleanup()).toBe(1)
    expect(await service.cleanup()).toBe(0)
    expect(await repository.getConfirmedBytes()).toBe(0)
  })

  it('rejects access by another verified owner', async () => {
    const repository = new MemoryRepository()
    const objects = new MemoryObjects()
    const service = new AssetService(repository, objects, undefined, () => 'record-1')
    const initialized = await service.initialize(identity, input)
    await expect(service.delete({ ...identity, userId: 'user-2' }, initialized.record.id)).rejects.toBeInstanceOf(AssetError)
  })
})
