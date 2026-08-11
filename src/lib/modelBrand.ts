export type ModelBrand = 'nano-banana' | 'gemini' | 'grok' | 'openai' | 'claude' | 'deepseek' | 'qwen' | 'flux'

const NANO_BANANA_MODELS = new Set([
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
])

export function getModelBrand(model: string): ModelBrand | null {
  const value = model.trim().toLowerCase()
  if (NANO_BANANA_MODELS.has(value)) return 'nano-banana'
  if (value.includes('gemini') || value.includes('imagen')) return 'gemini'
  if (value.includes('grok')) return 'grok'
  if (value.includes('claude') || value.includes('anthropic')) return 'claude'
  if (value.includes('deepseek')) return 'deepseek'
  if (value.includes('qwen')) return 'qwen'
  if (value.includes('flux')) return 'flux'
  if (value.includes('gpt') || value.includes('openai') || value.includes('chatgpt') || value.includes('dall-e') || value.includes('codex') || /^o(?:1|3|4)(?:-|$)/.test(value)) return 'openai'
  return null
}
