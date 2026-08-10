import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { verifyOnlineAssetRelease } from './verifyOnlineAssetRelease.mjs'

const dirs = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('online asset release package', () => {
  it('requires the repository-relative service layout used by the Dockerfile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'awai-release-'))
    dirs.push(root)
    await mkdir(join(root, 'services/online-assets/dist'), { recursive: true })
    await mkdir(join(root, 'services/online-assets/migrations'), { recursive: true })
    await mkdir(join(root, 'services/online-assets/src'), { recursive: true })
    await Promise.all([
      writeFile(join(root, 'package.json'), '{}'),
      writeFile(join(root, 'package-lock.json'), '{}'),
      writeFile(join(root, 'LICENSE'), 'MIT'),
      writeFile(join(root, 'services/online-assets/Dockerfile'), 'COPY services/online-assets ./services/online-assets\n'),
      writeFile(join(root, 'services/online-assets/dist/server.js'), ''),
      writeFile(join(root, 'services/online-assets/migrations/001_temporary_assets.sql'), ''),
      writeFile(join(root, 'services/online-assets/tsconfig.json'), '{}'),
      writeFile(join(root, 'services/online-assets/src/server.ts'), ''),
    ])

    await expect(verifyOnlineAssetRelease(root)).resolves.toBeUndefined()
    await expect(verifyOnlineAssetRelease(join(root, 'services/online-assets'))).rejects.toThrow('package.json')
  })
})
