import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import type { AssetFile, ObjectStore } from './types.js'

export class S3ObjectStore implements ObjectStore {
  constructor(private client: S3Client, private bucket: string) {}

  createUploadUrl(file: AssetFile, validSeconds: number) {
    return getSignedUrl(this.client, new PutObjectCommand({
      Bucket: this.bucket,
      Key: file.objectKey,
      ContentLength: file.bytes,
      ContentType: file.mediaType,
    }), { expiresIn: validSeconds })
  }

  createDownloadUrl(file: AssetFile, validSeconds: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: file.objectKey }), { expiresIn: validSeconds })
  }

  async stat(objectKey: string) {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }))
      if (result.ContentLength == null || !result.ContentType) return null
      return { bytes: result.ContentLength, mediaType: result.ContentType.split(';')[0].trim() }
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null
      throw error
    }
  }

  async remove(objectKeys: string[]) {
    await Promise.all(objectKeys.map((Key) => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key }))))
  }
}
