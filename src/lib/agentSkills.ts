import type { AgentConversation, AgentImagePlanGroup, AgentImagePlanGroupKind, AgentImagePlanItem, AgentRound, AgentSkillId, AgentSkillMode, AgentSkillPlan, ResponsesOutputItem } from '../types'

export interface AgentSkillChoice {
  skillId: AgentSkillId | null
  mode?: AgentSkillMode
  label: string
  shortLabel: string
  description: string
}

export interface AgentSkillSession {
  skillId: AgentSkillId
  mode: AgentSkillMode
  plan: AgentSkillPlan | null
}

type AgentSkillConversationState = Partial<Pick<AgentConversation, 'skillId' | 'skillMode' | 'skillPlan'>>

const PLAN_FUNCTION_NAME = 'propose_image_plan'
const ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9', '9:21', '1:3', '3:1', '2:1', '1:2'])
const RESOLUTIONS = new Set<AgentImagePlanItem['resolution']>(['1K', '2K', '4K'])
const PRODUCT_CLAIM_INSTRUCTIONS = [
  'Treat certifications, sales figures, reviews, test results, guarantees, and product specifications as factual claims. When relevant specifications are missing and the user has not authorized mock or placeholder copy, ask the user for verified specifications.',
  'When the user explicitly authorizes simulated, mock, or invented product specifications, infer a category-appropriate provisional specification set and fill it with concrete, plausible mock values. Select only fields that make sense for that product category. Do not ask for the real values again, and do not use "XX" placeholders for a simulation request.',
  'Prefix a plan containing simulated values with "模拟参数，发布前核实｜" and briefly remind the user that the values must be verified before publication.',
  'Use "XX" or other placeholders only when the user explicitly requests placeholders instead of simulated values.',
]

