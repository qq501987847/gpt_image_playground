export const GEMINI_STANDARD_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'] as const
export const GEMINI_FLASH_ASPECT_RATIOS = [...GEMINI_STANDARD_ASPECT_RATIOS, '8:1', '4:1', '1:4', '1:8'] as const
export const GEMINI_IMAGE_SIZES = ['auto', '1K', '2K', '4K'] as const
export const GEMINI_PRESET_MODELS = ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'] as const

export function getGeminiAspectRatios(model: string) {
  return model === 'gemini-3.1-flash-image-preview'
    ? GEMINI_FLASH_ASPECT_RATIOS
    : GEMINI_STANDARD_ASPECT_RATIOS
}
