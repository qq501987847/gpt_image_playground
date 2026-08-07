import { useEffect, useState } from 'react'

function compareVersions(a: string, b: string) {
  const aParts = a.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const bParts = b.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(aParts.length, bParts.length)

  for (let i = 0; i < length; i += 1) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0)
    if (diff !== 0) return diff
  }

  return 0
}

export function useVersionCheck(hasActiveTasks: boolean) {
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false

    const check = () => {
      fetch('version.json', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        const version = typeof data.version === 'string' ? data.version : ''
        if (version && compareVersions(version, __APP_VERSION__) > 0) {
          setLatestVersion(version)
        }
      })
      .catch(() => {
        // 静默失败，不影响创作流程。
      })
    }

    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    check()

    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    setLatestVersion(null)
  }

  const hasUpdate = latestVersion !== null && !dismissed && !hasActiveTasks
  const deferred = latestVersion !== null && hasActiveTasks

  return { hasUpdate, deferred, dismiss }
}
