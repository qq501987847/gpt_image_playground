import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REQUIRED_PATHS = [
  'package.json',
  'package-lock.json',
  'LICENSE',
  'services/online-assets/Dockerfile',
  'services/online-assets/tsconfig.json',
  'services/online-assets/src/server.ts',
  'services/online-assets/dist/server.js',
  'services/online-assets/migrations/001_temporary_assets.sql',
]

export async function verifyOnlineAssetRelease(root) {
  for (const path of REQUIRED_PATHS) {
    try {
      await access(resolve(root, path))
    } catch {
      throw new Error(`在线素材发布包缺少 ${path}`)
    }
  }
  const dockerfile = await readFile(resolve(root, 'services/online-assets/Dockerfile'), 'utf8')
  if (!dockerfile.includes('COPY services/online-assets ./services/online-assets')) {
    throw new Error('在线素材 Dockerfile 与发布包目录结构不匹配')
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyOnlineAssetRelease(process.argv[2] || '.')
    .then(() => console.log('AWAI online asset release package verified'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
