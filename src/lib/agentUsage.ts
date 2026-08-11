import type { AgentUsage } from '../types'

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

export function normalizeAgentUsage(value: unknown): AgentUsage | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const usage = value as Record<string, unknown>
  const inputTokens = getNumber(usage.inputTokens) ?? getNumber(usage.input_tokens) ?? getNumber(usage.prompt_tokens)
  const outputTokens = getNumber(usage.outputTokens) ?? getNumber(usage.output_tokens) ?? getNumber(usage.completion_tokens)
  const totalTokens = getNumber(usage.totalTokens) ?? getNumber(usage.total_tokens)
  const cachedInputTokens = getNumber(usage.cachedInputTokens) ?? getNumber(usage.cached_tokens) ?? getNumber(usage.cache_read_input_tokens)
  const cacheMissInputTokens = getNumber(usage.cacheMissInputTokens) ?? getNumber(usage.input_cache_miss_tokens) ?? getNumber(usage.prompt_cache_miss_tokens)
  const cacheWriteInputTokens = getNumber(usage.cacheWriteInputTokens) ?? getNumber(usage.cache_write_input_tokens) ?? getNumber(usage.cache_creation_input_tokens)
  const apiCalls = getNumber(usage.apiCalls) ?? 1

  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined && cachedInputTokens === undefined && cacheMissInputTokens === undefined && cacheWriteInputTokens === undefined) {
    return undefined
  }

  const normalizedInputTokens = inputTokens ?? 0
  const normalizedOutputTokens = outputTokens ?? 0
  const normalizedCachedInputTokens = cachedInputTokens ?? 0
  const normalizedCacheWriteInputTokens = cacheWriteInputTokens ?? 0

  return {
    apiCalls,
    inputTokens: normalizedInputTokens,
    outputTokens: normalizedOutputTokens,
    totalTokens: totalTokens ?? normalizedInputTokens + normalizedOutputTokens,
    cachedInputTokens: normalizedCachedInputTokens,
    cacheMissInputTokens: cacheMissInputTokens ?? Math.max(0, normalizedInputTokens - normalizedCachedInputTokens - normalizedCacheWriteInputTokens),
    cacheWriteInputTokens: normalizedCacheWriteInputTokens,
  }
}

export function mergeAgentUsage(previous: AgentUsage | undefined, current: AgentUsage | undefined): AgentUsage | undefined {
  if (!current) return previous
  if (!previous) return current

  return {
    apiCalls: previous.apiCalls + current.apiCalls,
    inputTokens: previous.inputTokens + current.inputTokens,
    outputTokens: previous.outputTokens + current.outputTokens,
    totalTokens: previous.totalTokens + current.totalTokens,
    cachedInputTokens: previous.cachedInputTokens + current.cachedInputTokens,
    cacheMissInputTokens: previous.cacheMissInputTokens + current.cacheMissInputTokens,
    cacheWriteInputTokens: previous.cacheWriteInputTokens + current.cacheWriteInputTokens,
  }
}
