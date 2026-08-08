export type DesktopUpdateChoice = 'install' | 'later' | 'skip'

export function getDesktopUpdateChoiceKey(version: string) {
  return `desktop-update-choice:${version}`
}

export function shouldShowDesktopUpdate(version: string, skippedVersion: string | null) {
  return version !== skippedVersion
}

export function getDesktopUpdateFailureMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error)
  return `验签或安装失败：${detail}。当前版本仍可继续使用。`
}
