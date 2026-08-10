import type { ApiProfile, TaskParams } from '../types'
import type { CallApiOptions, CallApiResult } from './imageApiShared'
import { getGeminiRequestParams } from './modelCapabilities'

type GeminiPart = { text: string } | { inlineData: { mimeType: string, data: string } }

function getDataUrlPart(dataUrl: string): GeminiPart {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s)
  if (!match) throw new Error('Gemini 参考图格式无效')
  return { inlineData: { mimeType: match[1], data: match[2] } }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback
  const error = (payload as { error?: { message?: unknown } }).error
  return typeof error?.message === 'string' ? error.message : fallback
}

export function buildGeminiRequest(
  prompt: string,
  params: TaskParams,
  inputImageDataUrls: string[],
  profile: Pick<ApiProfile, 'provider' | 'model' | 'apiMode'> = { provider: 'gemini', model: 'gemini-3.1-flash-image-preview', apiMode: 'images' },
) {
  const imageConfig = getGeminiRequestParams(params, profile)
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }, ...inputImageDataUrls.map(getDataUrlPart)] }],
    ...(Object.keys(imageConfig).length ? { generationConfig: { imageConfig } } : {}),
  }
}

export function parseGeminiResponse(payload: unknown): CallApiResult {
  const record = payload && typeof payload === 'object' ? payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown, inlineData?: { mimeType?: unknown, data?: unknown } }> } }>, error?: unknown } : {}
  if (record.error) throw new Error(getErrorMessage(payload, 'Gemini 请求失败'))
  const images: string[] = []
  const revisedPrompts: string[] = []
  for (const candidate of record.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (typeof part.text === 'string') revisedPrompts.push(part.text)
      if (typeof part.inlineData?.data === 'string') {
        const mime = typeof part.inlineData.mimeType === 'string' ? part.inlineData.mimeType : 'image/png'
        if (mime.startsWith('image/')) images.push(`data:${mime};base64,${part.inlineData.data}`)
      }
    }
  }
  if (images.length === 0) throw new Error(revisedPrompts.join('\n') || 'Gemini 未返回图片')
  return { images, revisedPrompts: images.map(() => revisedPrompts.join('\n') || undefined) }
}

async function callGeminiImageApiSingle(opts: CallApiOptions, profile: ApiProfile): Promise<CallApiResult> {
  const baseUrl = profile.baseUrl.replace(/\/+$/, '')
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), profile.timeout * 1000)
  try {
    const response = await fetch(`${baseUrl}/v1beta/models/${encodeURIComponent(profile.model)}:generateContent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${profile.apiKey}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(buildGeminiRequest(opts.prompt, opts.params, opts.inputImageDataUrls, profile)),
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(getErrorMessage(payload, `Gemini 请求失败（HTTP ${response.status}）`))
    return parseGeminiResponse(payload)
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function callGeminiImageApi(opts: CallApiOptions, profile: ApiProfile): Promise<CallApiResult> {
  const n = Math.max(1, opts.params.n)
  if (n === 1) return callGeminiImageApiSingle(opts, profile)

  const results = await Promise.allSettled(Array.from({ length: n }).map(() => callGeminiImageApiSingle({
    ...opts,
    params: { ...opts.params, n: 1 },
  }, profile)))
  const successfulResults = results
    .filter((result): result is PromiseFulfilledResult<CallApiResult> => result.status === 'fulfilled')
    .map((result) => result.value)
  const failedRequests = results.flatMap((result, requestIndex) => result.status === 'rejected'
    ? [{ requestIndex, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }]
    : [])

  if (successfulResults.length === 0) {
    const firstError = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (firstError) throw firstError.reason
    throw new Error('所有 Gemini 请求均失败')
  }

  return {
    images: successfulResults.flatMap((result) => result.images),
    revisedPrompts: successfulResults.flatMap((result) => result.revisedPrompts ?? result.images.map(() => undefined)),
    ...(failedRequests.length ? { failedRequests } : {}),
  }
}
