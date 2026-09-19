// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { create } from 'zustand'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ApiProfile, AppSettings } from './types'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS, normalizeSettings } from './lib/apiProfiles'

const mocks = vi.hoisted(() => ({ hydrate: vi.fn(), initialize: vi.fn(), session: { status: 'loading', keys: [] as object[], context: {} } }))
const store = Object.assign(create<{
  settings: AppSettings
  appMode: string
  agentSetupOpen: boolean
  setSettings: (settings: Partial<AppSettings>) => void
  setAppMode: (appMode: string) => void
  setAgentSetupOpen: (agentSetupOpen: boolean) => void
}>((set) => ({
  settings: DEFAULT_SETTINGS,
  appMode: 'agent',
  agentSetupOpen: false,
  setSettings: (settings) => set((state) => ({ settings: normalizeSettings({ ...state.settings, ...settings }) })),
  setAppMode: (appMode) => set({ appMode }),
  setAgentSetupOpen: (agentSetupOpen) => set({ agentSetupOpen }),
})), { persist: { hasHydrated: () => true } })
vi.mock('./store', () => ({ useStore: Object.assign((selector: (state: ReturnType<typeof store.getState>) => unknown) => store(selector), { getState: () => store.getState(), persist: { hasHydrated: () => true } }), initStore: vi.fn() }))
vi.mock('./lib/sub2apiSession', () => ({ useSub2ApiSession: () => mocks.session, initializeSub2ApiSession: mocks.initialize, hydrateSub2ApiProfiles: mocks.hydrate }))
vi.mock('./hooks/useDockerApiUrlMigrationNotice', () => ({ useDockerApiUrlMigrationNotice: vi.fn() }))
vi.mock('./lib/clickSuppression', () => ({ useGlobalClickSuppression: vi.fn() }))
vi.mock('./components/Header', () => ({ default: () => null }))
vi.mock('./components/SearchBar', () => ({ default: () => null }))
vi.mock('./components/TaskGrid', () => ({ default: () => null }))
vi.mock('./components/AgentWorkspace', () => ({ default: () => null }))
vi.mock('./components/InputBar', () => ({ default: () => null }))
vi.mock('./components/DetailModal', () => ({ default: () => null }))
vi.mock('./components/Lightbox', () => ({ default: () => null }))
vi.mock('./components/SettingsModal', () => ({ default: () => null }))
vi.mock('./components/ConfirmDialog', () => ({ default: () => null }))
vi.mock('./components/Toast', () => ({ default: () => null }))
vi.mock('./components/MaskEditorModal', () => ({ default: () => null }))
vi.mock('./components/ImageContextMenu', () => ({ default: () => null }))
vi.mock('./components/FavoriteCollections', () => ({ FavoriteCollectionPickerModal: () => null, FavoriteCollectionsView: () => null, ManageCollectionsModal: () => null }))
vi.mock('./components/CloudBackupDisclosure', () => ({ default: () => null }))
vi.mock('./components/AgentSetupModal', () => ({ default: () => null }))
import App from './App'

let root: Root
let container: HTMLDivElement
let finishHydration: (profiles: ApiProfile[]) => void
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const text = createDefaultOpenAIProfile({ id: 'text', apiMode: 'responses', model: 'gpt-5.6-sol', keyId: 'key', apiKey: '' })
  const image = createDefaultOpenAIProfile({ id: 'image', keyId: 'key', apiKey: '' })
  store.setState({ settings: normalizeSettings({ ...DEFAULT_SETTINGS, profiles: [text, image], activeProfileId: 'image', agentTextProfileId: 'text', agentImageProfileId: 'image', agentApiConfigMode: 'hybrid' }), appMode: 'agent', agentSetupOpen: false })
  mocks.session = { status: 'loading', context: {}, keys: [] }
  mocks.initialize.mockImplementation(async () => {
    mocks.session = { status: 'ready', context: {}, keys: [{ id: 'key', status: 'active' }] }
    return mocks.session
  })
  mocks.hydrate.mockImplementation(() => new Promise<ApiProfile[]>((resolve) => { finishHydration = resolve }))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

it('Key 恢复完成前不把已保存的 Agent 配置误判为缺失', async () => {
  await act(async () => root.render(<App />))
  // 模拟 useSyncExternalStore 在身份接口完成后立即通知组件。
  await act(async () => root.render(<App />))
  expect(store.getState().agentSetupOpen).toBe(false)
  expect(store.getState().appMode).toBe('agent')
  await act(async () => finishHydration(store.getState().settings.profiles.map((profile) => ({ ...profile, apiKey: 'test-only' }))))
  expect(store.getState().agentSetupOpen).toBe(false)
  expect(store.getState().appMode).toBe('agent')
})

it('Key 确实失效时在恢复完成后提示重新配置', async () => {
  await act(async () => root.render(<App />))
  await act(async () => finishHydration(store.getState().settings.profiles))
  expect(store.getState().agentSetupOpen).toBe(true)
  expect(store.getState().appMode).toBe('gallery')
})
