import { useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'

import { appRuntime } from '../lib/runtime'
import { getDesktopUpdateChoiceKey, getDesktopUpdateFailureMessage, shouldShowDesktopUpdate } from '../lib/desktopUpdate'

export default function DesktopUpdatePrompt() {
  const [update, setUpdate] = useState<Update | null>(null)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void check()
      .then(async (next) => {
        if (!next) return
        const skipped = await appRuntime.metadata.getItem(getDesktopUpdateChoiceKey(next.version))
        if (!shouldShowDesktopUpdate(next.version, skipped)) {
          await next.close()
          return
        }
        setUpdate(next)
      })
      .catch((err) => console.warn('desktop update check failed', err))
  }, [])

  if (!update) return null

  const incompatible = update.rawJson.incompatible === true

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true" aria-labelledby="desktop-update-title">
      <section className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
        <h2 id="desktop-update-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">发现稳定版更新 {update.version}</h2>
        {incompatible && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">当前版本与服务不兼容，需要由你确认后更新。不会自动安装。</p>}
        {update.body && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{update.body}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{getDesktopUpdateFailureMessage(error)}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={installing} onClick={() => void update.close().then(() => setUpdate(null))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50 dark:border-white/[0.12] dark:text-gray-200">稍后提醒</button>
          <button type="button" disabled={installing} onClick={() => void appRuntime.metadata.setItem(getDesktopUpdateChoiceKey(update.version), update.version).then(() => update.close()).then(() => setUpdate(null))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50 dark:border-white/[0.12] dark:text-gray-200">跳过此版本</button>
          <button
            type="button"
            disabled={installing}
            onClick={() => {
              setInstalling(true)
              setError(null)
              void update.downloadAndInstall()
                .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setInstalling(false))
            }}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {installing ? '正在验证并安装' : '立即更新'}
          </button>
        </div>
      </section>
    </div>
  )
}
