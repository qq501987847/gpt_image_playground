import { useEffect } from 'react'
import { AGENT_SKILL_CHOICES, getAgentSkillChoice } from '../../lib/agentSkills'
import { useStore } from '../../store'
import { ChevronDownIcon } from '../icons'

interface AgentSkillSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AgentSkillSelector({ open, onOpenChange }: AgentSkillSelectorProps) {
  const conversations = useStore((s) => s.agentConversations)
  const activeConversationId = useStore((s) => s.activeAgentConversationId)
  const setConversationSkill = useStore((s) => s.setAgentConversationSkill)
  const conversation = conversations.find((item) => item.id === activeConversationId) ?? null
  const selected = getAgentSkillChoice(conversation?.skillId, conversation?.skillMode)
  const running = conversation?.rounds.some((round) => round.status === 'running') ?? false

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onOpenChange, open])

  return (
    <div className="relative min-w-0 shrink-0">
      <button
        type="button"
        disabled={!conversation || running}
        onClick={() => onOpenChange(!open)}
        className={`flex h-10 max-w-28 items-center gap-1 rounded-xl border px-2.5 text-xs outline-none transition-[transform,background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-blue-400/50 active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 ${open ? 'border-blue-300 bg-blue-50/80 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-300' : 'border-gray-200/60 bg-white/50 text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300'}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Agent 技能：${selected.label}`}
        title={running ? '生成期间不能切换技能' : selected.label}
      >
        <span className="truncate">{selected.shortLabel}</span>
        <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && <>
        <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="关闭技能菜单" onClick={() => onOpenChange(false)} />
        <div className="absolute bottom-full -left-[3.25rem] z-50 mb-2 w-[calc(100vw-2rem)] max-w-xs overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-white/[0.08] dark:bg-gray-900 sm:left-0" role="menu">
          {AGENT_SKILL_CHOICES.map((choice) => {
            const active = choice.skillId === selected.skillId && choice.mode === selected.mode
            return (
              <button
                key={`${choice.skillId ?? 'general'}:${choice.mode ?? 'general'}`}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  if (conversation) setConversationSkill(conversation.id, choice.skillId, choice.mode)
                  onOpenChange(false)
                }}
                className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors ${active ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.06]'}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-blue-500' : 'bg-gray-200 dark:bg-white/[0.12]'}`} />
                <span className="min-w-0 flex-1 truncate">{choice.label}</span>
              </button>
            )
          })}
        </div>
      </>}
    </div>
  )
}
