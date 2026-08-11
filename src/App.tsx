import { useEffect } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import AgentWorkspace from './components/AgentWorkspace'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import { FavoriteCollectionPickerModal, FavoriteCollectionsView, ManageCollectionsModal } from './components/FavoriteCollections'
import { useGlobalClickSuppression } from './lib/clickSuppression'
import { hydrateSub2ApiProfiles, initializeSub2ApiSession, useSub2ApiSession } from './lib/sub2apiSession'
import CloudBackupDisclosure from './components/CloudBackupDisclosure'
import AgentSetupModal from './components/AgentSetupModal'
import { isDesktopRuntime } from './lib/runtime'
import { getAgentProfileValidationError } from './lib/agentProfileValidation'
import { shouldOpenAgentSetup } from './lib/agentStartup'

const releaseMode = import.meta.env.VITE_AWAI_RELEASE_MODE === 'true'

export default function App() {
  const sub2api = useSub2ApiSession()
  const setSettings = useStore((s) => s.setSettings)
  const settings = useStore((s) => s.settings)
  const appMode = useStore((s) => s.appMode)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  useEffect(() => {
    let refreshing = false
    let disposed = false
    const refreshSub2Api = async (openSetupIfNeeded = false) => {
      if (refreshing || disposed) return
      refreshing = true
      try {
        const session = await initializeSub2ApiSession()
        if (disposed || session.status !== 'ready') return
        const state = useStore.getState()
        const profiles = await hydrateSub2ApiProfiles(state.settings.profiles)
        if (disposed) return
        state.setSettings({ ...state.settings, profiles })
        if (!openSetupIfNeeded) return

        if (session.context && shouldOpenAgentSetup(useStore.getState().settings, session.keys)) {
          useStore.getState().setAppMode('agent')
        }
      } finally {
        refreshing = false
      }
    }
    const initialize = async () => {
      if (!useStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const unsubscribe = useStore.persist.onFinishHydration(() => {
            unsubscribe()
            resolve()
          })
        })
      }
      if (disposed) return

      const searchParams = new URLSearchParams(window.location.search)
      const clearAppliedUrlSettings = () => {
        if (!hasUrlSettingParams(searchParams)) return

        clearUrlSettingParams(searchParams)

        const nextSearch = searchParams.toString()
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
        window.history.replaceState(null, '', nextUrl)
      }

      const currentSettings = useStore.getState().settings
      const nextSettings = releaseMode ? currentSettings : buildSettingsFromUrlParams(currentSettings, searchParams)

      setSettings(nextSettings)

      clearAppliedUrlSettings()

      initStore()
      void refreshSub2Api(true)
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshSub2Api()
    }
    void initialize()
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      disposed = true
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [setSettings])

  useEffect(() => {
    if (isDesktopRuntime || sub2api.status !== 'ready' || appMode !== 'agent') return
    const error = getAgentProfileValidationError(settings, {
      requireHybrid: true,
      keys: sub2api.keys,
    })
    if (!error) return

    const state = useStore.getState()
    state.setAppMode('gallery')
    state.setAgentSetupOpen(true)
  }, [appMode, settings, sub2api.keys, sub2api.status])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  if (sub2api.status === 'invalid') {
    return <main className="flex min-h-screen items-center justify-center p-6 text-center text-gray-700 dark:text-gray-200">入口无效</main>
  }

  if (sub2api.status === 'error') {
    return <main className="flex min-h-screen items-center justify-center p-6 text-center text-red-600">{sub2api.error || 'Sub2API 连接失败'}</main>
  }

  return (
    <>
      <div className={appMode === 'agent' ? 'flex h-[100dvh] min-h-0 flex-col overflow-hidden' : 'contents'}>
        <Header />
        {appMode === 'agent' ? (
          <AgentWorkspace />
        ) : (
          <main data-home-main data-drag-select-surface className="pb-48">
            <div className="safe-area-x max-w-7xl mx-auto">
              <SearchBar />
              {filterFavorite && !activeFavoriteCollectionId ? <FavoriteCollectionsView /> : <TaskGrid />}
            </div>
          </main>
        )}
      </div>
      <InputBar />
      <DetailModal />
      <Lightbox />
      <SettingsModal />
      <ConfirmDialog />
      <FavoriteCollectionPickerModal />
      <ManageCollectionsModal />
      <Toast />
      <MaskEditorModal />
      <ImageContextMenu />
      <AgentSetupModal />
      {!isDesktopRuntime && <CloudBackupDisclosure />}
    </>
  )
}
