import { useEffect, useMemo, useState } from 'react'
import type { AgentImagePlanGroupKind, AgentSkillPlan } from '../types'
import { approveAgentSkillPlan, dismissAgentSkillPlan } from '../store'
import { Checkbox } from './Checkbox'

interface AgentSkillPlanCardProps {
  conversationId: string
  plan: AgentSkillPlan
}

export default function AgentSkillPlanCard({ conversationId, plan }: AgentSkillPlanCardProps) {
  const [selectedKinds, setSelectedKinds] = useState<AgentImagePlanGroupKind[]>(() => plan.groups.map((group) => group.kind))

  useEffect(() => {
    setSelectedKinds(plan.groups.map((group) => group.kind))
  }, [plan.sourceRoundId, plan.status])

  const selectedGroups = useMemo(
    () => plan.groups.filter((group) => selectedKinds.includes(group.kind)),
    [plan.groups, selectedKinds],
  )
  const selectedCount = selectedGroups.reduce((count, group) => count + group.images.length, 0)
  const approved = plan.status === 'approved'

  return (
    <section className="mt-3 w-full overflow-hidden rounded-lg border border-blue-200/80 bg-white shadow-sm dark:border-blue-400/20 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-white/[0.08]">
        <div className="min-w-0">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">电商套图方案</p>
          <h3 className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{plan.title}</h3>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${approved ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'}`}>
          {approved ? '已确认' : '待确认'}
        </span>
      </div>

      <div className="px-4">
        {plan.groups.map((group) => {
          const selected = approved || selectedKinds.includes(group.kind)
          return (
            <section key={group.kind} className="border-b border-gray-100 py-3 last:border-b-0 dark:border-white/[0.08]">
              <div className="flex items-center justify-between gap-3">
                {approved ? (
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{group.title}</p>
                ) : (
                  <Checkbox
                    checked={selected}
                    onChange={(checked) => setSelectedKinds((current) => checked
                      ? plan.groups.map((item) => item.kind).filter((kind) => kind === group.kind || current.includes(kind))
                      : current.filter((kind) => kind !== group.kind))}
                    label={group.title}
                  />
                )}
                <span className="text-xs tabular-nums text-gray-400">{group.images.length} 张</span>
              </div>
              <div className={`mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2 ${selected ? '' : 'opacity-40'}`}>
                {group.images.map((item, index) => (
                  <div key={item.id} className="flex min-w-0 items-center gap-2 text-xs">
                    <span className="w-5 shrink-0 text-right tabular-nums text-gray-400">{index + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300" title={item.title}>{item.title}</span>
                    <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 tabular-nums text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">{item.aspectRatio}</span>
                    <span className="w-6 shrink-0 text-right tabular-nums text-gray-400">{item.resolution}</span>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {!approved && (
        <div className="border-t border-amber-100 bg-amber-50/60 px-4 py-3 dark:border-amber-500/10 dark:bg-amber-500/[0.06]">
          <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">确认后才会调用生图并按实际张数计费；每张主图和详情图都会独立生成。</p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => dismissAgentSkillPlan(conversationId, plan.sourceRoundId)}
              className="h-9 px-3 text-sm text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              取消方案
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => void approveAgentSkillPlan(conversationId, plan.sourceRoundId, selectedKinds)}
              className="h-9 rounded-lg bg-blue-500 px-4 text-sm font-medium text-white transition-[transform,background-color] hover:bg-blue-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-white/[0.08]"
            >
              确认生成 {selectedCount} 张
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
