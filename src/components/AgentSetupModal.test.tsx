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
  store.setState({ agentSetupOpen: true, settings: normalizeSettings({ ...DEFAULT_SETTINGS, agentApiConfigMode: 'hybrid' }) })
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

it('在线版没有文本模型也能选择只生图并保存', async () => {
  const { discoverModelsForKey } = await import('../lib/sub2apiSession')
  await act(async () => store.getState().setAgentSetupOpen(false))
  vi.mocked(discoverModelsForKey).mockResolvedValueOnce({ openai: ['gpt-image-2.5'], gemini: [], errors: {} })
  await act(async () => {
    store.getState().setSettings({ agentApiConfigMode: 'off' })
    store.getState().setAgentSetupOpen(true)
  })
  const imageMode = [...container.querySelectorAll('button')].find((button) => button.textContent === '只生图')
  expect(imageMode).toBeDefined()
  await act(async () => imageMode!.click())
  expect(container.textContent).not.toContain('Responses 模型')
  const save = [...container.querySelectorAll('button')].find((button) => button.textContent === '开始生图')!
  expect(save.disabled).toBe(false)
  await act(async () => save.click())
  expect(store.getState().agentSetupOpen).toBe(false)
  expect(store.getState().settings.agentApiConfigMode).toBe('off')
  expect(store.getState().settings.agentTextProfileId).toBeNull()
  expect(store.getState().setAppMode).toHaveBeenCalledWith('gallery')
})
