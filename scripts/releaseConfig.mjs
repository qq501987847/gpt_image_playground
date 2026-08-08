import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const FORBIDDEN_ARTIFACT_MARKERS = [
  'GPT Image Playground',
  '@CookSleep',
  'github.com/CookSleep',
  'manifest.webmanifest',
  'serviceWorker.register',
]

function required(env, name) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`缺少发布配置 ${name}`)
  if (value.includes('.invalid')) throw new Error(`${name} 仍是无效占位值`)
  return value
}

function httpsUrl(env, name, exactOrigin = false) {
  const value = required(env, name)
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} 必须是 HTTPS URL`)
  }
  if (url.protocol !== 'https:' || url.username || url.password || value.includes('*')) {
    throw new Error(`${name} 必须是 HTTPS URL`)
  }
  if (exactOrigin && url.origin !== value) throw new Error(`${name} 必须是精确 HTTPS origin`)
  return value
}

function origins(env, name) {
  const values = required(env, name).split(',').map((value) => value.trim())
  for (const value of values) httpsUrl({ [name]: value }, name, true)
  if (new Set(values).size !== values.length) throw new Error(`${name} 包含重复 origin`)
  return values
}

function validateWeb(env) {
  if (required(env, 'VITE_AWAI_RELEASE_MODE') !== 'true') throw new Error('VITE_AWAI_RELEASE_MODE 正式构建必须为 true')
  return {
    sub2ApiOrigins: origins(env, 'VITE_AWAI_SUB2API_ALLOWED_ORIGINS'),
    supportUrl: httpsUrl(env, 'VITE_AWAI_SUPPORT_URL'),
    assetServiceUrl: httpsUrl(env, 'VITE_AWAI_ASSET_SERVICE_URL', true),
  }
}

function validateService(env) {
  const databaseUrl = required(env, 'DATABASE_URL')
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) throw new Error('DATABASE_URL 必须使用 PostgreSQL URL')
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim()
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim()
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) throw new Error('S3 访问密钥必须成对配置')
  if (env.S3_ENDPOINT?.trim()) {
    const endpoint = new URL(env.S3_ENDPOINT.trim())
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('S3_ENDPOINT 必须使用 HTTP(S) URL')
  }
  return {
    sub2ApiOrigins: origins(env, 'AWAI_SUB2API_ALLOWED_ORIGINS'),
    webOrigins: origins(env, 'AWAI_WEB_ALLOWED_ORIGINS'),
    databaseConfigured: Boolean(databaseUrl),
    s3Bucket: required(env, 'S3_BUCKET'),
    s3Region: required(env, 'S3_REGION'),
  }
}

function validateDesktop(env) {
  const identifier = required(env, 'AWAI_BUNDLE_IDENTIFIER')
  if (!/^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+){2,}$/.test(identifier)) {
    throw new Error('AWAI_BUNDLE_IDENTIFIER 必须是反向域名格式')
  }
  return {
    sub2ApiBaseUrl: httpsUrl(env, 'AWAI_SUB2API_BASE_URL', true),
    supportUrl: httpsUrl(env, 'AWAI_SUPPORT_URL'),
    identifier,
  }
}

export function validateReleaseEnv(env, scope = 'all') {
  if (!['web', 'service', 'desktop', 'all'].includes(scope)) throw new Error(`未知发布范围 ${scope}`)
  const result = {
    ...(scope === 'web' || scope === 'all' ? { web: validateWeb(env) } : {}),
    ...(scope === 'service' || scope === 'all' ? { service: validateService(env) } : {}),
    ...(scope === 'desktop' || scope === 'all' ? { desktop: validateDesktop(env) } : {}),
  }
  if (scope === 'all') {
    const webOrigins = result.web.sub2ApiOrigins.join(',')
    const serviceOrigins = result.service.sub2ApiOrigins.join(',')
    if (webOrigins !== serviceOrigins) throw new Error('Web 与在线服务的 Sub2API origin 允许列表不一致')
  }
  return result
}

export async function writeDesktopReleaseConfig(env, outputPath = 'release-out/tauri.release.conf.json') {
  const config = validateDesktop(env)
  const output = {
    identifier: config.identifier,
    bundle: { createUpdaterArtifacts: false },
  }
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`)
  return output
}

async function artifactFiles(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const file = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...await artifactFiles(file))
    if (entry.isFile() && /\.(?:css|html|js|json|txt)$/i.test(entry.name)) files.push(file)
  }
  return files
}

export async function checkArtifactSurface(root = 'dist') {
  const matches = []
  for (const file of await artifactFiles(root)) {
    const content = await readFile(file, 'utf8')
    for (const marker of FORBIDDEN_ARTIFACT_MARKERS) {
      if (content.includes(marker)) matches.push(`${file}: ${marker}`)
    }
  }
  if (matches.length) throw new Error(`发布产物包含遗留产品表面：\n${matches.join('\n')}`)
}

async function main() {
  const command = process.argv[2] ?? 'check'
  if (command === 'check') {
    const scope = process.argv[3] ?? 'all'
    validateReleaseEnv(process.env, scope)
    console.log(`AWAI ${scope} 发布配置有效`)
    return
  }
  if (command === 'prepare-desktop') {
    const output = process.argv[3] ?? 'release-out/tauri.release.conf.json'
    await writeDesktopReleaseConfig(process.env, output)
    console.log(`已生成 ${output}`)
    return
  }
  if (command === 'check-artifact') {
    const root = process.argv[3] ?? 'dist'
    await checkArtifactSurface(root)
    console.log(`AWAI 发布产物表面检查通过：${root}`)
    return
  }
  throw new Error(`未知命令 ${command}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
