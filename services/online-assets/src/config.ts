interface ServiceEnv {
  [key: string]: string | undefined
}

function required(env: ServiceEnv, name: string) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`缺少环境变量 ${name}`)
  return value
}

function exactHttpsOrigin(value: string, name: string) {
  if (value.includes('*')) throw new Error(`${name} 必须是精确 HTTPS origin`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} 必须是精确 HTTPS origin`)
  }
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) {
    throw new Error(`${name} 必须是精确 HTTPS origin`)
  }
  return url.origin
}

export function readExactHttpsOrigins(env: ServiceEnv, name: string) {
  const origins = required(env, name).split(',').map((value) => exactHttpsOrigin(value.trim(), name))
  if (new Set(origins).size !== origins.length) throw new Error(`${name} 包含重复 origin`)
  return origins
}

export function loadServiceConfig(env: ServiceEnv = process.env) {
  const databaseUrl = required(env, 'DATABASE_URL')
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) throw new Error('DATABASE_URL 必须使用 PostgreSQL URL')

  const endpoint = env.S3_ENDPOINT?.trim()
  if (endpoint) {
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('S3_ENDPOINT 必须使用 HTTP(S) URL')
  }

  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim()
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim()
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) throw new Error('S3 访问密钥必须成对配置')

  const port = Number(env.PORT ?? 8788)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是有效端口')

  return {
    databaseUrl,
    s3Bucket: required(env, 'S3_BUCKET'),
    s3Region: required(env, 'S3_REGION'),
    s3Endpoint: endpoint || undefined,
    s3ForcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    s3Credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    sub2ApiOrigins: readExactHttpsOrigins(env, 'AWAI_SUB2API_ALLOWED_ORIGINS'),
    webOrigins: readExactHttpsOrigins(env, 'AWAI_WEB_ALLOWED_ORIGINS'),
    port,
  }
}
