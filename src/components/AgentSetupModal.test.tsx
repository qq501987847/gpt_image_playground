// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { create } from 'zustand'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from '../lib/apiProfiles'
import type { AppSettings } from '../types'
import type { Sub2ApiKey } from '../lib/sub2api'

const session = vi.hoisted(() => ({
  status: 'ready',
  keys: [{ id: 'key', name: '测试 Key', value: 'test-only', group: '测试', status: 'active' }] as Sub2ApiKey[],
}))
const store = create<{
  agentSetupOpen: boolean
  settings: AppSettings
  setAgentSetupOpen: (open: boolean) => void
  setSettings: (settings: Partial<AppSettings>) => void
  setAppMode: ReturnType<typeof vi.fn>
  showToast: ReturnType<typeof vi.fn>
}>((set) => ({
  agentSetupOpen: true,
  settings: DEFAULT_SETTINGS,
  setAgentSetupOpen: (agentSetupOpen) => set({ agentSetupOpen }),
  setSettings: (settings) => set((state) => ({ settings: normalizeSettings({ ...state.settings, ...settings }) })),
  setAppMode: vi.fn(),
  showToast: vi.fn(),
}))
vi.mock('../store', () => ({ useStore: (selector: (state: ReturnType<typeof store.getState>) => unknown) => store(selector) }))
vi.mock('../lib/sub2apiSession', () => ({
  useSub2ApiSession: () => session,
  discoverModelsForKey: vi.fn(async () => ({ openai: ['gpt-5.6-sol', 'gpt-image-2', 'gpt-image-2.5'], gemini: [], errors: {} })),
  bindSub2ApiProfile: async (profile: object, keyId: string) => ({ ...profile, keyId, apiKey: 'test-only', baseUrl: 'https://example.test' }),
}))
import AgentSetupModal from './AgentSetupModal'

let root: Root
let container: HTMLDivElement
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  store.setState({ agentSetupOpen: true, settings: DEFAULT_SETTINGS })
  session.keys = [{ id: 'key', name: '测试 Key', value: 'test-only', group: '测试', status: 'active' }]
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<AgentSetupModal />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

it('保留刷新会话和恢复 Key 时正在编辑的模型，并保存实际选择', async () => {
  const imageSelect = container.querySelectorAll('select')[3]
  await act(async () => {
    imageSelect.value = 'openai:gpt-image-2.5'
    imageSelect.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => {
    session.keys = session.keys.map((key) => ({ ...key }))
    store.getState().setSettings({ profiles: [...store.getState().settings.profiles] })
  })
  expect(imageSelect.value).toBe('openai:gpt-image-2.5')
  expect(imageSelect.options.length).toBe(2)
  const save = [...container.querySelectorAll('button')].find((button) => button.textContent === '保存')!
  expect(save.disabled).toBe(false)
  await act(async () => save.click())
  expect(store.getState().agentSetupOpen).toBe(false)
  expect(store.getState().settings.profiles.find((profile) => profile.id === store.getState().settings.agentImageProfileId)?.model).toBe('gpt-image-2.5')
})

it('关闭再打开时恢复已保存配置，不保留上次取消的草稿', async () => {
  const imageSelect = container.querySelectorAll('select')[3]
  await act(async () => {
    imageSelect.value = 'openai:gpt-image-2.5'
    imageSelect.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => store.getState().setAgentSetupOpen(false))
  await act(async () => store.getState().setAgentSetupOpen(true))
  expect(container.querySelectorAll('select')[3].value).toBe('openai:gpt-image-2')
})

it('刷新后所选 Key 已停用时不能保存失效配置', async () => {
  await act(async () => {
    session.keys = [...session.keys.map((key) => ({ ...key, status: 'disabled' })), { id: 'other', name: '其他 Key', value: 'test-other', group: '其他', status: 'active' }]
    store.getState().setSettings({ profiles: [...store.getState().settings.profiles] })
  })
  const save = [...container.querySelectorAll('button')].find((button) => button.textContent === '保存')!
  expect(save.disabled).toBe(true)
})
