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

function keyValue(item) {
  return String(item?.key ?? item?.value ?? item?.api_key ?? '')
}

async function binaryRequest(request, url, init, label) {
  const response = await request(url, { ...init, signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`${label} 失败：HTTP ${response.status}`)
  return response
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
  const keyId = required(env, 'AWAI_SMOKE_KEY_ID')
  const expectedVersion = required(env, 'AWAI_SMOKE_EXPECTED_VERSION')
  const openAiImageModel = required(env, 'AWAI_SMOKE_OPENAI_IMAGE_MODEL')
  const responsesModel = required(env, 'AWAI_SMOKE_RESPONSES_MODEL')
  const geminiModel = required(env, 'AWAI_SMOKE_GEMINI_MODEL')

  const web = await request(`${webOrigin}/`, { signal: AbortSignal.timeout(60_000) })
  if (!web.ok || !(await web.text()).includes('AWAI创作工作台')) throw new Error('Web 产物冒烟失败')
  const version = await jsonRequest(request, `${webOrigin}/version.json`, {}, 'version.json')
  if (version.body?.version !== expectedVersion) throw new Error('线上 Web 版本与期望版本不一致')

  const readiness = await jsonRequest(request, `${serviceOrigin}/readyz`, { headers: { Origin: webOrigin } }, '在线服务就绪检查')
  if (readiness.body?.status !== 'ready' || readiness.response.headers.get('access-control-allow-origin') !== webOrigin) {
    throw new Error('在线服务 CORS 或就绪状态无效')
  }

  const menuHeaders = { Authorization: `Bearer ${menuJwt}`, Origin: webOrigin, Accept: 'application/json' }
  const profile = await jsonRequest(request, apiUrl(sub2ApiOrigin, '/api/v1/user/profile'), { headers: menuHeaders }, 'Sub2API JWT')
  if (userIdFrom(profile.body) !== expectedUserId) throw new Error('Sub2API JWT 用户身份不匹配')
  requireCors(profile.response, webOrigin, 'Sub2API JWT')
  const keys = await jsonRequest(request, apiUrl(sub2ApiOrigin, '/api/v1/keys?page=1&page_size=1000'), { headers: menuHeaders }, 'Sub2API Key 列表')
  requireCors(keys.response, webOrigin, 'Sub2API Key 列表')
  const keysData = keys.body?.data ?? keys.body
  const pages = Math.max(1, Number(keysData?.pages) || 1)
  const additionalKeyPages = await Promise.all(Array.from({ length: pages - 1 }, async (_, idx) => {
    const page = await jsonRequest(request, apiUrl(sub2ApiOrigin, `/api/v1/keys?page=${idx + 2}&page_size=1000`), { headers: menuHeaders }, `Sub2API Key 列表第 ${idx + 2} 页`)
    requireCors(page.response, webOrigin, `Sub2API Key 列表第 ${idx + 2} 页`)
    const data = page.body?.data ?? page.body
    return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
  }))
  const keyItems = [
    ...(Array.isArray(keysData) ? keysData : Array.isArray(keysData?.items) ? keysData.items : []),
    ...additionalKeyPages.flat(),
  ]
  if (!keyItems.length) throw new Error('Sub2API Key 列表为空')
  const selectedKey = keyItems.find((item) => String(item?.id ?? item?.key_id ?? '') === keyId)
  if (!selectedKey) throw new Error(`Sub2API Key 列表不含指定 Key：${keyId}`)
  const gatewayKey = keyValue(selectedKey)
  if (!gatewayKey) throw new Error(`Sub2API 未返回指定 Key 的值：${keyId}`)
  const headers = { Authorization: `Bearer ${gatewayKey}`, Origin: webOrigin, 'content-type': 'application/json' }
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
  const models = await jsonRequest(request, apiUrl(sub2ApiOrigin, '/v1/models'), { headers }, '模型发现')
  requireCors(models.response, webOrigin, '模型发现')
  const modelIds = Array.isArray(models.body?.data) ? models.body.data.map((item) => String(item?.id ?? '')) : []
  if (!modelIds.includes(openAiImageModel) || !modelIds.includes(responsesModel)) {
    throw new Error('OpenAI 模型发现未返回冒烟所需模型')
  }
  if (!modelIds.includes(geminiModel)) throw new Error('Gemini 模型发现未返回冒烟所需模型')

  const agentPrompt = 'Call generate_image_batch exactly once with a prompt for a plain blue square on white.'
  const agent = await jsonRequest(request, apiUrl(sub2ApiOrigin, '/v1/responses'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: responsesModel,
      input: agentPrompt,
      tools: [{
        type: 'function',
        name: 'generate_image_batch',
        description: 'Generate one smoke-test image.',
        parameters: {
          type: 'object',
          properties: { prompt: { type: 'string' } },
          required: ['prompt'],
          additionalProperties: false,
        },
      }],
      tool_choice: { type: 'function', name: 'generate_image_batch' },
    }),
  }, 'Responses Agent 工具调用')
  const functionCall = Array.isArray(agent.body?.output)
    ? agent.body.output.find((item) => item?.type === 'function_call' && item?.name === 'generate_image_batch')
    : null
  if (!agent.body?.id || !functionCall?.call_id) throw new Error('Responses Agent 未返回图像函数调用')
  requireCors(agent.response, webOrigin, 'Responses Agent 工具调用')

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

  const continuation = await jsonRequest(request, apiUrl(sub2ApiOrigin, '/v1/responses'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: responsesModel,
      input: [
        { role: 'user', content: [{ type: 'input_text', text: agentPrompt }] },
        { type: 'function_call', name: functionCall.name, call_id: functionCall.call_id, arguments: functionCall.arguments ?? '{}' },
        { type: 'function_call_output', call_id: functionCall.call_id, output: JSON.stringify({ status: 'completed', imageCount: 1 }) },
      ],
    }),
  }, 'Responses Agent 续轮')
  if (!responseText(continuation.body).includes('AWAI_AGENT_OK')) throw new Error('Responses Agent 续轮响应不含 AWAI_AGENT_OK')
  requireCors(continuation.response, webOrigin, 'Responses Agent 续轮')

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

  const assetBytes = new Uint8Array([137, 80, 78, 71])
  const assetHeaders = {
    Authorization: `Bearer ${menuJwt}`,
    Origin: webOrigin,
    'content-type': 'application/json',
    'x-sub2api-origin': sub2ApiOrigin,
    'x-awai-user-id': expectedUserId,
  }
  const initialized = await jsonRequest(request, `${serviceOrigin}/v1/assets`, {
    method: 'POST',
    headers: assetHeaders,
    body: JSON.stringify({ taskId: `release-smoke-${Date.now()}`, original: { bytes: assetBytes.byteLength, mediaType: 'image/png' } }),
  }, '云素材初始化')
  requireCors(initialized.response, webOrigin, '云素材初始化')
  const assetId = String(initialized.body?.asset?.id ?? '')
  const upload = Array.isArray(initialized.body?.uploads)
    ? initialized.body.uploads.find((item) => item?.kind === 'original')
    : null
  if (!assetId || !upload?.url) throw new Error('云素材初始化未返回上传地址')

  const uploaded = await binaryRequest(request, upload.url, {
    method: 'PUT',
    headers: { Origin: webOrigin, 'content-type': 'image/png' },
    body: assetBytes,
  }, '对象存储直传')
  requireCors(uploaded, webOrigin, '对象存储直传')

  const confirmed = await jsonRequest(request, `${serviceOrigin}/v1/assets/${encodeURIComponent(assetId)}/confirm`, {
    method: 'POST',
    headers: assetHeaders,
  }, '云素材确认')
  requireCors(confirmed.response, webOrigin, '云素材确认')
  if (confirmed.body?.asset?.status !== 'available') throw new Error('云素材确认后未变为 available')

  const assets = await jsonRequest(request, `${serviceOrigin}/v1/assets`, { headers: assetHeaders }, '云素材列表')
  requireCors(assets.response, webOrigin, '云素材列表')
  const listedAsset = Array.isArray(assets.body?.assets) ? assets.body.assets.find((item) => item?.id === assetId) : null
  if (!listedAsset?.downloads?.original) throw new Error('云素材列表未返回下载地址')
  const downloaded = await binaryRequest(request, listedAsset.downloads.original, { headers: { Origin: webOrigin } }, '对象存储下载')
  requireCors(downloaded, webOrigin, '对象存储下载')
  if (!Buffer.from(await downloaded.arrayBuffer()).equals(Buffer.from(assetBytes))) throw new Error('云素材下载内容与上传内容不一致')

  const deleted = await binaryRequest(request, `${serviceOrigin}/v1/assets/${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
    headers: assetHeaders,
  }, '云素材删除')
  requireCors(deleted, webOrigin, '云素材删除')

  return ['web', 'version', 'asset-ready', 'jwt', 'keys', 'cors-rejection', 'models', 'agent-tool-call', 'openai-image', 'agent-continuation', 'gemini-image', 'asset-initialize', 'object-upload', 'asset-confirm', 'asset-list', 'object-download', 'asset-delete']
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLiveSmoke(process.env)
    .then((checks) => console.log(`AWAI 线上冒烟通过：${checks.join(', ')}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
}
