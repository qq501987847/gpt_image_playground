import { describe, expect, it } from 'vitest'
import type { AgentSkillSession } from './agentSkills'
import { getAgentSkillBaseItemId, getAgentSkillPlanStageError, normalizeAgentSkillConversation, parseAgentSkillPlanCall, resolveAgentSkillRequest, selectAgentSkillPlanGroups } from './agentSkills'

function planArgs(heroCount = 5, detailCount = 7) {
  const image = (id: string) => ({ id, title: `图片 ${id}`, prompt: `生成 ${id}`, aspect_ratio: id.startsWith('H') ? '1:1' : '2:3', resolution: '2K' })
  return JSON.stringify({
    title: '商品套图',
    style_lock: '固定白色背景、深灰文字和统一左侧光源。',
    groups: [
      { kind: 'hero', title: '主图', images: Array.from({ length: heroCount }, (_, idx) => image(`H${idx + 1}`)) },
      { kind: 'detail', title: '详情页', images: Array.from({ length: detailCount }, (_, idx) => image(`D${idx + 1}`)) },
    ],
  })
}

const session: AgentSkillSession = { skillId: 'ecom-details-image', mode: 'full', plan: null }

describe('agent skills', () => {
  it('accepts a complete ecommerce package with exact billable item counts', () => {
    const result = parseAgentSkillPlanCall(session, planArgs(), 'round-1')
    expect(result).toMatchObject({
      ok: true,
      plan: {
        sourceRoundId: 'round-1',
        status: 'review',
        groups: [{ kind: 'hero' }, { kind: 'detail' }],
      },
    })
  })

  it('rejects incomplete packages before they can be confirmed', () => {
    expect(parseAgentSkillPlanCall(session, planArgs(4), 'round-1')).toEqual({
      ok: false,
      error: '完整套图必须包含 5 张主图和 7–9 张详情图',
    })
    expect(parseAgentSkillPlanCall(session, planArgs(5, 10), 'round-1')).toEqual({
      ok: false,
      error: '完整套图必须包含 5 张主图和 7–9 张详情图',
    })
  })

  it('offers only the planning tool before approval and normal image tools after approval', () => {
    const planning = resolveAgentSkillRequest(session)
    expect(planning?.tools?.map((tool) => tool.name)).toEqual(['propose_image_plan'])
    const parsed = parseAgentSkillPlanCall(session, planArgs(), 'round-1')
    if (!parsed.ok) throw new Error(parsed.error)
    const approved = resolveAgentSkillRequest({ ...session, plan: { ...parsed.plan, status: 'approved' } })
    expect(approved?.tools).toBeNull()
    expect(approved?.instructions).toContain('"id":"H1"')
    expect(approved?.instructions).toContain('Stage 3')
  })

  it('approves only the user-selected groups without changing their items', () => {
    const parsed = parseAgentSkillPlanCall(session, planArgs(), 'round-1')
    if (!parsed.ok) throw new Error(parsed.error)
    const approved = selectAgentSkillPlanGroups(parsed.plan, ['detail'])
    expect(approved).toMatchObject({ status: 'approved', groups: [{ kind: 'detail' }] })
    expect(approved?.groups[0].images).toHaveLength(7)
    expect(approved?.groups[0].images[0].id).toBe('D1')
    expect(selectAgentSkillPlanGroups(parsed.plan, [])).toBeNull()
  })

  it('enforces base, remaining hero, then detail generation stages', () => {
    const parsed = parseAgentSkillPlanCall(session, planArgs(), 'round-1')
    if (!parsed.ok) throw new Error(parsed.error)
    const plan = { ...parsed.plan, status: 'approved' as const }
    expect(getAgentSkillPlanStageError(plan, new Set(), ['H2'], false)).toBe('请先单独生成基准图 H1')
    expect(getAgentSkillPlanStageError(plan, new Set(), ['H1'], false)).toBeNull()
    expect(getAgentSkillPlanStageError(plan, new Set(['H1']), ['H2', 'H3', 'H4', 'H5'], true)).toBeNull()
    expect(getAgentSkillPlanStageError(plan, new Set(['H1']), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'], true)).toBe('当前阶段必须按方案顺序生成：H2, H3, H4, H5')
    expect(getAgentSkillPlanStageError(plan, new Set(['H1', 'H2', 'H3', 'H4', 'H5']), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'], true)).toBeNull()
    expect(getAgentSkillBaseItemId(plan)).toBe('H1')
    expect(getAgentSkillBaseItemId({ ...plan, groups: plan.groups.filter((group) => group.kind === 'detail') })).toBe('D1')
  })

  it('drops unknown skills and plans that point to deleted rounds', () => {
    expect(normalizeAgentSkillConversation({ skillId: 'unknown' }, new Set())).toEqual({})
    expect(normalizeAgentSkillConversation({
      skillId: 'ecom-details-image',
      skillMode: 'hero',
      skillPlan: { sourceRoundId: 'missing', groups: [], status: 'review' },
    }, new Set())).toEqual({ skillId: 'ecom-details-image', skillMode: 'hero', skillPlan: null })
  })
})