export const AGENT_SKILL_CHOICES: AgentSkillChoice[] = [
  {
    skillId: null,
    label: '不使用技能',
    shortLabel: '未选择',
    description: '使用模型原生能力和现有生图工具。',
  },
  {
    skillId: 'ecom-details-image',
    mode: 'hero',
    label: '电商主图 · 5 张',
    shortLabel: '主图 5 张',
    description: '规划并分阶段生成 5 张商品主图。',
  },
  {
    skillId: 'ecom-details-image',
    mode: 'detail',
    label: '电商详情页 · 7–9 张',
    shortLabel: '详情页',
    description: '生成独立的详情页信息图，不与主图混成拼图。',
  },
  {
    skillId: 'ecom-details-image',
    mode: 'full',
    label: '电商完整套图',
    shortLabel: '完整套图',
    description: '包含 5 张主图和 7–9 张详情页图片。',
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePlanItem(value: unknown): AgentImagePlanItem | null {
  if (!isRecord(value)) return null
  const id = getString(value, 'id')
  const title = getString(value, 'title')
  const prompt = getString(value, 'prompt')
  const aspectRatio = getString(value, 'aspect_ratio') || getString(value, 'aspectRatio')
  const resolution = getString(value, 'resolution') as AgentImagePlanItem['resolution']
  if (!id || !title || !prompt || !ASPECT_RATIOS.has(aspectRatio) || !RESOLUTIONS.has(resolution)) return null
  if (resolution === '1K' && (aspectRatio === '1:3' || aspectRatio === '3:1')) return null
  return { id, title, prompt, aspectRatio, resolution }
}

function normalizePlanGroup(value: unknown): AgentImagePlanGroup | null {
  if (!isRecord(value)) return null
  const kind = getString(value, 'kind') as AgentImagePlanGroupKind
  const title = getString(value, 'title')
  if ((kind !== 'hero' && kind !== 'detail') || !title || !Array.isArray(value.images)) return null
  const images = value.images.map(normalizePlanItem)
  if (images.some((item) => !item)) return null
  return { kind, title, images: images as AgentImagePlanItem[] }
}

function validateGroupCounts(mode: AgentSkillMode, groups: AgentImagePlanGroup[]) {
  const hero = groups.find((group) => group.kind === 'hero')
  const detail = groups.find((group) => group.kind === 'detail')
  if (new Set(groups.map((group) => group.kind)).size !== groups.length) return '同一图片分组不能重复'
  if (mode === 'hero' && (groups.length !== 1 || hero?.images.length !== 5)) return '主图方案必须包含且仅包含 5 张主图'
  if (mode === 'detail' && (groups.length !== 1 || !detail || detail.images.length < 7 || detail.images.length > 9)) return '详情页方案必须包含且仅包含 7–9 张详情图'
  if (mode === 'full' && (groups.length !== 2 || hero?.images.length !== 5 || !detail || detail.images.length < 7 || detail.images.length > 9)) {
    return '完整套图必须包含 5 张主图和 7–9 张详情图'
  }
  return null
}

export function getAgentSkillChoice(skillId: AgentSkillId | null | undefined, mode?: AgentSkillMode) {
  return AGENT_SKILL_CHOICES.find((choice) => choice.skillId === (skillId ?? null) && choice.mode === mode)
    ?? AGENT_SKILL_CHOICES[0]
}

export function getAgentSkillSession(conversation: Pick<AgentConversation, 'skillId' | 'skillMode' | 'skillPlan'>): AgentSkillSession | null {
  if (conversation.skillId !== 'ecom-details-image') return null
  const mode = conversation.skillMode === 'hero' || conversation.skillMode === 'detail' || conversation.skillMode === 'full'
    ? conversation.skillMode
    : 'full'
  return { skillId: conversation.skillId, mode, plan: conversation.skillPlan ?? null }
}

function getRequestPlanGroups(plan: AgentSkillPlan) {
  return plan.groups.map((group) => ({
    kind: group.kind,
    title: group.title,
    images: group.images.map((item) => ({
      id: item.id,
      title: item.title,
      prompt: item.prompt,
      aspect_ratio: item.aspectRatio,
      resolution: item.resolution,
    })),
  }))
}

export function resolveAgentSkillRequest(session: AgentSkillSession | null) {
  if (!session) return null
  const modeInstruction = session.mode === 'hero'
    ? 'The requested package is exactly 5 hero images and must not contain detail-page images.'
    : session.mode === 'detail'
    ? 'The requested package is 7 to 9 detail-page infographic images and must not contain hero images.'
    : 'The requested package is exactly 5 hero images plus 7 to 9 detail-page infographic images in separate groups.'

  if (session.plan?.status === 'approved') {
    const groups = getRequestPlanGroups(session.plan)
    return {
      instructions: [
        '## Built-in skill: Ecommerce image package',
        'The user explicitly approved the image plan from the earlier propose_image_plan call.',
        'Generate exactly the approved items in the JSON below. Use every item id unchanged. Do not add, remove, merge, collage, or silently replace items.',
        JSON.stringify(groups),
        `Use this campaign style lock unchanged in every image prompt: ${session.plan.styleLock}`,
        'For every tool call, combine the campaign style lock with the exact approved item prompt and preserve its approved aspect_ratio and resolution.',
        'Stage 1: generate the first approved item alone as the base reference, then call continue_generation.',
        'Stage 2: if more approved hero items exist, generate only those hero items with generate_image_batch, using the base reference. Call continue_generation only when approved detail items still remain.',
        'Stage 3: generate approved detail items with generate_image_batch, using the base reference. Stop when every approved item has one independent output.',
        'If the approved package has no hero group, use the first detail item as the base reference, then generate the remaining detail items in Stage 3.',
        'Detail-page outputs must be ecommerce infographics with short readable labels, structured layout, and generous whitespace.',
        'Render approved placeholder or mock copy exactly as written. Do not add, remove, or alter product claims during generation.',
      ].join('\n'),
      tools: null,
    }
  }

  if (session.plan?.status === 'review') {
    return {
      instructions: [
        '## Built-in skill: Ecommerce image package',
        modeInstruction,
        'The app currently has the following complete image plan in review:',
        JSON.stringify(getRequestPlanGroups(session.plan)),
        `Current campaign style lock: ${session.plan.styleLock}`,
        'The app\'s visible confirmation control is the only approval path that authorizes billable image generation.',
        'User chat messages such as "确认", "可以", or "继续" do not approve it. Never claim that the plan is approved or that generation has started based on chat text.',
        'If the user requests any change, call propose_image_plan exactly once with the complete revised plan, including every unchanged item. This replaces the plan shown for review.',
        'If the requested change is to add placeholder or mock product specifications, replace the reviewed plan with a complete revised plan and follow the product-claim rules below.',
        'If the user accepts the plan without changes, briefly direct them to the visible confirmation control. Do not call propose_image_plan again and do not say that image tools are unavailable.',
        'If the user only asks for advice or copywriting, answer normally without changing the plan.',
        ...PRODUCT_CLAIM_INSTRUCTIONS,
      ].join('\n'),
      tools: [createPlanTool(session.mode)],
    }
  }

  return {
    instructions: [
      '## Built-in skill: Ecommerce image package',
      modeInstruction,
      'If the user only asks for advice or copywriting, answer normally without proposing or generating images.',
      'If the user asks to generate images, first design a concrete package and call propose_image_plan exactly once.',
      'No image-generation tool is available until the user reviews and explicitly confirms the proposed package.',
      'Every item needs a self-contained generation prompt. Keep hero and detail-page images in separate groups and never propose a collage.',
      'Use one consistent campaign style lock across the package. Vary camera angle and framing while preserving product identity, palette, typography system, lighting, and layout language.',
      'Use 1:1 at 2K by default for hero images and 2:3 at 2K by default for detail-page images unless the user or target platform requires another supported format.',
      'A 5-image hero sequence must use at least 3 camera angles and include at least one close-up or macro view.',
      'A detail-page sequence must use ecommerce infographic layouts with headlines, labels, icons, comparisons, steps, or trust elements. It must not be a set of plain product-angle photos.',
      ...PRODUCT_CLAIM_INSTRUCTIONS,
    ].join('\n'),
    tools: [createPlanTool(session.mode)],
  }
}

function createPlanTool(mode: AgentSkillMode) {
  const groupDescription = mode === 'hero'
    ? 'Provide one hero group with exactly 5 images.'
    : mode === 'detail'
    ? 'Provide one detail group with 7 to 9 images.'
    : 'Provide one hero group with exactly 5 images and one detail group with 7 to 9 images.'
  return {
    type: 'function',
    name: PLAN_FUNCTION_NAME,
    description: `Propose a billable ecommerce image package for user confirmation. ${groupDescription}`,
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Concise package title.' },
        style_lock: { type: 'string', description: 'Shared palette, typography, background, lighting, layout, icon, and product-presentation rules.' },
        groups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['hero', 'detail'] },
              title: { type: 'string' },
              images: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Stable short id such as H1 or D1.' },
                    title: { type: 'string', description: 'Short user-facing purpose.' },
                    prompt: { type: 'string', description: 'Self-contained image prompt without the shared style lock.' },
                    aspect_ratio: { type: 'string', enum: [...ASPECT_RATIOS] },
                    resolution: { type: 'string', enum: [...RESOLUTIONS] },
                  },
                  required: ['id', 'title', 'prompt', 'aspect_ratio', 'resolution'],
                  additionalProperties: false,
                },
              },
            },
            required: ['kind', 'title', 'images'],
            additionalProperties: false,
          },
        },
      },
      required: ['title', 'style_lock', 'groups'],
      additionalProperties: false,
    },
    strict: true,
  }
}

