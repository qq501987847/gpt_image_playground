import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3'
import type { Pool } from 'pg'

export function createReadinessCheck(pool: Pool, client: S3Client, bucket: string) {
  return async () => {
    const result = await pool.query<{ table_name: string | null }>("SELECT to_regclass('public.temporary_assets')::text AS table_name")
    if (result.rows[0]?.table_name !== 'temporary_assets') throw new Error('temporary_assets schema is unavailable')
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
  }
}
