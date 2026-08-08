import { pathToFileURL } from 'node:url'

function required(env, name) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`缺少线上冒烟配置 ${name}`)
  return value
}

function exactOrigin(env, name) {
  const value = required(env, name)
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.origin !== value || value.includes('*')) throw new Error(`${name} 必须是精确 HTTPS origin`)
  return value
}

function apiUrl(origin, path) {
  return `${origin}${path}`
}

async function jsonRequest(request, url, init, label) {
  const response = await request(url, { ...init, signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`${label} 失败：HTTP ${response.status}`)
  return { response, body: await response.json() }
}

function userIdFrom(body) {
  const value = body?.data && typeof body.data === 'object' ? body.data : body
  return String(value?.id ?? value?.user_id ?? '')
}

function requireCors(response, origin, label) {
  if (response.headers.get('access-control-allow-origin') !== origin) {
    throw new Error(`${label} 未允许 AWAI 精确 origin`)
  }
}

function responseText(body) {
  const parts = Array.isArray(body?.output)
    ? body.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    : []
  return [body?.output_text, ...parts.map((part) => part?.text ?? part?.output_text)].filter(Boolean).join('\n')
}

export async function runLiveSmoke(env, request = fetch) {
  if (env.AWAI_SMOKE_CONFIRM_CHARGES?.trim() !== 'I_ACCEPT_MODEL_CHARGES') {
    throw new Error('必须显式确认模型冒烟费用')
  }
  const webOrigin = exactOrigin(env, 'AWAI_SMOKE_WEB_ORIGIN')
  const serviceOrigin = exactOrigin(env, 'AWAI_SMOKE_ASSET_SERVICE_ORIGIN')
  const sub2ApiOrigin = exactOrigin(env, 'AWAI_SMOKE_SUB2API_ORIGIN')
  const menuJwt = required(env, 'AWAI_SMOKE_MENU_JWT')
  const expectedUserId = required(env, 'AWAI_SMOKE_USER_ID')
  const gatewayKey = required(env, 'AWAI_SMOKE_GATEWAY_KEY')
  const expectedVersion = required(env, 'AWAI_SMOKE_EXPECTED_VERSION')
  const openAiImageModel = required(env, 'AWAI_SMOKE_OPENAI_IMAGE_MODEL')
  const responsesModel = required(env, 'AWAI_SMOKE_RESPONSES_MODEL')
  const geminiModel = required(env, 'AWAI_SMOKE_GEMINI_MODEL')
  const headers = { Authorization: `Bearer ${gatewayKey}`, Origin: webOrigin, 'content-type': 'application/json' }

  const web = await request(`${webOrigin}/`, { signal: AbortSignal.timeout(60_000) })
  if (!web.ok || !(await web.text()).includes('AWAI创作工作台')) throw new Error('Web 产物冒烟失败')
  const version = await jsonRequest(request, `${webOrigin}/version.json`, {}, 'version.json')
  if (version.body?.version !== expectedVersion) throw new Error('线上 Web 版本与期望版本不一致')

  const health = await jsonRequest(request, `${serviceOrigin}/healthz`, { headers: { Origin: webOrigin } }, '在线服务健康检查')
  if (health.body?.status !== 'ok' || health.response.headers.get('access-control-allow-origin') !== webOrigin) {
    throw new Error('在线服务 CORS 或健康状态无效')
  }

  const menuHeaders = { Authorization: `Bearer ${menuJwt}`, Origin: webOrigin, Accept: 'application/json' }
  const profile = await jsonRequest(request, apiUrl(sub2ApiOrigin, '/api/v1/user/profile'), { headers: menuHeaders }, 'Sub2API JWT')
  if (userIdFrom(profile.body) !== expectedUserId) throw new Error('Sub2API JWT 用户身份不匹配')
  requireCors(profile.response, webOrigin, 'Sub2API JWT')
  const keys = await jsonRequest(request, apiUrl(sub2ApiOrigin, '/api/v1/keys'), { headers: menuHeaders }, 'Sub2API Key 列表')
  requireCors(keys.response, webOrigin, 'Sub2API Key 列表')
  const keysData = keys.body?.data ?? keys.body
  const keyItems = Array.isArray(keysData) ? keysData : Array.isArray(keysData?.items) ? keysData.items : []
  if (!keyItems.length) throw new Error('Sub2API Key 列表为空')
  const rejectedOrigin = await request(apiUrl(sub2ApiOrigin, '/api/v1/user/profile'), {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://unapproved.invalid',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
    signal: AbortSignal.timeout(60_000),
  })
  if (rejectedOrigin.headers.get('access-control-allow-origin')) throw new Error('Sub2API 错误允许未知 origin')
  const openAiModels = await jsonRequest(request, apiUrl(sub2ApiOrigin, '/v1/models'), { headers }, 'OpenAI 模型发现')
  requireCors(openAiModels.response, webOrigin, 'OpenAI 模型发现')
  const openAiModelIds = Array.isArray(openAiModels.body?.data) ? openAiModels.body.data.map((item) => String(item?.id ?? '')) : []
  if (!openAiModelIds.includes(openAiImageModel) || !openAiModelIds.includes(responsesModel)) {
    throw new Error('OpenAI 模型发现未返回冒烟所需模型')
  }
  const geminiModels = await jsonRequest(request, apiUrl(sub2ApiOrigin, '/v1beta/models'), { headers }, 'Gemini 模型发现')
  requireCors(geminiModels.response, webOrigin, 'Gemini 模型发现')
  const geminiModelNames = Array.isArray(geminiModels.body?.models) ? geminiModels.body.models.map((item) => String(item?.name ?? '').replace(/^models\//, '')) : []
  if (!geminiModelNames.includes(geminiModel)) throw new Error('Gemini 模型发现未返回冒烟所需模型')

  const image = await jsonRequest(request, apiUrl(sub2ApiOrigin, '/v1/images/generations'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: openAiImageModel,
      prompt: 'AWAI release smoke test: a plain blue square on white',
      n: 1,
      size: '1024x1024',
    }),
  }, 'OpenAI 图像')
  if (!Array.isArray(image.body?.data) || !image.body.data.some((item) => item?.b64_json || item?.url)) {
    throw new Error('OpenAI 图像响应不含图片')
  }
  requireCors(image.response, webOrigin, 'OpenAI 图像')

  const responses = await jsonRequest(request, apiUrl(sub2ApiOrigin, '/v1/responses'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: responsesModel, input: 'Reply exactly AWAI_OK.' }),
  }, 'Responses Agent')
  if (!responseText(responses.body).includes('AWAI_OK')) throw new Error('Responses 响应不含 AWAI_OK')
  requireCors(responses.response, webOrigin, 'Responses Agent')

  const gemini = await jsonRequest(request, apiUrl(sub2ApiOrigin, `/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'AWAI release smoke test: a plain red square on white' }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  }, 'Gemini 原生图像')
  const parts = gemini.body?.candidates?.flatMap((candidate) => candidate?.content?.parts ?? []) ?? []
  if (!parts.some((part) => part?.inlineData?.data)) throw new Error('Gemini 响应不含 inlineData 图片')
  requireCors(gemini.response, webOrigin, 'Gemini 原生图像')

  return ['web', 'version', 'asset-service', 'jwt', 'keys', 'cors-rejection', 'openai-models', 'gemini-models', 'openai-image', 'responses', 'gemini-image']
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLiveSmoke(process.env)
    .then((checks) => console.log(`AWAI 线上冒烟通过：${checks.join(', ')}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