export function parseAgentSkillPlanCall(session: AgentSkillSession | null, argumentsJson: string, sourceRoundId: string) {
  if (!session) return { ok: false as const, error: '当前会话没有启用图片规划技能' }
  try {
    const value = JSON.parse(argumentsJson) as unknown
    if (!isRecord(value) || !Array.isArray(value.groups)) return { ok: false as const, error: '图片方案格式无效' }
    const title = getString(value, 'title')
    const styleLock = getString(value, 'style_lock')
    const groups = value.groups.map(normalizePlanGroup)
    if (!title || !styleLock || groups.some((group) => !group)) return { ok: false as const, error: '图片方案缺少标题、风格锁或有效图片项' }
    const normalizedGroups = groups as AgentImagePlanGroup[]
    const countError = validateGroupCounts(session.mode, normalizedGroups)
    if (countError) return { ok: false as const, error: countError }
    const ids = normalizedGroups.flatMap((group) => group.images.map((item) => item.id))
    if (new Set(ids).size !== ids.length) return { ok: false as const, error: '图片方案中的 ID 不能重复' }
    return {
      ok: true as const,
      plan: {
        skillId: session.skillId,
        title,
        styleLock,
        groups: normalizedGroups,
        sourceRoundId,
        status: 'review' as const,
      },
    }
  } catch {
    return { ok: false as const, error: '图片方案不是有效 JSON' }
  }
}

