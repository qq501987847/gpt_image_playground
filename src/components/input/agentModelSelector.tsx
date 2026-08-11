import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store'
import { bindAgentImageSelection, bindAgentTextSelection } from '../../lib/agentProfileSelection'
import { getAgentImageApiProfile, getAgentTextApiProfile } from '../../lib/apiProfiles'
import { filterDiscoveredModels } from '../../lib/modelCapabilities'
import { getSub2ApiKeyLabel, isSub2ApiKeyUsable } from '../../lib/sub2api'
import { discoverModelsForKey, useSub2ApiSession } from '../../lib/sub2apiSession'
import ModelBrandIcon from '../modelBrandIcon'

interface AgentModelSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SelectorKind = 'text' | 'image'

interface ModelOption {
  provider: 'openai' | 'gemini'
  model: string
}

export default function AgentModelSelector({ open, onOpenChange }: AgentModelSelectorProps) {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const showToast = useStore((s) => s.showToast)
  const session = useSub2ApiSession()
  const [kind, setKind] = useState<SelectorKind | null>(null)
  const [keyId, setKeyId] = useState('')
  const [models, setModels] = useState<ModelOption[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const usableKeys = useMemo(() => session.keys.filter(isSub2ApiKeyUsable), [session.keys])
  const textProfile = useMemo(() => getAgentTextApiProfile(settings), [settings])
  const imageProfile = useMemo(() => getAgentImageApiProfile(settings), [settings])
  const textKey = usableKeys.find((key) => key.id === textProfile?.keyId)
  const imageKey = usableKeys.find((key) => key.id === imageProfile?.keyId)
  const textGroup = textKey?.group || textKey?.name || textProfile?.keyId || '未绑定'
  const imageGroup = imageKey?.group || imageKey?.name || imageProfile?.keyId || '未绑定'
  const activeProfile = kind === 'text' ? textProfile : imageProfile

  useEffect(() => {
    if (!open) {
      setKind(null)
      return
    }
    if (!kind) return
    setKeyId(activeProfile?.keyId ?? usableKeys[0]?.id ?? '')
    setModels([])
    setError('')
  }, [activeProfile?.keyId, kind, open, usableKeys])

  useEffect(() => {
    if (!open || !kind || !keyId) return
    let cancelled = false
    setLoading(true)
    setError('')
    void discoverModelsForKey(keyId)
      .then((result) => {
        if (cancelled) return
        const next = kind === 'text'
          ? filterDiscoveredModels('openai', result.openai, 'responses').map((model) => ({ provider: 'openai' as const, model }))
          : [
              ...filterDiscoveredModels('openai', result.openai, 'image').map((model) => ({ provider: 'openai' as const, model })),
              ...filterDiscoveredModels('gemini', result.gemini, 'image').map((model) => ({ provider: 'gemini' as const, model })),
            ]
        setModels(next)
        if (next.length === 0) setError(result.errors.openai || result.errors.gemini || `当前分组没有可用${kind === 'text' ? '文本' : '生图'}模型`)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [keyId, kind, open])

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setKind(null)
      onOpenChange(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onOpenChange, open])

  const toggle = (next: SelectorKind) => {
    if (open && kind === next) {
      setKind(null)
      onOpenChange(false)
      return
    }
    setKind(next)
    onOpenChange(true)
  }

  const selectModel = async (option: ModelOption) => {
    if (!kind || !keyId || saving) return
    setSaving(true)
    setError('')
    try {
      const current = useStore.getState().settings
      if (kind === 'text') {
        const result = await bindAgentTextSelection(current, keyId, option.model)
        setSettings({
          profiles: result.profiles,
          agentApiConfigMode: 'hybrid',
          agentTextProfileId: result.profile.id,
        })
      } else {
        const result = await bindAgentImageSelection(current, keyId, option.provider, option.model)
        setSettings({
          profiles: result.profiles,
          activeProfileId: result.profile.id,
          agentApiConfigMode: 'hybrid',
          agentImageProfileId: result.profile.id,
        })
      }
      setKind(null)
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      showToast(`切换${kind === 'text' ? '文本' : '生图'}模型失败：${message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const renderButton = (buttonKind: SelectorKind, group: string, model: string) => {
    const label = buttonKind === 'text' ? '文本' : '生图'
    return (
      <button
        type="button"
        onClick={() => toggle(buttonKind)}
        className={`relative z-50 flex h-10 min-w-0 flex-1 items-center gap-1 rounded-xl border px-2 text-left text-[10px] outline-none transition-[transform,background-color,border-color] focus-visible:ring-2 focus-visible:ring-blue-400/50 active:scale-[0.96] sm:max-w-56 sm:flex-initial sm:text-xs ${open && kind === buttonKind ? 'border-blue-300 bg-blue-50/80 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-300' : 'border-gray-200/60 bg-white/50 text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400'}`}
        aria-expanded={open && kind === buttonKind}
        aria-label={`切换${label}模型。模型：${model}；分组：${group}`}
        title={`${label}模型：${model} · 分组：${group}`}
      >
        <ModelBrandIcon model={model} />
        <span className="min-w-0 truncate">{model}</span>
      </button>
    )
  }

  return (
    <div className="relative flex min-w-0 max-w-lg flex-1 items-center gap-1 sm:flex-initial">
      {renderButton('text', textGroup, textProfile?.model || '未配置')}
      {renderButton('image', imageGroup, imageProfile?.model || '未配置')}

      {open && kind && <>
        <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="关闭 Agent 模型菜单" onClick={() => { setKind(null); onOpenChange(false) }} />
        <section className="absolute bottom-full -right-[7.75rem] z-50 mb-2 grid w-[calc(100vw-2rem)] max-w-[34rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-white/[0.08] dark:bg-gray-900 sm:left-0 sm:right-auto">
          {session.status !== 'ready' ? (
            <p className="col-span-2 p-3 text-xs text-amber-600 dark:text-amber-400">{session.status === 'loading' ? '正在加载可用分组...' : session.error || '可用分组加载失败'}</p>
          ) : usableKeys.length === 0 ? (
            <p className="col-span-2 p-3 text-xs text-gray-500 dark:text-gray-400">没有可用分组</p>
          ) : <>
            <div className="border-r border-gray-100 p-2 dark:border-white/[0.08]">
              <p className="px-2 pb-1 text-[11px] text-gray-400">{kind === 'text' ? '文本分组' : '生图分组'}</p>
              <div className="max-h-60 overflow-y-auto">
                {usableKeys.map((key) => (
                  <button
                    key={key.id}
                    type="button"
                    onClick={() => setKeyId(key.id)}
                    className={`flex min-h-10 w-full items-center rounded-lg px-2 text-left text-xs transition-[background-color,color] ${key.id === keyId ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
                    title={getSub2ApiKeyLabel(key)}
                  >
                    <span className="truncate">{getSub2ApiKeyLabel(key)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0 p-2">
              <p className="px-2 pb-1 text-[11px] text-gray-400">{kind === 'text' ? '文本模型' : '生图模型'}</p>
              <div className="max-h-60 overflow-y-auto">
                {loading ? (
                  <p className="px-2 py-2 text-xs text-gray-400">正在加载...</p>
                ) : error ? (
                  <p className="px-2 py-2 text-pretty text-xs text-amber-600 dark:text-amber-400">{error}</p>
                ) : models.map((option) => {
                  const selected = activeProfile?.keyId === keyId && activeProfile.model === option.model && activeProfile.provider === option.provider
                  return (
                    <button
                      key={`${option.provider}:${option.model}`}
                      type="button"
                      disabled={saving}
                      onClick={() => void selectModel(option)}
                      className={`flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-xs transition-[background-color,color] disabled:opacity-50 ${selected ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
                    >
                      <ModelBrandIcon model={option.model} />
                      <span className="min-w-0 truncate">{option.model}{kind === 'image' ? ` · ${option.provider === 'gemini' ? 'Gemini' : 'OpenAI'}` : ''}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>}
        </section>
      </>}
    </div>
  )
}
