import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { checkArtifactSurface, validateReleaseEnv, writeDesktopReleaseConfig } from './releaseConfig.mjs'

const env = {
  VITE_AWAI_SUB2API_ALLOWED_ORIGINS: 'https://sub.example,https://backup.example',
  VITE_AWAI_SUPPORT_URL: 'https://support.example/awai',
  VITE_AWAI_ASSET_SERVICE_URL: 'https://assets.example',
  VITE_AWAI_RELEASE_MODE: 'true',
  AWAI_SUB2API_ALLOWED_ORIGINS: 'https://sub.example,https://backup.example',
  AWAI_WEB_ALLOWED_ORIGINS: 'https://awai.example',
  DATABASE_URL: 'postgresql://awai:secret@db.example/awai',
  S3_BUCKET: 'awai-assets',
  S3_REGION: 'auto',
  AWAI_SUB2API_BASE_URL: 'https://sub.example',
  AWAI_SUPPORT_URL: 'https://support.example/awai',
  AWAI_BUNDLE_IDENTIFIER: 'com.example.awai',
}
const dirs = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('release configuration', () => {
  it('validates all required web, service and desktop slots without returning secrets', () => {
    const result = validateReleaseEnv(env)
    expect(result.web.sub2ApiOrigins).toEqual(['https://sub.example', 'https://backup.example'])
    expect(result.desktop.identifier).toBe('com.example.awai')
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('rejects wildcard origins, placeholders and mismatched allowlists', () => {
    expect(() => validateReleaseEnv({ ...env, VITE_AWAI_SUB2API_ALLOWED_ORIGINS: 'https://*.example' }, 'web')).toThrow('HTTPS')
    expect(() => validateReleaseEnv({ ...env, AWAI_SUB2API_ALLOWED_ORIGINS: 'https://other.example' })).toThrow('不一致')
  })

  it('writes a Tauri override that explicitly disables updater artifacts', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'awai-release-config-'))
    dirs.push(dir)
    const output = path.join(dir, 'tauri.json')
    const config = await writeDesktopReleaseConfig(env, output)
    expect(config).toEqual({
      identifier: 'com.example.awai',
      bundle: { createUpdaterArtifacts: false },
    })
  })

  it('rejects old branding and PWA markers in built artifacts', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'awai-release-surface-'))
    dirs.push(dir)
    await writeFile(path.join(dir, 'index.html'), '<title>AWAI创作工作台</title>')
    await expect(checkArtifactSurface(dir)).resolves.toBeUndefined()
    await writeFile(path.join(dir, 'app.js'), 'const brand = "GPT Image Playground"')
    await expect(checkArtifactSurface(dir)).rejects.toThrow('遗留产品表面')
  })
})