function getPlanDecision(output: ResponsesOutputItem[], callId: string) {
  const item = output.find((candidate) => candidate.type === 'function_call_output' && candidate.call_id === callId)
  if (typeof item?.output !== 'string') return null
  try {
    const value = JSON.parse(item.output) as unknown
    if (!isRecord(value) || typeof value.status !== 'string') return null
    const selectedGroups = Array.isArray(value.selected_groups)
      ? value.selected_groups.filter((group): group is AgentImagePlanGroupKind => group === 'hero' || group === 'detail')
      : []
    return { status: value.status, selectedGroups }
  } catch {
    return null
  }
}

export function recoverAgentSkillPlan(session: AgentSkillSession | null, rounds: AgentRound[]) {
  if (!session || session.plan) return session?.plan ?? null

  for (let roundIndex = rounds.length - 1; roundIndex >= 0; roundIndex -= 1) {
    const round = rounds[roundIndex]
    const output = round.responseOutput ?? []
    for (let itemIndex = output.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = output[itemIndex]
      if (item.type !== 'function_call' || item.name !== PLAN_FUNCTION_NAME || !item.call_id) continue
      const decision = getPlanDecision(output, item.call_id)
      if (decision?.status === 'dismissed') return null
      if (decision?.status !== 'awaiting_user_confirmation' && decision?.status !== 'approved') continue

      const parsed = parseAgentSkillPlanCall(session, item.arguments ?? '', round.id)
      if (!parsed.ok) continue
      if (decision.status === 'awaiting_user_confirmation') return parsed.plan
      return selectAgentSkillPlanGroups(parsed.plan, decision.selectedGroups)
    }
  }
  return null
}

export function setAgentSkillPlanDecision(
  output: ResponsesOutputItem[] | undefined,
  status: 'approved' | 'dismissed',
  selectedGroups: AgentImagePlanGroupKind[] = [],
) {
  if (!output?.length) return output
  const call = [...output].reverse().find((item) => item.type === 'function_call' && item.name === PLAN_FUNCTION_NAME && item.call_id)
  if (!call?.call_id) return output

  let changed = false
  const updated = output.map((item) => {
    if (item.type !== 'function_call_output' || item.call_id !== call.call_id) return item
    changed = true
    return {
      ...item,
      output: JSON.stringify({
        status,
        ...(status === 'approved' ? { selected_groups: selectedGroups } : {}),
      }),
    }
  })
  return changed ? updated : output
}

export function selectAgentSkillPlanGroups(plan: AgentSkillPlan, selectedKinds: AgentImagePlanGroupKind[]) {
  const selected = new Set(selectedKinds)
  const groups = plan.groups.filter((group) => selected.has(group.kind))
  if (groups.length === 0) return null
  if (groups.some((group) => group.kind === 'hero' ? group.images.length !== 5 : group.images.length < 7 || group.images.length > 9)) return null
  return { ...plan, groups, status: 'approved' as const }
}

