import { describe, expect, it } from 'vitest'

import type { AgentConversation, ExportData, TaskRecord } from '../types'
import { createBackupImportPlan } from './backupImport'

const task = {
  id: 'task-a',
  prompt: 'prompt',
  params: {},
  inputImageIds: ['image-a'],
  outputImages: ['image-b'],
  favoriteCollectionIds: ['collection-a'],
  agentConversationId: 'conversation-a',
  agentRoundId: 'round-a',
  agentMessageId: 'message-a',
  status: 'done',
  error: null,
  createdAt: 1,
  finishedAt: 2,
  elapsed: 1,
} as TaskRecord

const conversation: AgentConversation = {
  id: 'conversation-a',
  title: 'conversation',
  activeRoundId: 'round-a',
  createdAt: 1,
  updatedAt: 2,
  rounds: [{
    id: 'round-a',
    index: 1,
    parentRoundId: null,
    userMessageId: 'message-a',
    assistantMessageId: 'message-b',
    prompt: 'prompt',
    inputImageIds: ['image-a'],
    outputTaskIds: ['task-a'],
    status: 'done',
    error: null,
    createdAt: 1,
    finishedAt: 2,
  }],
  messages: [{ id: 'message-a', role: 'user', content: 'prompt', roundId: 'round-a', inputImageIds: ['image-a'], outputTaskIds: ['task-a'], createdAt: 1 }],
}

describe('backup import plan', () => {
  it('remaps colliding IDs and all package references without changing current records', () => {
    const manifest: ExportData = {
      version: 3,
      exportedAt: new Date(0).toISOString(),
      tasks: [task],
      favoriteCollections: [{ id: 'collection-a', name: 'favorite', createdAt: 1, updatedAt: 1 }],
      defaultFavoriteCollectionId: 'collection-a',
      agentConversations: [conversation],
      imageFiles: {
        'image-a': { path: 'images/a.png' },
        'image-b': { path: 'images/b.png' },
      },
    }
    const plan = createBackupImportPlan([manifest], {
      tasks: ['task-a'],
      images: ['image-a', 'image-b'],
      collections: ['collection-a'],
      conversations: [conversation],
    })

    expect(plan.tasks[0].id).toBe('task-a-imported')
    expect(plan.tasks[0]).toMatchObject({
      inputImageIds: ['image-a-imported'],
      outputImages: ['image-b-imported'],
      favoriteCollectionIds: ['collection-a-imported'],
      agentConversationId: 'conversation-a-imported',
      agentRoundId: 'round-a-imported',
      agentMessageId: 'message-a-imported',
    })
    expect(plan.conversations[0].rounds[0]).toMatchObject({
      id: 'round-a-imported',
      userMessageId: 'message-a-imported',
      assistantMessageId: 'message-b',
      inputImageIds: ['image-a-imported'],
      outputTaskIds: ['task-a-imported'],
    })
    expect(Object.keys(plan.manifests[0].imageFiles ?? {})).toEqual(['image-a-imported', 'image-b-imported'])
  })
})
