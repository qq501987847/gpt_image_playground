import { useEffect, useState } from 'react'
import type { ApiProfile } from '../../types'
import { bindSub2ApiProfile, discoverProfileModels, useSub2ApiSession } from '../../lib/sub2apiSession'
import { isSub2ApiKeyUsable } from '../../lib/sub2api'

export default function Sub2ApiProfileFields({ profile, onChange }: { profile: ApiProfile, onChange: (profile: ApiProfile) => void }) {
  const session = useSub2ApiSession()
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setModels([])
    setError(null)
  }, [profile.id, profile.keyId, profile.provider])

  if (session.status !== 'ready') return null

  return (
    <>
      <label className="block">
        <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">计费 Key</span>
        <select
          value={profile.keyId ?? ''}
          onChange={(event) => void bindSub2ApiProfile(profile, event.target.value || null).then(onChange)}
          className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
        >
          <option value="">请选择 Key</option>
          {session.keys.map((key) => {
            const usable = isSub2ApiKeyUsable(key)
            return (
              <option key={key.id} value={key.id} disabled={!usable}>
                {key.name || key.id}{key.group ? ` · ${key.group}` : ''}{usable ? '' : ' · 不可用'}
              </option>
            )
          })}
        </select>
      </label>
      <div className="block">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-300">模型</span>
          <button
            type="button"
            disabled={!profile.keyId || loading}
            onClick={() => {
              setLoading(true)
              setError(null)
              void discoverProfileModels(profile)
                .then(setModels)
                .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setLoading(false))
            }}
            className="text-xs text-blue-600 disabled:text-gray-400 dark:text-blue-400"
          >
            {loading ? '加载中' : '加载模型'}
          </button>
        </div>
        {models.length > 0 && (
          <select
            value={models.includes(profile.model) ? profile.model : ''}
            onChange={(event) => event.target.value && onChange({ ...profile, model: event.target.value })}
            className="mb-2 w-full min-w-0 truncate rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm dark:border-white/[0.08] dark:bg-white/[0.03]"
          >
            <option value="">选择已发现模型</option>
            {models.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
        )}
        <input
          value={profile.model}
          onChange={(event) => onChange({ ...profile, model: event.target.value })}
          placeholder="自定义模型 ID（未验证）"
          className="w-full min-w-0 rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm dark:border-white/[0.08] dark:bg-white/[0.03]"
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </>
  )
}
