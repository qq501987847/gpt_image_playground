import { createServer } from 'node:http'

import { S3Client } from '@aws-sdk/client-s3'
import { Pool } from 'pg'

import { createHttpHandler } from './app.js'
import { Sub2ApiIdentityVerifier } from './auth.js'
import { AssetService } from './domain.js'
import { PostgresAssetRepository } from './postgres.js'
import { S3ObjectStore } from './s3.js'

function listEnv(name: string) {
  return (process.env[name] ?? '').split(',').map((value) => value.trim()).filter(Boolean)
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`缺少环境变量 ${name}`)
  return value
}

const repository = new PostgresAssetRepository(new Pool({ connectionString: requiredEnv('DATABASE_URL') }))
const objects = new S3ObjectStore(new S3Client({
  region: process.env.S3_REGION ?? 'auto',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  } : undefined,
}), requiredEnv('S3_BUCKET'))
const service = new AssetService(repository, objects)
const handler = createHttpHandler(
  service,
  new Sub2ApiIdentityVerifier(listEnv('AWAI_SUB2API_ALLOWED_ORIGINS')),
  listEnv('AWAI_WEB_ALLOWED_ORIGINS'),
)
const server = createServer(handler)
const port = Number(process.env.PORT ?? 8788)

server.listen(port, () => console.log(`AWAI online assets listening on ${port}`))
const cleanupTimer = setInterval(() => void service.cleanup().catch((error) => console.error('asset cleanup failed', error)), 60 * 60 * 1000)
cleanupTimer.unref()
