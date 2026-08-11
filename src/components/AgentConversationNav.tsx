import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentConversation } from '../types'
import { getConversationSearchText } from '../lib/agentConversationState'
import { CloseIcon, EditIcon, PlusIcon, SidebarLeftIcon, TrashIcon } from './icons'
import { TooltipButton } from './TooltipButton'

interface AgentConversationNavProps {
  conversations: AgentConversation[]
  activeConversationId: string | null
  mobile?: boolean
  onClose: () => void
  onCreate: () => void
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

function formatTime(value: number) {
  return new Date(value).toLocaleString()
}

function getConversationStatus(conversation: AgentConversation) {
  if (conversation.rounds.some((round) => round.status === 'running')) return '生成中'
  if (conversation.rounds.some((round) => round.status === 'partial')) return '部分完成'
  if (conversation.rounds.some((round) => round.status === 'error')) return '失败'
  return ''
}

export default function AgentConversationNav({
  conversations,
  activeConversationId,
  mobile = false,
  onClose,
  onCreate,
  onSelect,
  onRename,
  onDelete,
}: AgentConversationNavProps) {
  const [query, setQuery] = useState('')
  const [actionsId, setActionsId] = useState<string | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  useEffect(() => {
    if (!actionsId) return
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && actionsRef.current?.contains(event.target)) return
      setActionsId(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionsId(null)
    }
    document.addEventListener('pointerdown', closeOnOutside, true)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [actionsId])
  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
    return normalized ? sorted.filter((item) => getConversationSearchText(item).includes(normalized)) : sorted
  }, [conversations, query])

  const confirmRename = () => {
    if (editingId && title.trim()) onRename(editingId, title.trim())
    setEditingId(null)
  }

  return (
    <aside className={mobile
      ? 'fixed inset-y-0 left-0 z-50 flex w-full max-w-[320px] flex-col border-r border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-gray-950 lg:hidden'
      : 'hidden h-full min-h-0 w-[280px] shrink-0 flex-col border-r border-gray-200/80 pr-3 dark:border-white/[0.08] lg:flex'}
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-3">
        <TooltipButton tooltip={mobile ? '关闭会话列表' : '折叠会话列表'} onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-[transform,background-color,color] hover:bg-gray-100 active:scale-[0.96] dark:hover:bg-white/[0.06]"><SidebarLeftIcon className="h-5 w-5" /></TooltipButton>
        <TooltipButton tooltip="新建会话" onClick={onCreate} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-[transform,background-color,color] hover:bg-gray-100 active:scale-[0.96] dark:hover:bg-white/[0.06]"><PlusIcon className="h-5 w-5" /></TooltipButton>
      </div>
      <div className="shrink-0 px-3 pb-3">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索会话" className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none transition-[border-color,background-color] focus:border-blue-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" />
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {items.length === 0 && <p className="px-2 py-8 text-center text-sm text-gray-400">没有匹配的会话</p>}
        {items.map((item) => {
          const status = getConversationStatus(item)
          const running = status === '生成中'
          const actionsVisible = mobile || actionsId === item.id
          return (
            <div key={item.id} className={`group relative flex min-h-14 items-center gap-1 rounded-lg px-2 ${item.id === activeConversationId ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-gray-100 dark:hover:bg-white/[0.04]'}`}>
              {editingId === item.id ? (
                <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onBlur={confirmRename} onKeyDown={(event) => {
                  if (event.key === 'Enter') confirmRename()
                  if (event.key === 'Escape') setEditingId(null)
                }} className="h-8 min-w-0 flex-1 rounded border border-blue-400 bg-white px-2 text-sm outline-none dark:bg-black/20" />
              ) : (
                <button type="button" onClick={() => onSelect(item.id)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1.5">
                    <span className={`truncate text-sm ${item.id === activeConversationId ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{item.title}</span>
                    {item.unread && item.id !== activeConversationId && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="未读" />}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400"><span>{formatTime(item.updatedAt)}</span>{status && <span className={status === '失败' ? 'text-red-500' : status === '部分完成' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-500'}>{status}</span>}</span>
                </button>
              )}
              <div ref={actionsId === item.id ? actionsRef : undefined} className={`relative shrink-0 ${actionsVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                <button type="button" onClick={() => setActionsId((current) => current === item.id ? null : item.id)} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 transition-[transform,background-color,color,opacity] hover:bg-gray-200 hover:text-gray-700 active:scale-[0.96] dark:hover:bg-white/[0.1] dark:hover:text-gray-200" aria-label={`${item.title} 操作`} aria-expanded={actionsId === item.id}>...</button>
                {actionsId === item.id && <div className="absolute right-0 top-10 z-20 w-28 rounded-lg border border-gray-200 bg-white p-1 shadow-xl dark:border-white/[0.08] dark:bg-gray-900">
                  <button type="button" onClick={() => { setEditingId(item.id); setTitle(item.title); setActionsId(null) }} className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]"><EditIcon className="h-4 w-4" />重命名</button>
                  <button type="button" disabled={running} onClick={() => { setActionsId(null); onDelete(item.id) }} className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10" title={running ? '请先停止生成' : undefined}><TrashIcon className="h-4 w-4" />{running ? '先停止生成' : '删除'}</button>
                </div>}
              </div>
            </div>
          )
        })}
      </div>
      {mobile && <button type="button" onClick={onClose} className="sr-only" aria-label="关闭会话列表"><CloseIcon /></button>}
    </aside>
  )
}
