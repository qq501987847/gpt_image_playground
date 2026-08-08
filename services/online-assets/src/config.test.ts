import { describe, expect, it } from 'vitest'

import { loadServiceConfig, readExactHttpsOrigins } from './config.js'

const validEnv = {
  DATABASE_URL: 'postgresql://awai:secret@db.example/awai',
  S3_BUCKET: 'awai-assets',
  S3_REGION: 'auto',
  S3_ENDPOINT: 'https://objects.example',
  S3_ACCESS_KEY_ID: 'access',
  S3_SECRET_ACCESS_KEY: 'secret',
  AWAI_SUB2API_ALLOWED_ORIGINS: 'https://sub.example,https://backup.example',
  AWAI_WEB_ALLOWED_ORIGINS: 'https://awai.example',
}

describe('online asset service config', () => {
  it('loads explicit PostgreSQL, S3 and exact-origin release slots', () => {
    expect(loadServiceConfig(validEnv)).toMatchObject({
      databaseUrl: validEnv.DATABASE_URL,
      s3Bucket: 'awai-assets',
      s3Region: 'auto',
      s3Endpoint: 'https://objects.example',
      sub2ApiOrigins: ['https://sub.example', 'https://backup.example'],
      webOrigins: ['https://awai.example'],
      port: 8788,
    })
  })

  it.each([
    'http://sub.example',
    'https://*.example',
    'https://sub.example/path',
    'https://sub.example/',
  ])('rejects non-exact allowed origin %s', (origin) => {
    expect(() => readExactHttpsOrigins({ ALLOWED: origin }, 'ALLOWED')).toThrow('精确 HTTPS origin')
  })

  it('rejects empty or duplicate allowlists and partial S3 credentials', () => {
    expect(() => readExactHttpsOrigins({}, 'ALLOWED')).toThrow('缺少环境变量 ALLOWED')
    expect(() => readExactHttpsOrigins({ ALLOWED: 'https://sub.example,https://sub.example' }, 'ALLOWED')).toThrow('重复 origin')
    expect(() => loadServiceConfig({ ...validEnv, S3_SECRET_ACCESS_KEY: '' })).toThrow('必须成对配置')
  })
})
