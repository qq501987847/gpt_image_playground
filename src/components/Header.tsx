import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { useVersionCheck } from '../hooks/useVersionCheck'
import { useTooltip } from '../hooks/useTooltip'
import { dismissAllTooltips } from '../lib/tooltipDismiss'
import ViewportTooltip from './ViewportTooltip'
import HelpModal from './HelpModal'
import { useFavoriteCollectionTitle } from './FavoriteCollections'
import { HelpCircleIcon, SettingsIcon } from './icons'

export default function Header() {
  const appMode = useStore((s) => s.appMode)
  const setAppMode = useStore((s) => s.setAppMode)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const agentMobileHeaderVisible = useStore((s) => s.agentMobileHeaderVisible)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const favoriteCollectionTitle = useFavoriteCollectionTitle()
  const showFavoriteCollectionTitle = appMode === 'gallery' && Boolean(activeFavoriteCollectionId)
  const hasActiveTasks = useStore((s) => s.tasks.some((task) => task.status === 'running'))
  const { hasUpdate, deferred, dismiss } = useVersionCheck(hasActiveTasks)
  const [showHelp, setShowHelp] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('up')

  useEffect(() => {
    if (appMode === 'agent') {
      setScrollDirection('up')
      return
    }

    let lastScrollY = window.scrollY
    let ticking = false

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY
          if (currentScrollY < 20) {
            setScrollDirection('up')
          } else if (currentScrollY > lastScrollY + 10) {
            setScrollDirection('down')
          } else if (currentScrollY < lastScrollY - 10) {
            setScrollDirection('up')
          }
          lastScrollY = currentScrollY
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [appMode])

  useEffect(() => {
    if (appMode === 'agent' && !agentMobileHeaderVisible) {
      setHintVisible(true)
      const timer = setTimeout(() => {
        setHintVisible(false)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [appMode, agentMobileHeaderVisible])

  const helpTooltip = useTooltip()
  const settingsTooltip = useTooltip()

  return (
    <>
      <header data-no-drag-select className={`safe-area-top fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-200 dark:border-white/[0.08] transition-transform duration-300 ease-in-out ${appMode === 'agent' && !agentMobileHeaderVisible ? '-translate-y-full sm:translate-y-0' : 'translate-y-0'}`}>
        <div className="safe-area-x safe-header-inner relative mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2 pr-2 sm:max-w-[calc(50%-8rem)]">
            <h1 className="inline-flex min-w-0 items-start relative mr-2">
              {showFavoriteCollectionTitle ? (
                <>
                  <span className="min-w-0 truncate text-[17px] font-bold tracking-tight text-gray-800 dark:text-gray-100 sm:hidden" title={favoriteCollectionTitle}>{favoriteCollectionTitle}</span>
                  <span className="hidden text-lg font-bold text-gray-800 dark:text-gray-100 sm:inline">AWAI创作工作台</span>
                </>
              ) : (
                <span className="text-[17px] sm:text-lg font-bold text-gray-800 dark:text-gray-100">AWAI创作工作台</span>
              )}
              {hasUpdate && (
                <button
                  type="button"
                  onClick={() => {
                    dismiss()
                    window.location.reload()
                  }}
                  className="absolute -right-1 -top-1 translate-x-full -translate-y-1/4 rounded-[4px] border border-red-500/30 bg-red-500 px-1 py-0.5 text-[9px] font-black leading-none text-white shadow-sm transition-colors hover:bg-red-600 animate-fade-in"
                  title="发现新版本，刷新页面"
                >
                  NEW
                </button>
              )}
            </h1>
            {showFavoriteCollectionTitle && (
              <div className="hidden min-w-0 items-center gap-2 sm:flex">
                <span className="h-4 w-px shrink-0 bg-gray-200 dark:bg-white/[0.12]" />
                <span className="truncate text-sm font-semibold text-gray-600 dark:text-gray-300" title={favoriteCollectionTitle}>{favoriteCollectionTitle}</span>
              </div>
            )}
          </div>
          <nav aria-label="工作台切换" className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-xl border border-gray-200 bg-gray-100/70 p-1 sm:flex dark:border-white/[0.08] dark:bg-white/[0.04]">
            <button
              type="button"
              onClick={() => setAppMode('gallery')}
              className={`h-10 rounded-lg px-4 text-sm transition-[transform,background-color,color,box-shadow] active:scale-[0.96] ${appMode === 'gallery' ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              图片工作台
            </button>
            <button
              type="button"
              onClick={() => setAppMode('agent')}
              className={`h-10 rounded-lg px-4 text-sm transition-[transform,background-color,color,box-shadow] active:scale-[0.96] ${appMode === 'agent' ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              Agent创作台
            </button>
          </nav>
          <div className="flex items-center gap-1 shrink-0">
            <div
              className="relative"
              {...helpTooltip.handlers}
            >
              <button
                onClick={() => {
                  dismissAllTooltips()
                  setShowHelp(true)
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-900"
                aria-label="操作指南"
              >
                <HelpCircleIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <ViewportTooltip visible={helpTooltip.visible} className="whitespace-nowrap">
                操作指南
              </ViewportTooltip>
            </div>
            <div
              className="relative"
              {...settingsTooltip.handlers}
            >
              <button
                onClick={() => setShowSettings(true)}
                className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-900"
                aria-label="设置"
              >
                <SettingsIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <ViewportTooltip visible={settingsTooltip.visible} className="whitespace-nowrap">
                设置
              </ViewportTooltip>
            </div>
          </div>
        </div>
        {deferred && <span className="sr-only">发现新版本，当前任务完成后可刷新</span>}
        <div className={`safe-area-x overflow-hidden transition-[max-height,opacity,padding-bottom] duration-300 ease-in-out sm:hidden ${appMode === 'gallery' && scrollDirection === 'down' ? 'max-h-0 opacity-0 pb-0' : 'max-h-20 opacity-100 pb-2'}`}>
          <nav aria-label="工作台切换" className="mx-2 grid grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-gray-100/70 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <button
              type="button"
              onClick={() => setAppMode('gallery')}
              className={`h-10 rounded-lg px-4 text-sm transition-[transform,background-color,color,box-shadow] active:scale-[0.96] ${appMode === 'gallery' ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              图片工作台
            </button>
            <button
              type="button"
              onClick={() => setAppMode('agent')}
              className={`h-10 rounded-lg px-4 text-sm transition-[transform,background-color,color,box-shadow] active:scale-[0.96] ${appMode === 'agent' ? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              Agent创作台
            </button>
          </nav>
        </div>
      </header>
      
      {/* Hint for sliding down */}
      <div className={`pointer-events-none fixed left-0 right-0 top-0 z-30 flex justify-center transition-[transform,opacity] duration-300 ease-in-out sm:hidden ${appMode === 'agent' && hintVisible && !agentMobileHeaderVisible ? 'translate-y-[env(safe-area-inset-top,0px)] opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-b-xl shadow-lg">
          下拉展示顶栏
        </div>
      </div>

      <div className={`safe-area-top invisible pointer-events-none shrink-0 transition-[max-height,opacity] duration-300 ease-in-out ${appMode === 'agent' && !agentMobileHeaderVisible ? 'max-h-0 sm:max-h-[500px] opacity-0 sm:opacity-100 overflow-hidden sm:overflow-visible' : 'max-h-[500px] opacity-100'}`} aria-hidden="true">
        <div className="safe-header-inner" />
        <div className={`safe-area-x overflow-hidden transition-[max-height,padding-bottom] duration-300 ease-in-out sm:hidden ${appMode === 'gallery' && scrollDirection === 'down' ? 'max-h-0 pb-0' : 'max-h-20 pb-2'}`}>
          <div className="p-1">
            <div className="h-10 text-sm">占位</div>
          </div>
        </div>
      </div>
      {showHelp && <HelpModal appMode={appMode} isFavoriteCollectionOverview={appMode === 'gallery' && filterFavorite && !activeFavoriteCollectionId} onClose={() => setShowHelp(false)} />}
    </>
  )
}
