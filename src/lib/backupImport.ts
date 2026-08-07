import type { AgentConversation, ExportData, FavoriteCollection, TaskRecord } from '../types'

interface ExistingBackupIds {
  tasks: Iterable<string>
  images: Iterable<string>
  collections: Iterable<string>
  conversations: AgentConversation[]
}

export interface BackupImportPlan {
  manifests: ExportData[]
  tasks: TaskRecord[]
  collections: FavoriteCollection[]
  conversations: AgentConversation[]
  defaultCollectionId: string | null | undefined
  imageIds: Map<string, string>
}

function createUniqueId(id: string, used: Set<string>) {
  if (!used.has(id)) {
    used.add(id)
    return id
  }
  let next = `${id}-imported`
  let index = 2
  while (used.has(next)) next = `${id}-imported-${index++}`
  used.add(next)
  return next
}

function buildIdMap(ids: string[], used: Set<string>) {
  const map = new Map<string, string>()
  for (const id of ids) {
    if (!id || map.has(id)) continue
    map.set(id, createUniqueId(id, used))
  }
  return map
}

function remapValue<T>(value: T, ids: Map<string, string>): T {
  if (typeof value === 'string') return (ids.get(value) ?? value) as T
  if (Array.isArray(value)) return value.map((item) => remapValue(item, ids)) as T
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [ids.get(key) ?? key, remapValue(item, ids)])) as T
}

export function createBackupImportPlan(manifests: ExportData[], existing: ExistingBackupIds): BackupImportPlan {
  const importedTasks = manifests.flatMap((manifest) => manifest.tasks ?? [])
  const importedCollections = manifests.flatMap((manifest) => manifest.favoriteCollections ?? [])
  const importedConversations = manifests.flatMap((manifest) => manifest.agentConversations ?? [])
  const imageIds = manifests.flatMap((manifest) => Array.from(new Set([
    ...Object.keys(manifest.imageFiles ?? {}),
    ...Object.keys(manifest.thumbnailFiles ?? {}),
  ])))
  const usedTaskIds = new Set(existing.tasks)
  const usedImageIds = new Set(existing.images)
  const usedCollectionIds = new Set(existing.collections)
  const usedConversationIds = new Set(existing.conversations.map((conversation) => conversation.id))
  const usedRoundIds = new Set(existing.conversations.flatMap((conversation) => conversation.rounds.map((round) => round.id)))
  const usedMessageIds = new Set(existing.conversations.flatMap((conversation) => conversation.messages.map((message) => message.id)))
  const taskIds = buildIdMap(importedTasks.map((task) => task.id), usedTaskIds)
  const mappedImageIds = buildIdMap(imageIds, usedImageIds)
  const collectionIds = buildIdMap(importedCollections.map((collection) => collection.id), usedCollectionIds)
  const conversationIds = buildIdMap(importedConversations.map((conversation) => conversation.id), usedConversationIds)
  const roundIds = buildIdMap(importedConversations.flatMap((conversation) => conversation.rounds.map((round) => round.id)), usedRoundIds)
  const messageIds = buildIdMap(importedConversations.flatMap((conversation) => conversation.messages.map((message) => message.id)), usedMessageIds)
  const allIds = new Map([...taskIds, ...mappedImageIds, ...collectionIds, ...conversationIds, ...roundIds, ...messageIds])
  const remapped = manifests.map((manifest): ExportData => ({
    ...manifest,
    tasks: manifest.tasks?.map((task) => remapValue(task, allIds)),
    favoriteCollections: manifest.favoriteCollections?.map((collection) => remapValue(collection, allIds)),
    defaultFavoriteCollectionId: manifest.defaultFavoriteCollectionId ? allIds.get(manifest.defaultFavoriteCollectionId) ?? manifest.defaultFavoriteCollectionId : manifest.defaultFavoriteCollectionId,
    agentConversations: manifest.agentConversations?.map((conversation) => remapValue(conversation, allIds)),
    imageFiles: manifest.imageFiles && Object.fromEntries(Object.entries(manifest.imageFiles).map(([id, info]) => [mappedImageIds.get(id) ?? id, info])),
    thumbnailFiles: manifest.thumbnailFiles && Object.fromEntries(Object.entries(manifest.thumbnailFiles).map(([id, info]) => [mappedImageIds.get(id) ?? id, info])),
  }))

  return {
    manifests: remapped,
    tasks: remapped.flatMap((manifest) => manifest.tasks ?? []),
    collections: remapped.flatMap((manifest) => manifest.favoriteCollections ?? []),
    conversations: remapped.flatMap((manifest) => manifest.agentConversations ?? []),
    defaultCollectionId: remapped.map((manifest) => manifest.defaultFavoriteCollectionId).find((id) => id != null),
    imageIds: mappedImageIds,
  }
}
