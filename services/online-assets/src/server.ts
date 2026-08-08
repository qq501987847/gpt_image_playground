import { createServer } from 'node:http'

import { S3Client } from '@aws-sdk/client-s3'
import { Pool } from 'pg'

import { createHttpHandler } from './app.js'
import { Sub2ApiIdentityVerifier } from './auth.js'
import { loadServiceConfig } from './config.js'
import { AssetService } from './domain.js'
import { PostgresAssetRepository } from './postgres.js'
import { S3ObjectStore } from './s3.js'

const config = loadServiceConfig()
const repository = new PostgresAssetRepository(new Pool({ connectionString: config.databaseUrl }))
const objects = new S3ObjectStore(new S3Client({
  region: config.s3Region,
  endpoint: config.s3Endpoint,
  forcePathStyle: config.s3ForcePathStyle,
  credentials: config.s3Credentials,
}), config.s3Bucket)
const service = new AssetService(repository, objects)
const handler = createHttpHandler(
  service,
  new Sub2ApiIdentityVerifier(config.sub2ApiOrigins),
  config.webOrigins,
)
const server = createServer(handler)

server.listen(config.port, () => console.log(`AWAI online assets listening on ${config.port}`))
const cleanupTimer = setInterval(() => void service.cleanup().catch((error) => console.error('asset cleanup failed', error)), 60 * 60 * 1000)
cleanupTimer.unref()
