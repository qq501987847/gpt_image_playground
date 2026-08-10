import { createServer } from 'node:http'

import { S3Client } from '@aws-sdk/client-s3'
import { Pool } from 'pg'

import { createHttpHandler } from './app.js'
import { Sub2ApiIdentityVerifier } from './auth.js'
import { loadServiceConfig } from './config.js'
import { AssetService } from './domain.js'
import { runMigrations } from './migrations.js'
import { PostgresAssetRepository } from './postgres.js'
import { createReadinessCheck } from './readiness.js'
import { S3ObjectStore } from './s3.js'

const config = loadServiceConfig()
const pool = new Pool({ connectionString: config.databaseUrl })
const s3 = new S3Client({
  region: config.s3Region,
  endpoint: config.s3Endpoint,
  forcePathStyle: config.s3ForcePathStyle,
  credentials: config.s3Credentials,
})
const repository = new PostgresAssetRepository(pool)
const objects = new S3ObjectStore(s3, config.s3Bucket)
const service = new AssetService(repository, objects)
const handler = createHttpHandler(
  service,
  new Sub2ApiIdentityVerifier(config.sub2ApiOrigins),
  config.webOrigins,
  createReadinessCheck(pool, s3, config.s3Bucket),
)
const server = createServer(handler)

async function start() {
  await runMigrations(pool)
  server.listen(config.port, () => console.log(`AWAI online assets listening on ${config.port}`))
  const cleanupTimer = setInterval(() => void service.cleanup().catch((error) => console.error('asset cleanup failed', error)), 60 * 60 * 1000)
  cleanupTimer.unref()
}

void start().catch(async (error) => {
  console.error('AWAI online assets failed to start', error)
  await pool.end().catch(() => undefined)
  s3.destroy()
  process.exitCode = 1
})
