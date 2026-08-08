import { describe, expect, it } from 'vitest'

import { getDesktopUpdateChoiceKey, getDesktopUpdateFailureMessage, shouldShowDesktopUpdate } from './desktopUpdate'

describe('desktop updates', () => {
  it('keeps a skipped version distinct from later reminders', () => {
    expect(getDesktopUpdateChoiceKey('1.2.3')).toBe('desktop-update-choice:1.2.3')
    expect(shouldShowDesktopUpdate('1.2.3', '1.2.3')).toBe(false)
    expect(shouldShowDesktopUpdate('1.2.4', '1.2.3')).toBe(true)
    expect(shouldShowDesktopUpdate('1.2.3', null)).toBe(true)
  })

  it('keeps the current version usable when signature verification rejects an update', () => {
    expect(getDesktopUpdateFailureMessage(new Error('签名无效'))).toBe('验签或安装失败：签名无效。当前版本仍可继续使用。')
  })
})
