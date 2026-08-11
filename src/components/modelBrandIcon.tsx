import nanoBananaIcon from '@lobehub/icons-static-svg/icons/nanobanana-color.svg'
import geminiIcon from '@lobehub/icons-static-svg/icons/gemini-color.svg'
import grokIcon from '@lobehub/icons-static-svg/icons/grok.svg'
import openaiIcon from '@lobehub/icons-static-svg/icons/openai.svg'
import claudeIcon from '@lobehub/icons-static-svg/icons/claude-color.svg'
import deepseekIcon from '@lobehub/icons-static-svg/icons/deepseek-color.svg'
import qwenIcon from '@lobehub/icons-static-svg/icons/qwen-color.svg'
import fluxIcon from '@lobehub/icons-static-svg/icons/flux.svg'
import { getModelBrand, type ModelBrand } from '../lib/modelBrand'

const ICONS: Record<ModelBrand, { src: string; monochrome?: boolean }> = {
  'nano-banana': { src: nanoBananaIcon },
  gemini: { src: geminiIcon },
  grok: { src: grokIcon, monochrome: true },
  openai: { src: openaiIcon, monochrome: true },
  claude: { src: claudeIcon },
  deepseek: { src: deepseekIcon },
  qwen: { src: qwenIcon },
  flux: { src: fluxIcon, monochrome: true },
}

interface ModelBrandIconProps {
  model: string
  className?: string
}

export default function ModelBrandIcon({ model, className = 'h-4 w-4' }: ModelBrandIconProps) {
  const brand = getModelBrand(model)
  if (!brand) return null
  const icon = ICONS[brand]
  return <img src={icon.src} alt="" aria-hidden="true" className={`shrink-0 ${className}${icon.monochrome ? ' dark:invert' : ''}`} />
}
