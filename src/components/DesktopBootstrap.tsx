import { useEffect, useState, type ReactNode } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { getDesktopLibraryStatus, initializeDesktopLibrary, type DesktopLibraryStatus } from '../lib/runtime'

export default function DesktopBootstrap({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DesktopLibraryStatus | null>(null)
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getDesktopLibraryStatus()
      .then((next) => {
        setStatus(next)
        setPath(next.path ?? next.suggestedPath)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  if (status?.initialized) return children

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6 dark:bg-gray-950">
      <section className="w-full max-w-xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-gray-900">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">设置素材库</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">确认保存位置后，AWAI 才会创建素材目录和数据库。</p>
        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">素材库位置</span>
          <div className="flex gap-2">
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/[0.12] dark:bg-gray-950 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={() => void open({ directory: true, multiple: false, defaultPath: path }).then((selected) => {
                if (typeof selected === 'string') setPath(selected)
              })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 dark:border-white/[0.12] dark:text-gray-200"
            >
              选择
            </button>
          </div>
        </label>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          disabled={loading || !path.trim()}
          onClick={() => {
            setLoading(true)
            setError(null)
            void initializeDesktopLibrary(path.trim())
              .then(setStatus)
              .catch((err) => setError(err instanceof Error ? err.message : String(err)))
              .finally(() => setLoading(false))
          }}
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? '处理中' : '确认并创建'}
        </button>
      </section>
    </main>
  )
}
