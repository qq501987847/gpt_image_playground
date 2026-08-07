import { randomUUID } from 'node:crypto'

import type { AssetFile, AssetIdentity, AssetRecord, AssetRepository, ObjectStore } from './types.js'

export const MAX_ORIGINAL_BYTES = 30 * 1024 * 1024
export const MAX_USER_BYTES = 1024 * 1024 * 1024
export const RETENTION_MS = 24 * 60 * 60 * 1000
export const UPLOAD_URL_SECONDS = 10 * 60

export class AssetError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

interface FileDeclaration {
  bytes: number
  mediaType: string
}

export interface InitializeAssetInput {
  taskId: string
  original: FileDeclaration
  thumbnail?: FileDeclaration
}

function validateFile(file: FileDeclaration, kind: 'original' | 'thumbnail') {
  if (!Number.isInteger(file.bytes) || file.bytes <= 0) throw new AssetError('invalid_file', '文件大小无效')
  if (!/^image\/[a-z0-9.+-]+$/i.test(file.mediaType)) throw new AssetError('invalid_media_type', '只允许图片媒体类型')
  if (kind === 'original' && file.bytes > MAX_ORIGINAL_BYTES) throw new AssetError('original_too_large', '原图超过 30 MB 上限', 413)
}

export class AssetService {
  constructor(
    private repository: AssetRepository,
    private objects: ObjectStore,
    private now = () => new Date(),
    private createId = randomUUID,
  ) {}

  async initialize(identity: AssetIdentity, input: InitializeAssetInput) {
    if (!input.taskId?.trim()) throw new AssetError('invalid_task', '任务 ID 无效')
    validateFile(input.original, 'original')
    if (input.thumbnail) validateFile(input.thumbnail, 'thumbnail')
    const declaredBytes = input.original.bytes + (input.thumbnail?.bytes ?? 0)
    const usedBytes = await this.repository.getConfirmedBytes(identity.sourceOrigin, identity.userId, this.now())
    if (usedBytes + declaredBytes > MAX_USER_BYTES) throw new AssetError('quota_exceeded', '云端临时空间已达到 1 GB 上限', 409)

    const createdAt = this.now()
    const id = this.createId()
    const prefix = `temporary/${id}`
    const record: AssetRecord = {
      id,
      ...identity,
      taskId: input.taskId,
      original: { kind: 'original', objectKey: `${prefix}/original`, ...input.original },
      thumbnail: input.thumbnail ? { kind: 'thumbnail', objectKey: `${prefix}/thumbnail`, ...input.thumbnail } : undefined,
      status: 'initialized',
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(createdAt.getTime() + RETENTION_MS),
    }
    await this.repository.create(record)
    const files = [record.original, ...(record.thumbnail ? [record.thumbnail] : [])]
    const uploads = await Promise.all(files.map(async (file) => ({
      kind: file.kind,
      objectKey: file.objectKey,
      mediaType: file.mediaType,
      url: await this.objects.createUploadUrl(file, UPLOAD_URL_SECONDS),
    })))
    return { record, uploads }
  }

  async confirm(identity: AssetIdentity, id: string) {
    return this.repository.withUserLock(identity.sourceOrigin, identity.userId, async () => {
      const record = await this.requireOwned(identity, id)
      if (record.status === 'available') return record
      const files = [record.original, ...(record.thumbnail ? [record.thumbnail] : [])]
      const actualFiles: AssetFile[] = []
      for (const file of files) {
        const actual = await this.objects.stat(file.objectKey)
        if (!actual || actual.bytes !== file.bytes || actual.mediaType !== file.mediaType) {
          throw new AssetError('object_mismatch', '上传对象的大小或媒体类型与声明不一致', 409)
        }
        if (file.kind === 'original' && actual.bytes > MAX_ORIGINAL_BYTES) throw new AssetError('original_too_large', '原图超过 30 MB 上限', 413)
        actualFiles.push({ ...file, ...actual })
      }
      const usedBytes = await this.repository.getConfirmedBytes(identity.sourceOrigin, identity.userId, this.now())
      const incomingBytes = actualFiles.reduce((total, file) => total + file.bytes, 0)
      if (usedBytes + incomingBytes > MAX_USER_BYTES) throw new AssetError('quota_exceeded', '云端临时空间已达到 1 GB 上限', 409)
      return this.repository.markAvailable(id, actualFiles, this.now())
    })
  }

  async list(identity: AssetIdentity) {
    const records = await this.repository.listOwned(identity.sourceOrigin, identity.userId, this.now())
    return Promise.all(records.map(async (record) => ({
      record,
      downloads: {
        original: await this.objects.createDownloadUrl(record.original, UPLOAD_URL_SECONDS),
        ...(record.thumbnail ? { thumbnail: await this.objects.createDownloadUrl(record.thumbnail, UPLOAD_URL_SECONDS) } : {}),
      },
    })))
  }

  async delete(identity: AssetIdentity, id: string) {
    const record = await this.requireOwned(identity, id)
    await this.objects.remove([record.original.objectKey, ...(record.thumbnail ? [record.thumbnail.objectKey] : [])])
    await this.repository.remove(record.id)
  }

  async cleanup() {
    const now = this.now()
    const records = await this.repository.listForCleanup(now, new Date(now.getTime() - UPLOAD_URL_SECONDS * 1000))
    for (const record of records) {
      await this.objects.remove([record.original.objectKey, ...(record.thumbnail ? [record.thumbnail.objectKey] : [])])
      await this.repository.remove(record.id)
    }
    return records.length
  }

  private async requireOwned(identity: AssetIdentity, id: string) {
    const record = await this.repository.getOwned(id, identity.sourceOrigin, identity.userId)
    if (!record) throw new AssetError('not_found', '云端副本不存在', 404)
    return record
  }
}
