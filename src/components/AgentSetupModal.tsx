import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { discoverModelsForKey, useSub2ApiSession } from '../lib/sub2apiSession'
import { getSub2ApiKeyLabel, isSub2ApiKeyUsable } from '../lib/sub2api'
import { getAgentImageApiProfile, getAgentTextApiProfile } from '../lib/apiProfiles'
import { bindAgentImageSelection, bindAgentTextSelection } from '../lib/agentProfileSelection'
import { filterDiscoveredModels } from '../lib/modelCapabilities'
import { isDesktopRuntime } from '../lib/runtime'
import { CloseIcon } from './icons'

type SetupMode = 'hybrid' | 'image'

interface ImageModelOption {
  provider: 'openai' | 'gemini'
  model: string
}

export default function AgentSetupModal() {
  const open = useStore((s) => s.agentSetupOpen)
  const setOpen = useStore((s) => s.setAgentSetupOpen)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const setAppMode = useStore((s) => s.setAppMode)
  const showToast = useStore((s) => s.showToast)
  const session = useSub2ApiSession()
  const [setupMode, setSetupMode] = useState<SetupMode>('hybrid')
  const [textKeyId, setTextKeyId] = useState('')
  const [textModels, setTextModels] = useState<string[]>([])
  const [textModel, setTextModel] = useState('')
  const [imageKeyId, setImageKeyId] = useState('')
  const [imageModels, setImageModels] = useState<ImageModelOption[]>([])
  const [imageModelValue, setImageModelValue] = useState('')
  const [textLoading, setTextLoading] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [textError, setTextError] = useState('')
  const [imageError, setImageError] = useState('')

  const usableKeys = useMemo(() => session.keys.filter(isSub2ApiKeyUsable), [session.keys])

  useEffect(() => {
    if (!open) return
    const textProfile = getAgentTextApiProfile(settings)
    const imageProfile = getAgentImageApiProfile(settings)
    const fallbackKeyId = usableKeys[0]?.id ?? ''
    const savedTextKeyId = textProfile?.keyId ?? ''
    const savedImageKeyId = imageProfile?.keyId ?? ''
    setSetupMode('hybrid')
    setTextKeyId(usableKeys.some((key) => key.id === savedTextKeyId) ? savedTextKeyId : fallbackKeyId)
    setTextModel(textProfile?.model ?? '')
    setImageKeyId(usableKeys.some((key) => key.id === savedImageKeyId) ? savedImageKeyId : fallbackKeyId)
    setImageModelValue(imageProfile && (imageProfile.provider === 'openai' || imageProfile.provider === 'gemini') ? `${imageProfile.provider}:${imageProfile.model}` : '')
    setTextModels([])
    setImageModels([])
    setTextError('')
    setImageError('')
  }, [open, settings, usableKeys])

  useEffect(() => {
    if (!open || (isDesktopRuntime && setupMode === 'image') || !textKeyId) return
    let cancelled = false
    setTextLoading(true)
    setTextError('')
    void discoverModelsForKey(textKeyId)
      .then((result) => {
        if (cancelled) return
        const models = filterDiscoveredModels('openai', result.openai, 'responses')
        setTextModels(models)
        setTextModel((current) => models.includes(current) ? current : models[0] ?? '')
        if (models.length === 0 && result.errors.openai) setTextError(result.errors.openai)
      })
      .catch((err) => {
        if (!cancelled) setTextError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false)
      })
    return () => { cancelled = true }
  }, [open, setupMode, textKeyId])

  useEffect(() => {
    if (!open || !imageKeyId) return
    let cancelled = false
    setImageLoading(true)
    setImageError('')
    void discoverModelsForKey(imageKeyId)
      .then((result) => {
        if (cancelled) return
        const models: ImageModelOption[] = [
          ...filterDiscoveredModels('openai', result.openai, 'image').map((model) => ({ provider: 'openai' as const, model })),
          ...filterDiscoveredModels('gemini', result.gemini, 'image').map((model) => ({ provider: 'gemini' as const, model })),
        ]
        const values = models.map((item) => `${item.provider}:${item.model}`)
        setImageModels(models)
        setImageModelValue((current) => values.includes(current) ? current : values[0] ?? '')
        if (models.length === 0) setImageError(result.errors.openai || result.errors.gemini || '')
      })
      .catch((err) => {
        if (!cancelled) setImageError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setImageLoading(false)
      })
    return () => { cancelled = true }
  }, [imageKeyId, open])

  if (!open) return null

  const confirm = async () => {
    const separator = imageModelValue.indexOf(':')
    const imageProvider = imageModelValue.slice(0, separator) as ImageModelOption['provider']
    const imageModel = imageModelValue.slice(separator + 1)
    if (!imageKeyId || separator < 1 || !imageModel) return
    if ((!isDesktopRuntime || setupMode === 'hybrid') && (!textKeyId || !textModel)) return
    setSaving(true)
    setTextError('')
    setImageError('')
    try {
      const imageSelection = await bindAgentImageSelection(settings, imageKeyId, imageProvider, imageModel)
      const imageProfile = imageSelection.profile
      let profiles = imageSelection.profiles

      if (isDesktopRuntime && setupMode === 'image') {
        setSettings({
          profiles,
          activeProfileId: imageProfile.id,
          agentApiConfigMode: 'off',
          agentTextProfileId: null,
          agentImageProfileId: imageProfile.id,
        })
        setOpen(false)
        setAppMode('gallery')
        return
      }

      const textSelection = await bindAgentTextSelection({ ...settings, profiles }, textKeyId, textModel)
      const textProfile = textSelection.profile
      profiles = textSelection.profiles
      setSettings({
        profiles,
        activeProfileId: imageProfile.id,
        agentApiConfigMode: 'hybrid',
        agentTextProfileId: textProfile.id,
        agentImageProfileId: imageProfile.id,
      })
      setOpen(false)
      setAppMode('agent')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setImageError(message)
      showToast(`配置失败：${message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const busy = textLoading || imageLoading || saving
  const canConfirm = Boolean(imageKeyId && imageModelValue && !imageLoading) && (
    isDesktopRuntime && setupMode === 'image' || Boolean(textKeyId && textModel && !textLoading)
  )

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="配置 Agent">
      <section className="max-h-[calc(100vh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-950">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-balance text-base font-semibold text-gray-900 dark:text-gray-100">配置 Agent</h2>
          <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-[transform,background-color] hover:bg-gray-100 active:scale-[0.96] dark:hover:bg-white/[0.06]" aria-label="关闭"><CloseIcon className="h-4 w-4" /></button>
        </div>

        {isDesktopRuntime && <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-white/[0.05]">
          <button type="button" aria-pressed={setupMode === 'hybrid'} onClick={() => setSetupMode('hybrid')} className={`h-10 rounded-lg text-sm font-medium transition-[transform,background-color,color,box-shadow] active:scale-[0.96] ${setupMode === 'hybrid' ? 'bg-white text-gray-900 shadow-sm dark:bg-white/[0.1] dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}>图文 Agent</button>
          <button type="button" aria-pressed={setupMode === 'image'} onClick={() => setSetupMode('image')} className={`h-10 rounded-lg text-sm font-medium transition-[transform,background-color,color,box-shadow] active:scale-[0.96] ${setupMode === 'image' ? 'bg-white text-gray-900 shadow-sm dark:bg-white/[0.1] dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}>只生图</button>
        </div>}

        {session.status === 'loading' ? <p className="text-sm text-gray-500">正在加载可用 Key...</p> : session.status === 'error' ? <p className="text-sm text-amber-600">Key 加载失败：{session.error || '请重试'}</p> : session.status === 'invalid' ? <p className="text-sm text-amber-600">请从 Sub2API 菜单入口打开以加载 Key。</p> : usableKeys.length === 0 ? <p className="text-sm text-gray-500">没有可用 Key，请先在 Sub2API 中创建 Key。</p> : <div>
          {(!isDesktopRuntime || setupMode === 'hybrid') && <section className="border-b border-gray-200 pb-5 dark:border-white/[0.08]">
            <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">文本</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-gray-500 dark:text-gray-400">分组
                <select value={textKeyId} onChange={(event) => setTextKeyId(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100">
                  {usableKeys.map((key) => <option key={key.id} value={key.id}>{getSub2ApiKeyLabel(key)}</option>)}
                </select>
              </label>
              <label className="block text-xs text-gray-500 dark:text-gray-400">Responses 模型
                <select value={textModel} onChange={(event) => setTextModel(event.target.value)} disabled={textLoading || textModels.length === 0} className="mt-1.5 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-blue-400 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100">
                  {textModels.length === 0 ? <option value="">{textLoading ? '正在加载...' : '没有可用模型'}</option> : textModels.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>
            {textError && <p className="mt-2 text-pretty text-xs text-amber-600 dark:text-amber-400">{textError}</p>}
          </section>}

          <section className={!isDesktopRuntime || setupMode === 'hybrid' ? 'pt-5' : undefined}>
            <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">生图</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-gray-500 dark:text-gray-400">分组
                <select value={imageKeyId} onChange={(event) => setImageKeyId(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100">
                  {usableKeys.map((key) => <option key={key.id} value={key.id}>{getSub2ApiKeyLabel(key)}</option>)}
                </select>
              </label>
              <label className="block text-xs text-gray-500 dark:text-gray-400">图片模型
                <select value={imageModelValue} onChange={(event) => setImageModelValue(event.target.value)} disabled={imageLoading || imageModels.length === 0} className="mt-1.5 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-blue-400 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100">
                  {imageModels.length === 0 ? <option value="">{imageLoading ? '正在加载...' : '没有可用模型'}</option> : imageModels.map((item) => <option key={`${item.provider}:${item.model}`} value={`${item.provider}:${item.model}`}>{item.model} · {item.provider === 'gemini' ? 'Gemini' : 'OpenAI'}</option>)}
                </select>
              </label>
            </div>
            {imageError && <p className="mt-2 text-pretty text-xs text-amber-600 dark:text-amber-400">{imageError}</p>}
          </section>

          <button type="button" disabled={!canConfirm || busy} onClick={() => void confirm()} className="mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 text-sm font-medium text-white transition-[transform,background-color,opacity] hover:bg-blue-700 active:scale-[0.96] disabled:opacity-50">{saving ? '正在保存...' : isDesktopRuntime && setupMode === 'image' ? '开始生图' : '保存'}</button>
        </div>}
      </section>
    </div>
  )
}
