import { describe, expect, it } from 'vitest'
import { mergeAgentUsage, normalizeAgentUsage } from './agentUsage'

describe('agent usage', () => {
  it('normalizes persisted usage and derives missing cache misses', () => {
    expect(normalizeAgentUsage({
      apiCalls: 2,
      input_tokens: 1000,
      output_tokens: 80,
      cached_tokens: 600,
    })).toEqual({
      apiCalls: 2,
      inputTokens: 1000,
      outputTokens: 80,
      totalTokens: 1080,
      cachedInputTokens: 600,
      cacheMissInputTokens: 400,
      cacheWriteInputTokens: 0,
    })
  })

  it('adds usage from multiple model calls in one round', () => {
    const first = normalizeAgentUsage({ input_tokens: 100, output_tokens: 20, cached_tokens: 50 })
    const second = normalizeAgentUsage({ input_tokens: 200, output_tokens: 30, prompt_cache_miss_tokens: 150, cache_write_input_tokens: 20 })

    expect(mergeAgentUsage(first, second)).toEqual({
      apiCalls: 2,
      inputTokens: 300,
      outputTokens: 50,
      totalTokens: 350,
      cachedInputTokens: 50,
      cacheMissInputTokens: 200,
      cacheWriteInputTokens: 20,
    })
  })
})
