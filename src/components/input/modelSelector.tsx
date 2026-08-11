import { useEffect, useMemo, useState } from 'react'
import type { ApiProfile, ApiProvider } from '../../types'
import { bindSub2ApiProfile, discoverModelsForKey, useSub2ApiSession } from '../../lib/sub2apiSession'
import { isSub2ApiKeyUsable } from '../../lib/sub2api'
import { filterDiscoveredModels, getModelCapability } from '../../lib/modelCapabilities'
import { createDefaultGeminiProfile, createDefaultOpenAIProfile } from '../../lib/apiProfiles'
import { isDesktopRuntime } from '../../lib/runtime'
import ModelBrandIcon from '../modelBrandIcon'

interface ModelSelectorProps {
  settingsProfiles: ApiProfile[]
  activeProfile: ApiProfile
  onSelectProfile: (profile: ApiProfile) => void
  onProfilesChange: (profiles: ApiProfile[], activeProfileId: string) => void
  compact?: boolean
}

function createProfileId(provider: ApiProvider) {
  return `${provider}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export default function ModelSelector({ settingsProfiles, activeProfile, onSelectProfile, onProfilesChange, compact = false }: ModelSelectorProps) {
  const session = useSub2ApiSession()
  const [models, setModels] = useState<{ openai: string[], gemini: string[] }>({ openai: [], gemini: [] })
  const [errors, setErrors] = useState<{ openai?: string, gemini?: string }>({})
  const [loading, setLoading] = useState(false)
  const keyOptions = useMemo(() => session.keys.map((item) => ({
    ...item,
    usable: isSub2ApiKeyUsable(item),
  })), [session.keys])

  const loadModels = async (keyId: string) => {
    if (!keyId) {
      setModels({ openai: [], gemini: [] })
      setErrors({})
      return
    }
    setLoading(true)
    setErrors({})
    try {
      const result = await discoverModelsForKey(keyId)
      setModels({
        openai: filterDiscoveredModels('openai', result.openai, 'image'),
        gemini: filterDiscoveredModels('gemini', result.gemini, 'image'),
      })
      setErrors(result.errors)
    } catch (err) {
      setModels({ openai: [], gemini: [] })
      setErrors({ openai: err instanceof Error ? err.message : String(err) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadModels(activeProfile.keyId ?? '')
  }, [activeProfile.keyId])

  const selectKey = async (keyId: string) => {
    const profile = await bindSub2ApiProfile(activeProfile, keyId || null)
    onProfilesChange(settingsProfiles.map((item) => item.id === profile.id ? profile : item), profile.id)
    onSelectProfile(profile)
  }

  const selectModel = async (provider: 'openai' | 'gemini', model: string) => {
    const existing = settingsProfiles.find((item) =>
      item.keyId === activeProfile.keyId && item.provider === provider && item.model === model && item.apiMode === 'images',
    )
    if (existing) {
      onProfilesChange(settingsProfiles, existing.id)
      onSelectProfile(existing)
      return
    }

    const base = provider === 'gemini'
      ? createDefaultGeminiProfile({ id: createProfileId(provider) })
      : createDefaultOpenAIProfile({ id: createProfileId(provider), apiMode: 'images' })
    const profile = await bindSub2ApiProfile({
      ...base,
      name: model,
      provider,
      model,
      keyId: activeProfile.keyId,
    }, activeProfile.keyId ?? null)
    onProfilesChange([...settingsProfiles, profile], profile.id)
    onSelectProfile(profile)
  }

  const [compactOpen, setCompactOpen] = useState(false)
  const [compactKeyId, setCompactKeyId] = useState(activeProfile.keyId ?? '')

  useEffect(() => {
    setCompactKeyId(activeProfile.keyId ?? '')
  }, [activeProfile.keyId])

  const activeCapability = getModelCapability(activeProfile.provider, activeProfile.model, activeProfile.apiMode)
  if (session.status === 'loading') return <p className="text-[11px] text-gray-400 dark:text-gray-500">正在加载可用 Key…</p>
  if (session.status === 'error') return <p className="text-[11px] text-amber-600 dark:text-amber-400">Key 加载失败：{session.error || '请重试'}</p>
  if (session.status === 'invalid') return <p className="text-[11px] text-amber-600 dark:text-amber-400">请从 Sub2API 菜单入口打开以加载 Key。</p>
  if (keyOptions.length === 0) {
    return <p className="text-[11px] text-gray-400 dark:text-gray-500">{isDesktopRuntime ? '暂无可用凭据，请在设置中添加或绑定凭据。' : '暂无可用 Key，请先在 Sub2API 中创建或启用 Key。'}</p>
  }
  if (compact) {
    const compactModels = compactKeyId === activeProfile.keyId ? models : { openai: [], gemini: [] }
    const activeKey = keyOptions.find((item) => item.id === activeProfile.keyId)
    const activeGroup = activeKey?.group || activeKey?.name || activeProfile.keyId || '未绑定'
    const activeModel = activeProfile.model || '选择模型'
    return (
      <div className="relative min-w-0">
        <button type="button" onClick={() => setCompactOpen((open) => !open)} className="flex h-10 min-w-0 max-w-28 items-center gap-1.5 rounded-xl border border-gray-200/60 bg-white/50 px-2 text-left text-xs text-gray-700 transition-transform active:scale-[0.96] sm:max-w-56 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200" aria-expanded={compactOpen} aria-label={`切换生图模型。模型：${activeModel}；分组：${activeGroup}`} title={`生图模型：${activeModel} · 分组：${activeGroup}`}>
          <ModelBrandIcon model={activeProfile.model} />
          <span className="min-w-0 truncate">{activeModel}</span>
        </button>
        {compactOpen && <>
          <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="关闭 Key 与模型菜单" onClick={() => setCompactOpen(false)} />
          <div className="absolute bottom-full -left-[2.875rem] z-40 mb-2 grid w-[min(34rem,calc(100vw-2rem))] grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-white/[0.08] dark:bg-gray-900 sm:left-0">
            <div className="border-r border-gray-100 p-2 dark:border-white/[0.08]">
              <p className="px-2 pb-1 text-[11px] text-gray-400">Key</p>
              {keyOptions.map((item) => <button key={item.id} type="button" disabled={!item.usable} onClick={() => { setCompactKeyId(item.id); void selectKey(item.id) }} className={`flex min-h-10 w-full items-center rounded-lg px-2 text-left text-xs ${item.id === activeProfile.keyId ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}><span className="truncate">{item.name || item.id}{item.group ? ` · ${item.group}` : ''}</span></button>)}
            </div>
            <div className="p-2">
              <div className="flex items-center justify-between px-2 pb-1"><p className="text-[11px] text-gray-400">模型</p>{compactKeyId && <button type="button" onClick={() => void loadModels(compactKeyId)} className="min-h-8 px-1 text-[11px] text-blue-600 dark:text-blue-400">{loading ? '加载中' : '刷新'}</button>}</div>
              {!compactKeyId ? <p className="px-2 py-2 text-xs text-gray-400">先选择 Key</p> : <div className="max-h-52 overflow-y-auto">{(['openai', 'gemini'] as const).map((provider) => compactModels[provider].length > 0 && <div key={provider}><p className="px-2 py-1 text-[10px] text-gray-400">{provider === 'openai' ? 'OpenAI' : 'Gemini'}</p>{compactModels[provider].map((model) => <button key={model} type="button" onClick={() => { void selectModel(provider, model); setCompactOpen(false) }} className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.06]"><ModelBrandIcon model={model} /><span className="min-w-0 truncate">{model}</span></button>)}</div>)}</div>}
            </div>
          </div>
        </>}
      </div>
    )
  }
  return (
    <div className={compact ? 'flex min-w-0 items-center gap-1.5' : 'grid min-w-0 grid-cols-2 gap-2 text-xs sm:grid-cols-[minmax(9rem,1fr)_minmax(11rem,1.3fr)]'}>
      <label className="flex min-w-0 flex-col gap-0.5">
        {!compact && <span className="ml-1 text-gray-400 dark:text-gray-500">Key</span>}
        <select
          value={activeProfile.keyId ?? ''}
          onChange={(event) => void selectKey(event.target.value)}
          className={compact ? 'h-9 min-w-24 max-w-36 rounded-xl border border-gray-200/60 bg-white/50 px-2 text-left text-xs text-gray-700 outline-none focus:ring-1 focus:ring-blue-300/40 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200' : 'h-9 min-w-0 rounded-xl border border-gray-200/60 bg-white/50 px-2 text-left text-xs text-gray-700 shadow-sm outline-none focus:ring-1 focus:ring-blue-300/40 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200'}
        >
          <option value="">选择 Key</option>
          {keyOptions.map((item) => (
            <option key={item.id} value={item.id} disabled={!item.usable}>
              {item.name || item.id}{item.group ? ` · ${item.group}` : ''}{item.usable ? '' : ' · 不可用'}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-0.5">
        <span className={compact ? 'sr-only' : 'ml-1 flex items-center justify-between gap-1 text-gray-400 dark:text-gray-500'}>
          <span>模型{!activeCapability.verified && activeProfile.model ? ' · 未验证' : ''}</span>
          {activeProfile.keyId && <button type="button" onClick={() => void loadModels(activeProfile.keyId!)} className="min-h-5 text-blue-600 hover:text-blue-700 dark:text-blue-400">{loading ? '加载中' : '刷新'}</button>}
        </span>
        <select
          value={`${activeProfile.provider}:${activeProfile.model}`}
          onChange={(event) => {
            const [provider, ...modelParts] = event.target.value.split(':')
            const model = modelParts.join(':')
            if ((provider === 'openai' || provider === 'gemini') && model) void selectModel(provider, model)
          }}
          disabled={!activeProfile.keyId || loading}
          className={compact ? 'h-9 min-w-32 max-w-44 rounded-xl border border-gray-200/60 bg-white/50 px-2 text-left text-xs text-gray-700 outline-none focus:ring-1 focus:ring-blue-300/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200' : 'h-9 min-w-0 rounded-xl border border-gray-200/60 bg-white/50 px-2 text-left text-xs text-gray-700 shadow-sm outline-none focus:ring-1 focus:ring-blue-300/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200'}
        >
          <option value={`${activeProfile.provider}:${activeProfile.model}`}>{activeProfile.model || '选择模型'}</option>
          {models.openai.length > 0 && <optgroup label="OpenAI">{models.openai.map((model) => <option key={`openai:${model}`} value={`openai:${model}`}>{model}</option>)}</optgroup>}
          {models.gemini.length > 0 && <optgroup label="Gemini">{models.gemini.map((model) => <option key={`gemini:${model}`} value={`gemini:${model}`}>{model}</option>)}</optgroup>}
        </select>
      </label>
      {(errors.openai || errors.gemini) && <p className="col-span-full text-[11px] text-amber-600 dark:text-amber-400">{[errors.openai && `OpenAI：${errors.openai}`, errors.gemini && `Gemini：${errors.gemini}`].filter(Boolean).join('；')}</p>}
    </div>
  )
}
