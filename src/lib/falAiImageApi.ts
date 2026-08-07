import type { ApiProfile } from '../types'
import type { CallApiOptions, CallApiResult } from './imageApiShared'

const REMOVED_PROVIDER_MESSAGE = 'AWAI创作工作台不支持 FAL 直连，请使用 OpenAI 兼容接口。'

export function getFalErrorMessage(err: unknown): string | null {
  return err instanceof Error ? err.message : REMOVED_PROVIDER_MESSAGE
}

export async function getFalQueuedImageResult(_profile: ApiProfile, _endpoint: string, _requestId: string, _params: CallApiOptions['params']): Promise<CallApiResult> {
  throw new Error(REMOVED_PROVIDER_MESSAGE)
}

export async function callFalAiImageApi(_opts: CallApiOptions, _profile: ApiProfile): Promise<CallApiResult> {
  throw new Error(REMOVED_PROVIDER_MESSAGE)
}
