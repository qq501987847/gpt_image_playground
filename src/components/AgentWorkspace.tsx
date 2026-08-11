import { useEffect, useLayoutEffect, useMemo, useState, useRef, useCallback, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { AgentMessage, AgentRound, TaskRecord } from '../types'
import { continueAgentResponse, editOutputs, regenerateAgentAssistantMessage, removeMultipleTasks, removeTask, reuseConfig, useStore } from '../store'
import { getActiveAgentRounds, getAgentBranchLeafId, getAgentRoundTaskIds, getAgentSiblingRounds } from '../lib/agentConversationState'
import { ensureImageCached, getCachedImage } from '../lib/imageCache'
import { getPromptMentionParts } from '../lib/promptImageMentions'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import type { AgentWebSearchStatus } from '../lib/agentWebSearch'
import { getAgentAssistantBlocks, getAgentAssistantCopyContent, getRoundTaskSlots } from '../lib/agentAssistantBlocks'
import { createMaskPreviewDataUrl } from '../lib/canvasImage'
import { downloadImageEntriesAsZip, downloadImageIds, getImageZipEntries } from '../lib/downloadImages'
import TaskCard from './TaskCard'
import MarkdownRenderer from './MarkdownRenderer'
import { TooltipButton as AgentActionButton } from './TooltipButton'
import { TrashIcon, DownloadIcon, EditIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, SidebarLeftIcon, FavoriteIcon, CloseIcon, CopyIcon, RefreshIcon, ArrowDownIcon } from './icons'
import AgentConversationNav from './AgentConversationNav'
import AgentSkillPlanCard from './AgentSkillPlanCard'

function ChatImageThumb({ imageId, imageIndex, maskImageId }: { imageId: string; imageIndex: number; maskImageId?: string | null }) {
  const [src, setSrc] = useState<string>(() => getCachedImage(imageId) || '')
  const setLightboxImageId = useStore((s) => s.setLightboxImageId)

  useEffect(() => {
    let cancelled = false

    if (maskImageId) {
      Promise.all([ensureImageCached(imageId), ensureImageCached(maskImageId)])
        .then(async ([baseUrl, maskUrl]) => {
          if (!baseUrl || !maskUrl) return baseUrl || ''
          return createMaskPreviewDataUrl(baseUrl, maskUrl)
        })
        .then((url) => {
          if (!cancelled && url) setSrc(url)
        })
        .catch(() => {
          if (!cancelled) setSrc(getCachedImage(imageId) || '')
        })
      return () => { cancelled = true }
    }

    const cached = getCachedImage(imageId)
    if (cached) {
      setSrc(cached)
      return () => { cancelled = true }
    }
    ensureImageCached(imageId).then((url) => {
      if (!cancelled && url) setSrc(url)
    })
    return () => { cancelled = true }
  }, [imageId, maskImageId])

  return (
    <div 
      className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg shadow-sm cursor-pointer transition-opacity hover:opacity-90 ${
        maskImageId ? 'border-2 border-blue-500' : 'border border-gray-200 dark:border-white/[0.08]'
      }`}
      onClick={() => setLightboxImageId(imageId, [imageId])}
    >
      {src ? <img src={src} className="h-full w-full object-cover" alt="" /> : <div className="h-full w-full bg-gray-100 dark:bg-white/[0.04]" />}
      {maskImageId && (
        <span className="absolute left-1 top-1 z-10 rounded bg-blue-500/90 px-1.5 py-0.5 text-[8px] font-bold leading-none tracking-wider text-white backdrop-blur-sm pointer-events-none">
          MASK
        </span>
      )}
      <span className="absolute bottom-1 left-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-[9px] font-semibold text-white backdrop-blur-sm pointer-events-none">
        {imageIndex + 1}
      </span>
    </div>
  )
}

function AgentStreamingCursor() {
  return (
    <span
      aria-label="正在生成"
      className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500 align-baseline dark:bg-blue-400"
    />
  )
}

function AgentWaitingStatus({ hasImages }: { hasImages: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
      <span>{hasImages ? '正在准备参考图并等待模型响应' : '正在等待模型响应'}</span>
      <AgentStreamingCursor />
    </span>
  )
}

function AgentWebSearchInlineStatus({ status }: { status: AgentWebSearchStatus }) {
  return (
    <span className="inline-flex text-sm font-medium text-gray-500 dark:text-gray-400">
      <span className={status.completed ? undefined : 'agent-web-search-running-text'}>{status.text}</span>
    </span>
  )
}

function AgentWebSearchStatusLines({ statuses }: { statuses: AgentWebSearchStatus[] }) {
  if (statuses.length === 0) return null
  return (
    <div className="mb-2 space-y-1">
      {statuses.map((status, index) => (
        <div key={`${status.text}-${index}`}>
          <AgentWebSearchInlineStatus status={status} />
        </div>
      ))}
    </div>
  )
}

const MOBILE_HEADER_PULL_THRESHOLD = 24
const MOBILE_HEADER_PULL_MAX_OFFSET = 48
const MOBILE_HEADER_EDGE_GUARD = 24

export default function AgentWorkspace() {
  const conversations = useStore((s) => s.agentConversations)
  const conversationsLoaded = useStore((s) => s.agentConversationsLoaded)
  const activeConversationId = useStore((s) => s.activeAgentConversationId)
  const createConversation = useStore((s) => s.createAgentConversation)
  const setActiveConversationId = useStore((s) => s.setActiveAgentConversationId)
  const renameConversation = useStore((s) => s.renameAgentConversation)
  const deleteConversation = useStore((s) => s.deleteAgentConversation)
  const deleteAgentRound = useStore((s) => s.deleteAgentRound)
  const deleteAgentAssistantMessage = useStore((s) => s.deleteAgentAssistantMessage)
  const sidebarCollapsed = useStore((s) => s.agentSidebarCollapsed)
  const setSidebarCollapsed = useStore((s) => s.setAgentSidebarCollapsed)
  const agentMobileHeaderVisible = useStore((s) => s.agentMobileHeaderVisible)
  const setAgentMobileHeaderVisible = useStore((s) => s.setAgentMobileHeaderVisible)
  const appMode = useStore((s) => s.appMode)
  const tasks = useStore((s) => s.tasks)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setPrompt = useStore((s) => s.setPrompt)
  const setInputImages = useStore((s) => s.setInputImages)
  const setMaskDraft = useStore((s) => s.setMaskDraft)
  const clearMaskDraft = useStore((s) => s.clearMaskDraft)
  const setAppMode = useStore((s) => s.setAppMode)
  const agentScrollToBottomAfterSubmit = useStore((s) => s.settings.agentScrollToBottomAfterSubmit)
  const agentEditingRoundId = useStore((s) => s.agentEditingRoundId)
  const setAgentEditingRoundId = useStore((s) => s.setAgentEditingRoundId)
  const setActiveAgentRoundId = useStore((s) => s.setActiveAgentRoundId)
  const showToast = useStore((s) => s.showToast)
  const openFavoritePicker = useStore((s) => s.openFavoritePicker)
  const conversation = conversations.find((item) => item.id === activeConversationId) ?? null

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef(new Map<string, HTMLElement>())
  const [scrollTargetRoundId, setScrollTargetRoundId] = useState<string | null>(null)
  const [pullDownOffset, setPullDownOffset] = useState(0)
  const [mobileTopBarVisible, setMobileTopBarVisible] = useState(true)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true)
  const touchStartY = useRef(-1)
  const autoScrollStateRef = useRef<{ conversationId: string | null; lastUserMessageSignature: string | null; followLatestRound: boolean }>({ conversationId: null, lastUserMessageSignature: null, followLatestRound: false })
  const errorCopyPointerDownRef = useRef<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (window.innerWidth < 1024) setSidebarCollapsed(true)
  }, [setSidebarCollapsed])

  const updateIsScrolledToBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (appMode !== 'agent' || !container) {
      setIsScrolledToBottom(true)
      return
    }

    setIsScrolledToBottom(container.scrollHeight - container.scrollTop - container.clientHeight <= 24)
  }, [appMode])

  const scrollToAgentBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [])

  const handleTouchStart = (e: React.TouchEvent) => {
    const touchY = e.touches[0]?.clientY ?? -1
    if (
      appMode !== 'agent' ||
      agentMobileHeaderVisible ||
      (scrollContainerRef.current?.scrollTop ?? 0) > 0 ||
      touchY < MOBILE_HEADER_EDGE_GUARD
    ) {
      touchStartY.current = -1
      setPullDownOffset(0)
      return
    }

    touchStartY.current = touchY
  }

  const handleHeaderTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }
   
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current <= 0 || agentMobileHeaderVisible) return

    const diff = e.touches[0].clientY - touchStartY.current
    if (diff <= 0) {
      setPullDownOffset(0)
      return
    }

    if (e.cancelable) e.preventDefault()
    if (diff >= MOBILE_HEADER_PULL_THRESHOLD) {
      setAgentMobileHeaderVisible(true)
      setPullDownOffset(0)
      touchStartY.current = -1
      return
    }

    setPullDownOffset(Math.min(diff, MOBILE_HEADER_PULL_MAX_OFFSET))
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current > 0 && !agentMobileHeaderVisible) {
      const touchEndY = e.changedTouches[0].clientY
      if (touchEndY - touchStartY.current >= MOBILE_HEADER_PULL_THRESHOLD) setAgentMobileHeaderVisible(true)
    }
    setPullDownOffset(0)
    touchStartY.current = -1
  }

  useEffect(() => {
    if (appMode !== 'agent') return

    document.documentElement.classList.add('agent-no-pull-refresh')
    return () => document.documentElement.classList.remove('agent-no-pull-refresh')
  }, [appMode])

  useEffect(() => {
    if (!agentMobileHeaderVisible || appMode !== 'agent') return

    const handleInteract = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('header[data-no-drag-select]')) return
      setAgentMobileHeaderVisible(false)
    }

    document.addEventListener('mousedown', handleInteract, { capture: true })
    document.addEventListener('touchstart', handleInteract, { capture: true })

    return () => {
      document.removeEventListener('mousedown', handleInteract, { capture: true })
      document.removeEventListener('touchstart', handleInteract, { capture: true })
    }
  }, [agentMobileHeaderVisible, appMode, setAgentMobileHeaderVisible])

  useEffect(() => {
    if (appMode !== 'agent') return

    setMobileTopBarVisible(true)
    const container = scrollContainerRef.current
    if (!container) return
    let lastScrollY = container.scrollTop
    let ticking = false

    const handleScroll = () => {
      if (ticking) return

      window.requestAnimationFrame(() => {
        const currentScrollY = container.scrollTop
        if (currentScrollY < lastScrollY - 2) {
          autoScrollStateRef.current.followLatestRound = false
        }
        if (currentScrollY < 20) {
          setMobileTopBarVisible(true)
        } else if (currentScrollY > lastScrollY + 10) {
          setMobileTopBarVisible(false)
        } else if (currentScrollY < lastScrollY - 10) {
          setMobileTopBarVisible(true)
        }

        updateIsScrolledToBottom()

        lastScrollY = currentScrollY
        ticking = false
      })
      ticking = true
    }

    const initialFrame = window.requestAnimationFrame(updateIsScrolledToBottom)
    const visualViewport = window.visualViewport
    container.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', updateIsScrolledToBottom)
    visualViewport?.addEventListener('resize', updateIsScrolledToBottom)

    return () => {
      window.cancelAnimationFrame(initialFrame)
      container.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', updateIsScrolledToBottom)
      visualViewport?.removeEventListener('resize', updateIsScrolledToBottom)
    }
  }, [appMode, updateIsScrolledToBottom])

  useEffect(() => {
    if (appMode !== 'agent') return
    if (!conversationsLoaded) return
    
    if (conversations.length === 0) {
      createConversation()
    } else if (!conversation) {
      const latest = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (latest && latest.messages.length === 0) {
        setActiveConversationId(latest.id)
      } else {
        createConversation()
      }
    }
  }, [appMode, conversationsLoaded, conversations, conversation, createConversation, setActiveConversationId])

  const activeRounds = useMemo(
    () => conversation ? getActiveAgentRounds(conversation) : [],
    [conversation],
  )

  const activeMessages = useMemo(() => {
    if (!conversation) return []
    const messages: AgentMessage[] = []
    for (const round of activeRounds) {
      const userMessage = conversation.messages.find((message) => message.id === round.userMessageId)
      if (userMessage) messages.push(userMessage)
      const assistantMessage = round.assistantMessageId
        ? conversation.messages.find((message) => message.id === round.assistantMessageId)
        : conversation.messages.find((message) => message.roundId === round.id && message.role === 'assistant')
      if (assistantMessage) messages.push(assistantMessage)
    }
    return messages
  }, [activeRounds, conversation])

  useLayoutEffect(() => {
    const conversationId = conversation?.id ?? null
    const lastUserMessage = activeMessages.slice().reverse().find((message) => message.role === 'user') ?? null
    const lastUserMessageSignature = lastUserMessage
      ? `${lastUserMessage.id}:${lastUserMessage.createdAt}:${lastUserMessage.content}`
      : null
    const previous = autoScrollStateRef.current
    if (previous.conversationId !== conversationId) {
      autoScrollStateRef.current = { conversationId, lastUserMessageSignature, followLatestRound: false }
      return
    }

    const isNewUserMessage = lastUserMessageSignature != null && previous.lastUserMessageSignature !== lastUserMessageSignature
    const followLatestRound = appMode === 'agent' && agentScrollToBottomAfterSubmit && (isNewUserMessage || previous.followLatestRound)
    autoScrollStateRef.current = { conversationId, lastUserMessageSignature, followLatestRound }
    if (!followLatestRound) return

    const container = scrollContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
    const latestRound = lastUserMessage
      ? activeRounds.find((round) => round.id === lastUserMessage.roundId) ?? null
      : null
    const frame = window.requestAnimationFrame(() => {
      if (useStore.getState().activeAgentConversationId !== conversationId) return
      const current = scrollContainerRef.current
      if (current) current.scrollTop = current.scrollHeight
      if (latestRound?.status !== 'running') {
        autoScrollStateRef.current.followLatestRound = false
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeMessages, activeRounds, agentScrollToBottomAfterSubmit, appMode, conversation?.id, tasks])

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateIsScrolledToBottom)
    return () => window.cancelAnimationFrame(frame)
  }, [activeMessages, activeRounds, updateIsScrolledToBottom])

  useEffect(() => {
    if (!scrollTargetRoundId) return
    const id = window.requestAnimationFrame(() => {
      messageRefs.current.get(scrollTargetRoundId)?.scrollIntoView({ block: 'center' })
      setScrollTargetRoundId(null)
    })
    return () => window.cancelAnimationFrame(id)
  }, [activeMessages, scrollTargetRoundId])

  const handleSwitchBranch = (round: AgentRound, direction: -1 | 1) => {
    if (!conversation) return
    const siblings = getAgentSiblingRounds(conversation, round)
    if (siblings.length <= 1) return
    const currentIndex = siblings.findIndex((item) => item.id === round.id)
    const nextRound = siblings[(currentIndex + direction + siblings.length) % siblings.length]
    const nextLeafId = getAgentBranchLeafId(conversation, nextRound.id)
    setActiveAgentRoundId(conversation.id, nextLeafId)
    setAgentEditingRoundId(null)
    setScrollTargetRoundId(nextRound.id)
  }

  const handleDeleteConversation = (id: string) => {
    const targetConversation = conversations.find((item) => item.id === id) ?? null
    const roundIds = new Set(targetConversation?.rounds.map((round) => round.id) ?? [])
    const roundTaskIds = targetConversation?.rounds.flatMap((round) => round.outputTaskIds) ?? []
    const relatedTasks = tasks.filter((task) =>
      task.agentConversationId === id || Boolean(task.agentRoundId && roundIds.has(task.agentRoundId)),
    )
    const existingTaskIds = new Set(tasks.map((task) => task.id))
    const relatedTaskIds = Array.from(new Set([...roundTaskIds, ...relatedTasks.map((task) => task.id)]))
      .filter((taskId) => existingTaskIds.has(taskId))
    const relatedTaskIdSet = new Set(relatedTaskIds)
    const generatedImageCount = new Set(
      tasks
        .filter((task) => relatedTaskIdSet.has(task.id))
        .flatMap((task) => task.outputImages || []),
    ).size

    setConfirmDialog({
      title: '删除对话',
      message: '确定要删除这个 Agent 对话吗？',
      checkbox: generatedImageCount > 0
        ? {
            label: `同时删除对话中生成的图片（${generatedImageCount} 张）`,
            tone: 'danger',
          }
        : undefined,
      action: async (deleteGeneratedImages = false) => {
        deleteConversation(id)
        if (deleteGeneratedImages && relatedTaskIds.length > 0) await removeMultipleTasks(relatedTaskIds)
      },
    })
  }

  const handleConversationSelect = (id: string) => {
    setActiveConversationId(id)
    if (window.innerWidth < 1024) setSidebarCollapsed(true)
  }

  const handleDeleteMessage = (message: AgentMessage, round: AgentRound) => {
    const isUserMessage = message.role === 'user'
    const conversationId = conversation?.id
    setConfirmDialog({
      title: isUserMessage ? '删除轮次' : '删除消息',
      message: isUserMessage
        ? '确定要删除这轮任务吗？这会删除这条消息和它的输出，后续消息会被保留。'
        : '确定要删除这条消息吗？这会同时删除这条回复生成的图片。',
      awaitAction: true,
      action: async () => {
        if (!conversationId) return true
        try {
          const result = isUserMessage
            ? await deleteAgentRound(conversationId, round.id)
            : await deleteAgentAssistantMessage(conversationId, message.id)
          if (result === 'running') {
            showToast('该轮次仍在生成，请先停止生成后再删除', 'info')
            return true
          }
          if (result === 'not-found') {
            showToast(isUserMessage ? '该轮次已不存在' : '该消息已不存在', 'info')
            return true
          }
          if (result === 'deleted-with-warning') {
            showToast('已删除，但本地存储或图片清理未完成', 'error')
            return true
          }
          showToast(isUserMessage ? '已删除轮次' : '已删除消息', 'success')
          return true
        } catch (err) {
          console.error(err)
          showToast(isUserMessage ? '删除轮次失败' : '删除消息失败', 'error')
          return false
        }
      },
    })
  }

  const handleReuse = (task: TaskRecord) => {
    setConfirmDialog({
      title: '切换到画廊模式？',
      message: '复用参数会应用到画廊输入区。切换到画廊模式后，当前 Agent 对话仍会保留。',
      confirmText: '切换并复用',
      cancelText: '取消',
      action: () => {
        setAppMode('gallery')
        void reuseConfig(task)
      },
    })
  }

  const handleEditRoundMessage = async (round: AgentRound, content: string) => {
    setAgentEditingRoundId(round.id)
    clearMaskDraft()

    const inputImages = await Promise.all(
      round.inputImageIds.map(async (id) => ({
        id,
        dataUrl: await ensureImageCached(id) || '',
      })),
    )
    setInputImages(inputImages)
    const maskTargetImageId = round.maskTargetImageId ?? (round.maskImageId ? round.inputImageIds[0] : null)
    if (maskTargetImageId && round.maskImageId && inputImages.some((img) => img.id === maskTargetImageId)) {
      const maskDataUrl = await ensureImageCached(round.maskImageId)
      if (maskDataUrl) {
        setMaskDraft({
          targetImageId: maskTargetImageId,
          maskDataUrl,
          updatedAt: Date.now(),
        })
      }
    }
    setPrompt(content)
  }

  const handleCopyMessage = async (content: string, successMessage = '提示词已复制', failureMessage = '复制提示词失败') => {
    try {
      await copyTextToClipboard(content)
      showToast(successMessage, 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage(failureMessage, err), 'error')
    }
  }

  const handleErrorCopyPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    errorCopyPointerDownRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleErrorCopyClick = (e: ReactMouseEvent<HTMLDivElement>, content: string) => {
    e.stopPropagation()

    const pointerDown = errorCopyPointerDownRef.current
    errorCopyPointerDownRef.current = null
    if (pointerDown && Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 4) return

    const selection = window.getSelection()
    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      const target = e.currentTarget
      if ((selection.anchorNode && target.contains(selection.anchorNode)) || (selection.focusNode && target.contains(selection.focusNode))) return
    }

    void handleCopyMessage(content, '完整报错已复制', '复制完整报错失败')
  }

  return (
    <main 
      data-agent-workspace 
      className="safe-area-x relative mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-3 lg:flex-row lg:gap-3 lg:px-0"
    >
      {/* Pull Down Indicator */}
      {pullDownOffset > 0 && !agentMobileHeaderVisible && (
        <div 
          className="fixed top-0 left-0 right-0 z-50 flex justify-center items-end pointer-events-none sm:hidden"
          style={{ height: `${pullDownOffset + 10}px`, opacity: pullDownOffset / MOBILE_HEADER_PULL_MAX_OFFSET }}
        >
          <div className="bg-black/60 backdrop-blur-sm text-white rounded-full p-1 mb-2 shadow-lg">
            <ChevronDownIcon className="w-4 h-4" />
          </div>
        </div>
      )}

      {!sidebarCollapsed && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarCollapsed(true)} />}
      {!sidebarCollapsed && <AgentConversationNav
        mobile
        conversations={conversations}
        activeConversationId={activeConversationId}
        onClose={() => setSidebarCollapsed(true)}
        onCreate={createConversation}
        onSelect={handleConversationSelect}
        onRename={renameConversation}
        onDelete={handleDeleteConversation}
      />}
      {!sidebarCollapsed && <AgentConversationNav
        conversations={conversations}
        activeConversationId={activeConversationId}
        onClose={() => setSidebarCollapsed(true)}
        onCreate={createConversation}
        onSelect={handleConversationSelect}
        onRename={renameConversation}
        onDelete={handleDeleteConversation}
      />}

      {/* Center Chat Area */}
      {sidebarCollapsed && <button type="button" onClick={() => setSidebarCollapsed(false)} className="hidden lg:flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-[transform,background-color,color] hover:bg-gray-100 active:scale-[0.96] dark:hover:bg-white/[0.06]" aria-label="展开会话列表"><SidebarLeftIcon className="h-5 w-5" /></button>}
      <section data-agent-chat-column className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-[var(--input-bar-clearance,12rem)]">
        {/* Mobile Header Toggles */}
        <div className={`sticky top-0 z-20 shrink-0 overflow-hidden transition-[max-height,opacity,margin-bottom] duration-300 ease-in-out lg:hidden ${mobileTopBarVisible ? 'max-h-16 opacity-100 mb-2' : 'max-h-0 opacity-0 mb-0 pointer-events-none'}`}>
          <div
            className="flex h-14 items-center justify-between border-b border-gray-200 bg-white/80 px-2 backdrop-blur dark:border-white/[0.08] dark:bg-gray-950/80"
            onTouchStart={handleHeaderTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <button type="button" onClick={() => setSidebarCollapsed(false)} className="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-lg transition-colors" title="展开对话列表">
              <SidebarLeftIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setSidebarCollapsed(false)
                if (conversation) {
                  useStore.getState().setAgentEditingConversationId(conversation.id)
                }
              }}
              className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate flex-1 text-center px-2 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded transition-colors"
            >
              {conversation?.title || 'Agent'}
            </button>
            <button type="button" onClick={createConversation} className="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-lg transition-colors" title="新对话">
              <EditIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div 
          data-agent-scroll-container
          ref={scrollContainerRef}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-6 px-1 lg:px-4"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {!conversation ? (
            <div className="py-20 text-center text-gray-400">
              <p className="mb-3">还没有 Agent 对话</p>
              <button type="button" onClick={createConversation} className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 transition-colors">创建对话</button>
            </div>
          ) : (
            (() => {
              if (activeMessages.length === 0) {
                return (
                  <div className="py-20 text-center text-gray-400">
                    <p className="mb-2">开始新的 Agent 对话</p>
                    <p className="text-xs">在底部输入框发送消息即可创建第一轮对话。</p>
                  </div>
                )
              }

              const renderedMessages = activeMessages.map((message) => {
                const round = conversation.rounds.find((item) => item.id === message.roundId)
                const isAssistant = message.role === 'assistant'
                const isStreamingAssistant = isAssistant && round?.status === 'running'
                const isEditing = !isAssistant && round?.id === agentEditingRoundId
                const siblingRounds = !isAssistant && round ? getAgentSiblingRounds(conversation, round) : []
                const siblingIndex = round ? siblingRounds.findIndex((item) => item.id === round.id) : -1
                const hasBranches = siblingRounds.length > 1
                const taskSlotsForRound = isAssistant ? getRoundTaskSlots(round ?? null, tasks) : []
                const tasksForRound = taskSlotsForRound.map((slot) => slot.task).filter(Boolean) as TaskRecord[]
                const hasRoundTasks = tasksForRound.length > 0
                const favoriteTasksForRound = tasksForRound.filter((task) => (task.outputImages?.length ?? 0) > 0)
                const hasRoundFavoriteTasks = favoriteTasksForRound.length > 0
                const allRoundTasksFavorited = hasRoundFavoriteTasks && favoriteTasksForRound.every((task) => task.isFavorite)
                const assistantBlocks = isAssistant ? getAgentAssistantBlocks(round ?? null, taskSlotsForRound, tasks, Boolean(message.content.trim())) : []
                const skillPlan = isAssistant && conversation.skillPlan?.sourceRoundId === round?.id ? conversation.skillPlan : null
                const inputImagesForRound = (round?.inputImageIds || []).map(id => ({ id, dataUrl: '' }))
                const parts = getPromptMentionParts(message.content, inputImagesForRound)
                return (
                  <div key={message.id} className={`flex w-full mb-6 ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                    <div
                      ref={(node) => {
                        if (!isAssistant && node) messageRefs.current.set(message.roundId, node)
                        else if (!isAssistant) messageRefs.current.delete(message.roundId)
                      }}
                      className={`group flex max-w-[95%] flex-col md:max-w-[85%] lg:max-w-[75%] ${isAssistant ? 'items-start' : 'items-end'}`}
                    >
                      <article 
                        className={`relative flex min-w-[16rem] max-w-full flex-col rounded-2xl p-4 transition-all duration-200 ${
                        isAssistant 
                          ? 'bg-white/70 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] rounded-tl-sm hover:bg-white dark:hover:bg-white/[0.04]' 
                          : `bg-gray-100 dark:bg-[#2A2D31] rounded-tr-sm ${isEditing ? 'ring-2 ring-blue-500/50 dark:ring-blue-400/50' : ''}`
                      }`}
                      >
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span className="font-medium">
                         <span className={isAssistant ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-700 dark:text-gray-200 font-semibold'}>{isAssistant ? 'Agent' : '用户'}</span> <span className="opacity-60 font-normal ml-1">· 第 {round?.index ?? '?'} 轮</span>
                      </span>
                    </div>
                    
                    {message.role === 'user' && round && round.inputImageIds.length > 0 && (
                      <div className="flex gap-2 mb-3 overflow-x-auto pb-1" onClick={e => e.stopPropagation()}>
                          {round.inputImageIds.map((imgId, imageIndex) => (
                            <ChatImageThumb
                              key={imgId}
                              imageId={imgId}
                              imageIndex={imageIndex}
                              maskImageId={imgId === (round.maskTargetImageId ?? round.inputImageIds[0]) ? round.maskImageId : null}
                            />
                          ))}
                      </div>
                    )}

                    {round?.status === 'error' && isAssistant && message.content.startsWith('请求失败：') ? (
                      <div
                        data-selectable-text
                        className="-m-2 flex cursor-copy select-text flex-col rounded-xl p-2 transition-colors hover:bg-red-50/60 dark:hover:bg-red-500/5"
                        title="点击复制完整报错"
                        onPointerDown={handleErrorCopyPointerDown}
                        onClick={(e) => handleErrorCopyClick(e, message.content)}
                      >
                        {(() => {
                          const content = message.content.replace(/^请求失败：/, '');
                          const [mainErr, ...hints] = content.split('\n提示：');
                          return (
                            <>
                              <div className="flex items-start gap-2 text-red-500 dark:text-red-400">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-[18px] h-[18px] mt-[1.5px] flex-shrink-0">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
                                <div className="whitespace-pre-wrap text-[14px] leading-relaxed break-words font-medium">
                                  {mainErr}
                                </div>
                              </div>
                              {hints.length > 0 && (
                                <div className="pl-[26px] mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-500 dark:text-gray-400 break-words opacity-90">
                                  <span className="font-medium">提示：</span>{hints.join('\n提示：')}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div data-selectable-text className={`text-[15px] leading-relaxed text-gray-800 dark:text-gray-100 ${!isAssistant ? 'select-text' : ''}`}>
                        {isAssistant ? (
                          <>
                            {assistantBlocks.length > 0 ? assistantBlocks.map((block, index) => {
                              if (block.type === 'web-search') return <AgentWebSearchStatusLines key={block.key} statuses={[block.status]} />
                              if (block.type === 'text') return <div key={block.key} className={index > 0 ? 'mt-3' : undefined}><MarkdownRenderer content={block.content ?? message.content} streaming={isStreamingAssistant} /></div>
                              if (block.type === 'batch-params') {
                                return (
                                  <div key={block.key} className={index > 0 ? 'mt-3' : undefined}>
                                    <AgentWebSearchInlineStatus status={block.status} />
                                  </div>
                                )
                              }
                              if (block.type === 'deleted-image-task') {
                                return (
                                  <div key={block.key} className="mt-4 w-full min-w-[16rem] max-w-sm rounded-xl bg-gray-50/50 dark:bg-white/[0.02] border border-dashed border-gray-200 dark:border-white/[0.08] p-4 flex min-h-[120px] flex-col items-center justify-center text-gray-400 dark:text-gray-500" onClick={e => e.stopPropagation()}>
                                    <TrashIcon className="w-6 h-6 mb-2 opacity-50" />
                                    <span className="text-xs">[Image Removed]</span>
                                  </div>
                                )
                              }
                              return (
                                <div key={block.key} className="mt-4 max-w-sm" onClick={e => e.stopPropagation()}>
                                  <TaskCard
                                    task={block.task}
                                    disableSwipe={true}
                                    onClick={() => setDetailTaskId(block.task.id)}
                                    onReuse={() => handleReuse(block.task)}
                                    onEditOutputs={() => editOutputs(block.task)}
                                    onDelete={() => setConfirmDialog({ title: '删除任务', message: '确定要删除这个任务吗？', action: () => removeTask(block.task) })}
                                  />
                                </div>
                              )
                            }) : isStreamingAssistant ? <AgentWaitingStatus hasImages={Boolean(round?.inputImageIds.length)} /> : null}
                          </>
                        ) : parts.some((part) => part.type === 'mention') ? (
                          <div className="whitespace-pre-wrap break-words">
                            {parts.map((part, i) =>
                              part.type === 'text' ? <span key={i}>{part.text}</span> : <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-100/50 text-blue-700 dark:bg-blue-500/30 dark:text-blue-300 text-xs font-medium mx-0.5 align-baseline">{part.text}</span>
                            )}
                          </div>
                        ) : (
                          <MarkdownRenderer content={parts[0]?.text ?? ''} />
                        )}
                      </div>
                    )}

                    {isAssistant && round?.status === 'partial' && (
                      <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300">
                        图片已保留，文字回复未完成。{round.error ? ` ${round.error}` : ''}
                      </div>
                    )}

                      </article>

                    {!isStreamingAssistant && <div className={`mt-2 flex w-full min-w-fit items-center justify-between gap-3 px-1 transition-opacity duration-200 ${isEditing || hasBranches ? 'opacity-100' : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100'}`} onClick={e => e.stopPropagation()}>
                      <div className="flex min-w-0 items-center gap-2">
                        {isEditing && (
                          <div className="inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                            <span className="truncate">正在编辑</span>
                            <AgentActionButton
                              tooltip="取消编辑"
                              className="ml-1 -mr-1 p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-500/40 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPrompt('');
                                setInputImages([]);
                                clearMaskDraft();
                                setAgentEditingRoundId(null);
                              }}
                            >
                              <CloseIcon className="w-3 h-3" />
                            </AgentActionButton>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-auto text-gray-400">
                        {!isAssistant && round && hasBranches && siblingIndex >= 0 && (
                          <div className="inline-flex items-center text-sm font-bold text-gray-400 dark:text-gray-500 mr-1">
                            <AgentActionButton tooltip="上一分支" className="p-1 rounded-md hover:bg-gray-200/50 dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-gray-200 transition-colors" onClick={() => handleSwitchBranch(round, -1)}>
                              <ChevronLeftIcon className="w-4 h-4" />
                            </AgentActionButton>
                            <span className="px-1 tabular-nums tracking-widest">{siblingIndex + 1}/{siblingRounds.length}</span>
                            <AgentActionButton tooltip="下一分支" className="p-1 rounded-md hover:bg-gray-200/50 dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-gray-200 transition-colors" onClick={() => handleSwitchBranch(round, 1)}>
                              <ChevronRightIcon className="w-4 h-4" />
                            </AgentActionButton>
                          </div>
                        )}
                        {isAssistant ? (
                          <>
                            {round?.status === 'partial' && conversation && (
                              <button
                                type="button"
                                className="rounded-md px-2 py-1 text-xs font-medium text-orange-600 transition-colors hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-500/10"
                                onClick={() => void continueAgentResponse(conversation.id, round.id)}
                              >
                                继续回复
                              </button>
                            )}
                            <AgentActionButton tooltip="复制输出文本" className={`p-1.5 rounded-md transition-colors ${message.content.trim() ? 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-white/[0.06]' : 'text-gray-300 dark:text-gray-600 opacity-50 cursor-not-allowed'}`} disabled={!message.content.trim()} onClick={() => {
                              void handleCopyMessage(getAgentAssistantCopyContent(message.content, assistantBlocks), '输出文本已复制', '复制输出文本失败');
                            }}>
                              <CopyIcon className="w-4 h-4" />
                            </AgentActionButton>
                            <AgentActionButton tooltip="重新生成本轮" className="p-1.5 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors" onClick={() => {
                              if (!conversation || !round) return;
                              setConfirmDialog({
                                title: '重新生成本轮',
                                message: '这会重新执行本轮完整工具链，可能再次生成图片并产生重复费用。是否继续？',
                                confirmText: '重新生成',
                                tone: 'warning',
                                action: () => regenerateAgentAssistantMessage(conversation.id, round.id),
                              });
                            }}>
                              <RefreshIcon className="w-4 h-4" />
                            </AgentActionButton>
                            <AgentActionButton tooltip={allRoundTasksFavorited ? '编辑收藏夹' : '收藏所有图片'} className={`p-1.5 rounded-md transition-colors ${hasRoundFavoriteTasks ? (allRoundTasksFavorited ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-500/10' : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-500/10') : 'text-gray-300 dark:text-gray-600 opacity-50 cursor-not-allowed'}`} disabled={!hasRoundFavoriteTasks} onClick={() => {
                              if (!hasRoundFavoriteTasks) return;
                              openFavoritePicker(favoriteTasksForRound.map((task) => task.id));
                            }}>
                              <FavoriteIcon className="w-4 h-4" filled={allRoundTasksFavorited} />
                            </AgentActionButton>
                            <AgentActionButton tooltip="下载所有图片" className={`p-1.5 rounded-md transition-colors ${hasRoundTasks ? 'text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-500/10' : 'text-gray-300 dark:text-gray-600 opacity-50 cursor-not-allowed'}`} disabled={!hasRoundTasks} onClick={async () => {
                               const imageIds = tasksForRound.flatMap(t => t.outputImages || []);
                               if (imageIds.length === 0) return;
                               try {
                                  const roundIndex = round?.index ?? 0;
                                  const fileNameBase = 'agent-round-' + roundIndex;
                                  const settings = useStore.getState().settings;
                                  const { successCount, failCount } = settings.zipDownloadRoutes.includes('agent-round-all')
                                    ? await downloadImageEntriesAsZip(getImageZipEntries(imageIds, fileNameBase), fileNameBase)
                                    : await downloadImageIds(imageIds, fileNameBase);
                                 if (successCount === 0) {
                                   useStore.getState().showToast('下载失败', 'error');
                                 } else if (failCount > 0) {
                                   useStore.getState().showToast('部分下载失败：成功 ' + successCount + '，失败 ' + failCount, 'error');
                                 } else {
                                   useStore.getState().showToast(successCount > 1 ? '下载成功：' + successCount + ' 张图片' : '下载成功', 'success');
                                 }
                               } catch (err) {
                                 console.error(err);
                                 useStore.getState().showToast('下载失败', 'error');
                               }
                             }}>
                               <DownloadIcon className="w-4 h-4" />
                             </AgentActionButton>
                            <AgentActionButton tooltip="删除消息" className="p-1.5 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors" onClick={() => {
                              if (round) handleDeleteMessage(message, round);
                            }}>
                              <TrashIcon className="w-4 h-4" />
                            </AgentActionButton>
                          </>
                        ) : (
                          <>
                            <AgentActionButton tooltip="复制提示词" className="p-1.5 rounded-md hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-white/[0.04] transition-colors" onClick={() => {
                              void handleCopyMessage(message.content);
                            }}>
                              <CopyIcon className="w-4 h-4" />
                            </AgentActionButton>
                            <AgentActionButton tooltip="编辑" className="p-1.5 rounded-md hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-white/[0.04] transition-colors" onClick={() => {
                               if (round) void handleEditRoundMessage(round, message.content);
                            }}>
                              <EditIcon className="w-4 h-4" />
                            </AgentActionButton>
                            <AgentActionButton tooltip="删除" className="p-1.5 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors" onClick={() => {
                              if (round) handleDeleteMessage(message, round);
                            }}>
                              <TrashIcon className="w-4 h-4" />
                            </AgentActionButton>
                          </>
                        )}
                      </div>
                    </div>}
                    {skillPlan && <AgentSkillPlanCard conversationId={conversation.id} plan={skillPlan} />}
                    </div>
                </div>
                )
              })

              const runningRounds = activeRounds.filter((round) =>
                round.status === 'running' &&
                !conversation.messages.some((message) => message.roundId === round.id && message.role === 'assistant'),
              )

              return (
                <>
                  {renderedMessages}
                  {runningRounds.map((round) => (
                    <div key={`running-${round.id}`} className="flex w-full justify-start mb-6">
                      <article className="flex min-w-[16rem] max-w-[95%] flex-col rounded-2xl rounded-tl-sm border border-gray-200 bg-white/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03] md:max-w-[85%] lg:max-w-[75%]">
                        <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">Agent</span> <span className="ml-1 font-normal opacity-60">· 第 {round.index} 轮</span>
                        </div>
                        <AgentWaitingStatus hasImages={round.inputImageIds.length > 0} />
                      </article>
                    </div>
                  ))}
                </>
              )
            })()
          )}
        </div>

        <button
          onClick={scrollToAgentBottom}
          className={`absolute bottom-[calc(var(--input-bar-clearance,12rem)+1.5rem)] left-1/2 z-30 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 text-gray-500 shadow-[0_2px_12px_rgba(0,0,0,0.1)] backdrop-blur transition-[transform,opacity,background-color,color,box-shadow] duration-300 hover:bg-gray-50 hover:text-gray-800 dark:border-white/[0.08] dark:bg-gray-800/90 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 ${
            !isScrolledToBottom && activeMessages.length > 0 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
          }`}
          aria-label="滚动到底部"
        >
          <ArrowDownIcon className="h-5 w-5" />
        </button>
      </section>
    </main>
  )
}