export function getAgentSkillBaseItemId(plan: AgentSkillPlan | null) {
  if (!plan) return null
  return plan.groups.find((group) => group.kind === 'hero')?.images[0]?.id
    ?? plan.groups.find((group) => group.kind === 'detail')?.images[0]?.id
    ?? null
}

export function getAgentSkillPlanStageError(
  plan: AgentSkillPlan | null,
  completedItemIds: Set<string>,
  requestedItemIds: string[],
  batch: boolean,
) {
  if (plan?.status !== 'approved') return null
  if (requestedItemIds.some((id) => completedItemIds.has(id))) return '图片方案项不能重复生成'

  const heroIds = plan.groups.find((group) => group.kind === 'hero')?.images.map((item) => item.id) ?? []
  const detailIds = plan.groups.find((group) => group.kind === 'detail')?.images.map((item) => item.id) ?? []
  const firstId = getAgentSkillBaseItemId(plan)
  if (completedItemIds.size === 0) {
    return !batch && requestedItemIds.length === 1 && requestedItemIds[0] === firstId ? null : `请先单独生成基准图 ${firstId}`
  }

  const remainingHeroIds = heroIds.filter((id) => !completedItemIds.has(id))
  const remainingDetailIds = detailIds.filter((id) => !completedItemIds.has(id))
  const expectedIds = remainingHeroIds.length > 0 ? remainingHeroIds : remainingDetailIds
  const usesExpectedTool = expectedIds.length === 1 ? !batch : batch
  if (!usesExpectedTool || requestedItemIds.length !== expectedIds.length || requestedItemIds.some((id, index) => id !== expectedIds[index])) {
    return `当前阶段必须按方案顺序生成：${expectedIds.join(', ')}`
  }
  return null
}

export function normalizeAgentSkillConversation(value: Record<string, unknown>, validRoundIds: Set<string>): AgentSkillConversationState {
  if (value.skillId !== 'ecom-details-image') return {}
  const skillMode: AgentSkillMode = value.skillMode === 'hero' || value.skillMode === 'detail' || value.skillMode === 'full' ? value.skillMode : 'full'
  const planValue = isRecord(value.skillPlan) ? value.skillPlan : null
  if (!planValue || !Array.isArray(planValue.groups)) return { skillId: value.skillId, skillMode, skillPlan: null }
  const sourceRoundId = getString(planValue, 'sourceRoundId')
  const groups = planValue.groups.map(normalizePlanGroup)
  const status = planValue.status === 'approved' ? 'approved' : planValue.status === 'review' ? 'review' : null
  if (!sourceRoundId || !validRoundIds.has(sourceRoundId) || !status || groups.some((group) => !group)) {
    return { skillId: value.skillId, skillMode, skillPlan: null }
  }
  const normalizedGroups = groups as AgentImagePlanGroup[]
  const countError = status === 'review'
    ? validateGroupCounts(skillMode, normalizedGroups)
    : normalizedGroups.length === 0 || new Set(normalizedGroups.map((group) => group.kind)).size !== normalizedGroups.length || normalizedGroups.some((group) => group.kind === 'hero'
      ? group.images.length !== 5
      : group.images.length < 7 || group.images.length > 9)
      ? '已批准方案的图片数量无效'
      : null
  const itemIds = normalizedGroups.flatMap((group) => group.images.map((item) => item.id))
  if (countError || new Set(itemIds).size !== itemIds.length || !getString(planValue, 'styleLock')) {
    return { skillId: value.skillId, skillMode, skillPlan: null }
  }
  return {
    skillId: value.skillId,
    skillMode,
    skillPlan: {
      skillId: value.skillId,
      title: getString(planValue, 'title') || '电商图片方案',
      styleLock: getString(planValue, 'styleLock'),
      groups: normalizedGroups,
      sourceRoundId,
      status,
    },
  }
}

export const AGENT_SKILL_PLAN_FUNCTION_NAME = PLAN_FUNCTION_NAME
