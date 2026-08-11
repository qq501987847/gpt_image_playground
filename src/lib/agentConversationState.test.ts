import { describe, expect, it } from 'vitest'
import type { AgentConversation, AgentRound } from '../types'
import { deleteAgentRoundFromConversation, getAgentBranchLeafId, getAgentRoundPath, getConversationSearchText, normalizeAgentConversations } from './agentConversationState'

function round(id: string, parentRoundId: string | null, index: number): AgentRound {
  return {
    id,
    index,
    parentRoundId,
    userMessageId: `user-${id}`,
    prompt: id,
    inputImageIds: [],
    outputTaskIds: [],
    status: 'done',
    error: null,
    createdAt: index,
    finishedAt: index,
  }
}

function conversation(rounds: AgentRound[], activeRoundId: string | null): AgentConversation {
  return {
    id: 'conversation-a',
    title: '对话',
    activeRoundId,
    createdAt: 1,
    updatedAt: 1,
    rounds,
    messages: [],
  }
}

describe('agent conversation state', () => {
  it('stops traversing cyclic parent relationships', () => {
    const value = conversation([
      round('round-a', 'round-b', 1),
      round('round-b', 'round-a', 2),
    ], 'round-a')

    expect(getAgentRoundPath(value, 'round-a').map((item) => item.id)).toEqual(['round-b', 'round-a'])
    expect(getAgentBranchLeafId(value, 'round-a')).toBe('round-a')
  })

  it.each([
    {
      name: '缺失 activeRoundId 的旧线性格式',
      activeRoundId: undefined,
      parentRoundIds: [undefined, undefined],
      expectedActiveRoundId: 'round-b',
      expectedParentRoundIds: [null, 'round-a'],
    },
    {
      name: '有效 activeRoundId 的分支格式',
      activeRoundId: 'round-a',
      parentRoundIds: [undefined, undefined],
      expectedActiveRoundId: 'round-a',
      expectedParentRoundIds: [null, null],
    },
    {
      name: '失效 activeRoundId 的分支格式',
      activeRoundId: 'round-missing',
      parentRoundIds: [undefined, undefined],
      expectedActiveRoundId: 'round-b',
      expectedParentRoundIds: [null, null],
    },
    {
      name: '带 parent 的分支格式',
      activeRoundId: undefined,
      parentRoundIds: [null, 'round-a'],
      expectedActiveRoundId: 'round-b',
      expectedParentRoundIds: [null, 'round-a'],
    },
  ])('normalizes $name compatibly', ({ activeRoundId, parentRoundIds, expectedActiveRoundId, expectedParentRoundIds }) => {
    const normalized = normalizeAgentConversations([{
      id: 'conversation-a',
      title: '对话',
      ...(activeRoundId === undefined ? {} : { activeRoundId }),
      rounds: parentRoundIds.map((parentRoundId, index) => ({
        ...round(`round-${index === 0 ? 'a' : 'b'}`, null, index + 1),
        parentRoundId,
      })),
      messages: [],
      createdAt: 1,
      updatedAt: 2,
    }])

    expect(normalized[0].activeRoundId).toBe(expectedActiveRoundId)
    expect(normalized[0].rounds.map((item) => item.parentRoundId)).toEqual(expectedParentRoundIds)
  })

  it('filters malformed and orphaned records while preserving legacy field defaults', () => {
    const normalized = normalizeAgentConversations([null, {}, { id: '' }, {
      id: 'conversation-a',
      title: '',
      rounds: [
        null,
        { id: 'bad-round' },
        { ...round('round-a', null, 1), parentRoundId: undefined, status: 'running' },
      ],
      messages: [
        null,
        { id: 'bad-role', role: 'system', content: '丢弃', roundId: 'round-a', createdAt: 1 },
        { id: 'orphan', role: 'assistant', content: '丢弃', roundId: 'missing', createdAt: 2 },
        { id: 'user-round-a', role: 'user', content: '保留', roundId: 'round-a', createdAt: 3 },
      ],
      createdAt: 1,
      updatedAt: 2,
    }])

    expect(normalized).toHaveLength(1)
    expect(normalized[0]).toMatchObject({
      title: '新对话',
      activeRoundId: 'round-a',
      rounds: [{ id: 'round-a', parentRoundId: null, status: 'error', error: '上次请求已中断' }],
    })
    expect(normalized[0].messages.map((message) => message.id)).toEqual(['user-round-a'])
  })

  it('filters malformed response output items while preserving unknown typed items', () => {
    const normalized = normalizeAgentConversations([{
      id: 'conversation-a',
      rounds: [{
        ...round('round-a', null, 1),
        responseOutput: [
          null,
          [],
          'invalid',
          {},
          { type: '' },
          { type: '   ' },
          { type: 'future_response_item', custom: { enabled: true } },
          { type: 'message', content: [] },
        ],
      }],
      messages: [],
    }])

    expect(normalized[0].rounds[0].responseOutput).toEqual([
      { type: 'future_response_item', custom: { enabled: true } },
      { type: 'message', content: [] },
    ])
  })

  it('preserves a recoverable partial round and its error across reloads', () => {
    const value = conversation([round('round-a', null, 1)], 'round-a')
    value.rounds = [{ ...value.rounds[0], status: 'partial', error: '图片已保留', finishedAt: 2 }]
    const normalized = normalizeAgentConversations([value])

    expect(normalized[0].rounds[0]).toMatchObject({
      status: 'partial',
      error: '图片已保留',
      finishedAt: 2,
    })
  })

  it('preserves valid token usage across reloads', () => {
    const value = conversation([{
      ...round('round-a', null, 1),
      usage: {
        apiCalls: 2,
        inputTokens: 1200,
        outputTokens: 80,
        totalTokens: 1280,
        cachedInputTokens: 900,
        cacheMissInputTokens: 300,
        cacheWriteInputTokens: 0,
      },
    }], 'round-a')

    expect(normalizeAgentConversations([value])[0].rounds[0].usage).toEqual(value.rounds[0].usage)
  })

  it('keeps the first entity when persisted IDs are duplicated', () => {
    const normalized = normalizeAgentConversations([{
      id: 'conversation-a',
      title: '第一个对话',
      rounds: [
        round('round-a', null, 1),
        { ...round('round-a', null, 2), prompt: '重复轮次' },
      ],
      messages: [
        { id: 'message-a', role: 'user', content: '第一条', roundId: 'round-a', createdAt: 1 },
        { id: 'message-a', role: 'assistant', content: '重复消息', roundId: 'round-a', createdAt: 2 },
      ],
      createdAt: 1,
      updatedAt: 1,
    }, {
      id: 'conversation-a',
      title: '重复对话',
      rounds: [],
      messages: [],
      createdAt: 2,
      updatedAt: 2,
    }])

    expect(normalized).toHaveLength(1)
    expect(normalized[0].title).toBe('第一个对话')
    expect(normalized[0].rounds.map((item) => item.prompt)).toEqual(['round-a'])
    expect(normalized[0].messages.map((message) => message.content)).toEqual(['第一条'])
  })

  it('builds case-insensitive search text from conversation content', () => {
    const value = conversation([round('round-a', null, 1)], 'round-a')
    value.title = 'Project ALPHA'
    value.rounds[0].prompt = 'Round Prompt'
    value.messages = [{ id: 'user-round-a', role: 'user', content: 'Message Body', roundId: 'round-a', createdAt: 1 }]

    expect(getConversationSearchText(value)).toBe('project alpha\nmessage body\nround prompt')
  })

  it('defaults legacy conversations to read state', () => {
    const [normalized] = normalizeAgentConversations([conversation([], null)])
    expect(normalized.unread).toBe(false)
  })

  it('preserves a valid built-in skill and clears its plan when the source round is missing', () => {
    const valid = normalizeAgentConversations([{
      ...conversation([round('round-a', null, 1)], 'round-a'),
      skillId: 'ecom-details-image',
      skillMode: 'hero',
      skillPlan: {
        skillId: 'ecom-details-image',
        title: '主图方案',
        styleLock: '统一风格',
        sourceRoundId: 'round-a',
        status: 'review',
        groups: [{
          kind: 'hero',
          title: '主图',
          images: Array.from({ length: 5 }, (_, idx) => ({
            id: `H${idx + 1}`,
            title: `主图 ${idx + 1}`,
            prompt: `生成主图 ${idx + 1}`,
            aspectRatio: '1:1',
            resolution: '2K',
          })),
        }],
      },
    }])[0]
    expect(valid).toMatchObject({ skillId: 'ecom-details-image', skillMode: 'hero', skillPlan: { sourceRoundId: 'round-a' } })

    const approvedSubset = normalizeAgentConversations([{
      ...valid,
      skillMode: 'full',
      skillPlan: { ...valid.skillPlan!, status: 'approved' },
    }])[0]
    expect(approvedSubset).toMatchObject({ skillMode: 'full', skillPlan: { status: 'approved', groups: [{ kind: 'hero' }] } })

    const missing = normalizeAgentConversations([{ ...valid, rounds: [], messages: [] }])[0]
    expect(missing.skillPlan).toBeNull()
  })

  it('recovers a lost review plan from the persisted proposal tool call', () => {
    const proposal = {
      title: '000 耳机主图方案',
      style_lock: '白底棚拍，统一产品外观与简洁中文排版',
      groups: [{
        kind: 'hero',
        title: '主图',
        images: Array.from({ length: 5 }, (_, idx) => ({
          id: `H${idx + 1}`,
          title: `主图 ${idx + 1}`,
          prompt: `生成耳机主图 ${idx + 1}`,
          aspect_ratio: '1:1',
          resolution: '2K',
        })),
      }],
    }
    const proposalRound = {
      ...round('round-a', null, 1),
      responseOutput: [{
        type: 'function_call',
        call_id: 'plan-call-a',
        name: 'propose_image_plan',
        arguments: JSON.stringify(proposal),
      }, {
        type: 'function_call_output',
        call_id: 'plan-call-a',
        output: JSON.stringify({ status: 'awaiting_user_confirmation' }),
      }],
    }
    const normalized = normalizeAgentConversations([{
      ...conversation([proposalRound, round('round-b', 'round-a', 2)], 'round-b'),
      skillId: 'ecom-details-image',
      skillMode: 'hero',
      skillPlan: null,
    }])[0]

    expect(normalized.skillPlan).toMatchObject({
      title: '000 耳机主图方案',
      sourceRoundId: 'round-a',
      status: 'review',
      groups: [{ kind: 'hero', images: [{ id: 'H1' }, { id: 'H2' }, { id: 'H3' }, { id: 'H4' }, { id: 'H5' }] }],
    })
  })

  it('clears a skill plan when deleting one of its source ancestors', () => {
    const value = normalizeAgentConversations([{
      ...conversation([round('round-a', null, 1), round('round-b', 'round-a', 2)], 'round-b'),
      skillId: 'ecom-details-image',
      skillMode: 'hero',
      skillPlan: {
        skillId: 'ecom-details-image',
        title: '主图方案',
        styleLock: '统一风格',
        sourceRoundId: 'round-b',
        status: 'review',
        groups: [{
          kind: 'hero',
          title: '主图',
          images: Array.from({ length: 5 }, (_, idx) => ({
            id: `H${idx + 1}`,
            title: `主图 ${idx + 1}`,
            prompt: `生成主图 ${idx + 1}`,
            aspectRatio: '1:1',
            resolution: '2K',
          })),
        }],
      },
    }])[0]
    expect(deleteAgentRoundFromConversation(value, 'round-a').skillPlan).toBeNull()
  })
})
