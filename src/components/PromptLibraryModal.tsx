import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import type { AppMode } from '../types'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import {
  filterPromptLibraryCases,
  getPromptLibraryImageUrl,
  PROMPT_LIBRARY_CATEGORY_LABELS,
  type PromptLibraryCase,
  type PromptLibraryData,
} from '../lib/promptLibrary'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon, CopyIcon } from './icons'

const PAGE_SIZE = 48

export default function PromptLibraryModal({ onClose }: { onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<PromptLibraryData | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<PromptLibraryCase | null>(null)
  const showToast = useStore((state) => state.showToast)

  useCloseOnEscape(true, selected ? () => setSelected(null) : onClose)
  usePreventBackgroundScroll(true, modalRef)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/prompt-library/awesome-gpt-image-2-cases.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<PromptLibraryData>
      })
      .then(setData)
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('加载提示词库失败', err)
        setError('提示词库加载失败')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => setVisibleCount(PAGE_SIZE), [query, category])

  const filtered = useMemo(
    () => filterPromptLibraryCases(data?.cases ?? [], query, category),
    [data, query, category],
  )
  const visible = filtered.slice(0, visibleCount)

  useEffect(() => {
    const root = listRef.current
    const target = loadMoreRef.current
    if (!root || !target || visible.length >= filtered.length) return

    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return
      setVisibleCount((count) => Math.min(count + PAGE_SIZE, filtered.length))
    }, { root, rootMargin: '240px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [filtered.length, visible.length])

  const copyPrompt = async (item: PromptLibraryCase) => {
    try {
      await copyTextToClipboard(item.prompt)
      showToast('提示词已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制提示词失败', err), 'error')
    }
  }

  const usePrompt = (item: PromptLibraryCase, mode: Exclude<AppMode, 'prompts'>) => {
    const state = useStore.getState()
    state.setAppMode(mode)
    const nextState = useStore.getState()
    if (nextState.appMode !== mode) {
      nextState.showToast('请先完成 Agent API 配置', 'error')
      onClose()
      return
    }
    nextState.setPrompt(item.prompt)
    onClose()
    nextState.showToast(mode === 'agent' ? '提示词已放入 Agent 输入框' : '提示词已放入图片工作台', 'success')
  }

  return createPortal(
    <div data-no-drag-select className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative z-10 flex h-[94dvh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl animate-modal-in dark:border-white/[0.1] dark:bg-gray-950"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/[0.08] sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-balance text-base font-semibold text-gray-900 dark:text-gray-100">GPT-Image 2 提示词库</h2>
              {data && <span className="shrink-0 text-xs tabular-nums text-gray-400">{data.totalCases} 条</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-[transform,background-color,color] hover:bg-gray-100 hover:text-gray-700 active:scale-[0.96] dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭提示词库"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="shrink-0 space-y-2 border-b border-gray-200 p-3 dark:border-white/[0.08] sm:px-5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、提示词、风格或场景"
            className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none transition-[background-color,border-color,box-shadow] focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/15 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100 dark:focus:border-blue-500 dark:focus:bg-white/[0.06]"
          />
          <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 custom-scrollbar" role="tablist" aria-label="提示词分类">
            <button
              type="button"
              onClick={() => setCategory('')}
              className={`h-10 shrink-0 rounded-lg px-3 text-xs font-medium transition-[transform,background-color,color,box-shadow] active:scale-[0.96] ${category === '' ? 'bg-gray-900 text-white shadow-sm dark:bg-white dark:text-gray-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]'}`}
              role="tab"
              aria-selected={category === ''}
            >
              全部
            </button>
            {(data?.categories ?? []).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`h-10 shrink-0 rounded-lg px-3 text-xs font-medium transition-[transform,background-color,color,box-shadow] active:scale-[0.96] ${category === item ? 'bg-gray-900 text-white shadow-sm dark:bg-white dark:text-gray-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]'}`}
                role="tab"
                aria-selected={category === item}
              >
                {PROMPT_LIBRARY_CATEGORY_LABELS[item] ?? item}
              </button>
            ))}
          </div>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50/70 p-3 custom-scrollbar dark:bg-black/15 sm:p-5">
          {!data && !error && <div className="flex h-full items-center justify-center text-sm text-gray-400">正在加载提示词库...</div>}
          {error && <div className="flex h-full items-center justify-center text-sm text-red-500">{error}</div>}
          {data && filtered.length === 0 && <div className="flex h-full items-center justify-center text-sm text-gray-400">没有匹配的提示词</div>}
          {data && filtered.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visible.map((item) => (
                  <article key={item.id} className="flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-[border-color,box-shadow] hover:border-gray-300 hover:shadow-md dark:border-white/[0.08] dark:bg-gray-900 dark:hover:border-white/[0.16]">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <button type="button" onClick={() => setSelected(item)} className="group/image block w-full text-left" aria-label={`查看${item.title}详情`}>
                        <div className="aspect-square overflow-hidden bg-gray-100 dark:bg-white/[0.04]">
                          <img
                            src={getPromptLibraryImageUrl(item.image)}
                            alt={item.imageAlt || item.title}
                            loading="lazy"
                            className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-black/10 transition-transform duration-300 group-hover/image:scale-[1.02] dark:outline-white/10"
                          />
                        </div>
                      </button>
                      <div className="p-3">
                        <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">{PROMPT_LIBRARY_CATEGORY_LABELS[item.category] ?? item.category}</span>
                        <h3 className="mt-1 line-clamp-2 min-h-10 text-balance text-sm font-semibold leading-5 text-gray-900 dark:text-gray-100">{item.title}</h3>
                        <p className="mt-1.5 line-clamp-2 text-pretty text-xs leading-5 text-gray-500 dark:text-gray-400">{item.promptPreview || item.prompt}</p>
                      </div>
                      <div className="mt-auto grid grid-cols-3 gap-0.5 border-t border-gray-100 p-0.5 dark:border-white/[0.06] sm:gap-1.5 sm:p-2">
                        <button type="button" onClick={() => void copyPrompt(item)} className="flex h-10 items-center justify-center rounded-lg text-gray-500 transition-[transform,background-color] hover:bg-gray-100 active:scale-[0.96] dark:text-gray-300 dark:hover:bg-white/[0.06]" aria-label={`复制${item.title}提示词`} title="复制提示词">
                          <CopyIcon className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => usePrompt(item, 'gallery')} className="h-10 whitespace-nowrap rounded-lg bg-gray-100 text-xs font-medium text-gray-700 transition-[transform,background-color] hover:bg-gray-200 active:scale-[0.96] dark:bg-white/[0.08] dark:text-gray-200 dark:hover:bg-white/[0.12]" aria-label={`将${item.title}用于图片工作台`} title="用于图片工作台"><span className="sm:hidden">图片</span><span className="hidden sm:inline">工作台</span></button>
                        <button type="button" onClick={() => usePrompt(item, 'agent')} className="h-10 whitespace-nowrap rounded-lg bg-blue-50 text-xs font-medium text-blue-700 transition-[transform,background-color] hover:bg-blue-100 active:scale-[0.96] dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25" aria-label={`将${item.title}用于 Agent`} title="用于 Agent">Agent</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {visible.length < filtered.length && <div ref={loadMoreRef} className="h-px" aria-hidden="true" />}
            </>
          )}
        </div>

        {selected && (
          <div className="absolute inset-0 z-20 flex justify-end bg-black/30" onClick={() => setSelected(null)}>
            <aside
              className="flex h-full w-full max-w-xl flex-col border-l border-gray-200 bg-white shadow-2xl animate-slide-left-in dark:border-white/[0.1] dark:bg-gray-950"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/[0.08]">
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{PROMPT_LIBRARY_CATEGORY_LABELS[selected.category] ?? selected.category}</span>
                <button type="button" onClick={() => setSelected(null)} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 transition-[transform,background-color] hover:bg-gray-100 active:scale-[0.96] dark:hover:bg-white/[0.06]" aria-label="返回提示词列表">
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 custom-scrollbar sm:p-5">
                <img src={getPromptLibraryImageUrl(selected.image)} alt={selected.imageAlt || selected.title} className="aspect-square w-full rounded-lg object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
                <h3 className="mt-4 text-balance text-lg font-semibold text-gray-900 dark:text-gray-100">{selected.title}</h3>
                <div className="mt-3 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-pretty text-sm leading-6 text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300">{selected.prompt}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[...selected.styles, ...selected.scenes].map((tag, idx) => <span key={`${tag}-${idx}`} className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">{tag}</span>)}
                </div>
              </div>
              <div className="grid shrink-0 grid-cols-[2.5rem_1fr_1fr] gap-2 border-t border-gray-200 p-3 dark:border-white/[0.08] sm:p-4">
                <button type="button" onClick={() => void copyPrompt(selected)} className="flex h-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-[transform,background-color] hover:bg-gray-100 active:scale-[0.96] dark:border-white/[0.1] dark:text-gray-300 dark:hover:bg-white/[0.06]" aria-label="复制提示词" title="复制提示词">
                  <CopyIcon className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => usePrompt(selected, 'gallery')} className="h-10 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white transition-[transform,background-color] hover:bg-gray-700 active:scale-[0.96] dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 sm:text-sm"><span className="sm:hidden">用于工作台</span><span className="hidden sm:inline">用于图片工作台</span></button>
                <button type="button" onClick={() => usePrompt(selected, 'agent')} className="h-10 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white transition-[transform,background-color] hover:bg-blue-700 active:scale-[0.96] sm:text-sm">用于 Agent</button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
