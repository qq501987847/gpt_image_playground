import type { AgentConversation, TaskRecord, StoredImage, StoredImageThumbnail } from '../types'
import { appRuntime, invokeDesktop, isDesktopRuntime, openAwaiDatabase } from './runtime'

const STORE_TASKS = 'tasks'
const STORE_IMAGES = 'images'
const STORE_THUMBNAILS = 'thumbnails'
const STORE_AGENT_CONVERSATIONS = 'agentConversations'
const THUMBNAIL_MAX_SIZE = 720
const THUMBNAIL_QUALITY = 0.9
const THUMBNAIL_VERSION = 2

export const CURRENT_THUMBNAIL_VERSION = THUMBNAIL_VERSION

type StoredImageIndex = Omit<StoredImage, 'dataUrl'>
type StoredThumbnailIndex = Omit<StoredImageThumbnail, 'thumbnailDataUrl'>

function imagePath(id: string) {
  return `images/${id}.original`
}

function thumbnailPath(id: string) {
  return `thumbnails/${id}.webp`
}

function openDB(): Promise<IDBDatabase> {
  return openAwaiDatabase()
}

function desktopRecord<T>(collection: string, id: string) {
  return invokeDesktop<string | null>('record_get', { collection, id }).then((value) => value ? JSON.parse(value) as T : undefined)
}

function desktopRecords<T>(collection: string) {
  return invokeDesktop<string[]>('record_list', { collection }).then((values) => values.map((value) => JSON.parse(value) as T))
}

function putDesktopRecord(collection: string, id: string, value: unknown) {
  return invokeDesktop<string>('record_put', { collection, id, value: JSON.stringify(value) })
}

function dbTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const req = fn(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

// ===== Tasks =====

export function getAllTasks(): Promise<TaskRecord[]> {
  if (isDesktopRuntime) return desktopRecords(STORE_TASKS)
  return dbTransaction(STORE_TASKS, 'readonly', (s) => s.getAll())
}

export function putTask(task: TaskRecord): Promise<IDBValidKey> {
  if (isDesktopRuntime) return putDesktopRecord(STORE_TASKS, task.id, task)
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.put(task))
}

export function deleteTask(id: string): Promise<undefined> {
  if (isDesktopRuntime) return invokeDesktop('record_delete', { collection: STORE_TASKS, id })
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.delete(id))
}

export function commitTaskDeletion(deletedTaskIds: string[], updatedTasks: TaskRecord[], updatedConversations: AgentConversation[]): Promise<undefined> {
  if (isDesktopRuntime) return invokeDesktop('records_commit_task_deletion', {
    deletedTaskIds,
    updatedTasks: updatedTasks.map((task) => JSON.stringify(task)),
    updatedConversations: updatedConversations.map((conversation) => JSON.stringify(conversation)),
  })
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_TASKS, STORE_AGENT_CONVERSATIONS], 'readwrite')
        const taskStore = tx.objectStore(STORE_TASKS)
        const conversationStore = tx.objectStore(STORE_AGENT_CONVERSATIONS)
        for (const id of deletedTaskIds) taskStore.delete(id)
        for (const task of updatedTasks) taskStore.put(task)
        for (const conversation of updatedConversations) conversationStore.put(conversation)
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export function clearTasks(): Promise<undefined> {
  if (isDesktopRuntime) return invokeDesktop('records_clear', { collection: STORE_TASKS })
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.clear())
}

// ===== Agent conversations =====

export function getAllAgentConversations(): Promise<AgentConversation[]> {
  if (isDesktopRuntime) return desktopRecords(STORE_AGENT_CONVERSATIONS)
  return dbTransaction(STORE_AGENT_CONVERSATIONS, 'readonly', (s) => s.getAll())
}

export function putAgentConversation(conversation: AgentConversation): Promise<IDBValidKey> {
  if (isDesktopRuntime) return putDesktopRecord(STORE_AGENT_CONVERSATIONS, conversation.id, conversation)
  return dbTransaction(STORE_AGENT_CONVERSATIONS, 'readwrite', (s) => s.put(conversation))
}

export function clearAgentConversations(): Promise<undefined> {
  if (isDesktopRuntime) return invokeDesktop('records_clear', { collection: STORE_AGENT_CONVERSATIONS })
  return dbTransaction(STORE_AGENT_CONVERSATIONS, 'readwrite', (s) => s.clear())
}

export function replaceAgentConversations(conversations: AgentConversation[]): Promise<undefined> {
  if (isDesktopRuntime) return invokeDesktop('records_replace', {
    collection: STORE_AGENT_CONVERSATIONS,
    records: conversations.map((conversation) => JSON.stringify(conversation)),
  })
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_AGENT_CONVERSATIONS, 'readwrite')
        const store = tx.objectStore(STORE_AGENT_CONVERSATIONS)
        store.clear()
        for (const conversation of conversations) store.put(conversation)
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

// ===== Images =====

export function getImage(id: string): Promise<StoredImage | undefined> {
  if (isDesktopRuntime) return desktopRecord<StoredImageIndex>(STORE_IMAGES, id).then(async (index) => {
    if (!index) return undefined
    const dataUrl = await appRuntime.files.read(imagePath(id))
    return dataUrl ? { ...index, dataUrl } : undefined
  })
  return dbTransaction<StoredImageIndex | undefined>(STORE_IMAGES, 'readonly', (s) => s.get(id)).then(async (index) => {
    if (!index) return undefined
    const dataUrl = await appRuntime.files.read(imagePath(id))
    return dataUrl ? { ...index, dataUrl } : undefined
  })
}

export function getStoredImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  if (isDesktopRuntime) return desktopRecord<StoredThumbnailIndex>(STORE_THUMBNAILS, id).then(async (index) => {
    if (!index) return undefined
    const thumbnailDataUrl = await appRuntime.files.read(thumbnailPath(id))
    return thumbnailDataUrl ? { ...index, thumbnailDataUrl } : undefined
  })
  return dbTransaction<StoredThumbnailIndex | undefined>(STORE_THUMBNAILS, 'readonly', (s) => s.get(id)).then(async (index) => {
    if (!index) return undefined
    const thumbnailDataUrl = await appRuntime.files.read(thumbnailPath(id))
    return thumbnailDataUrl ? { ...index, thumbnailDataUrl } : undefined
  })
}

export async function getStoredFreshImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  const thumbnail = await getStoredImageThumbnail(id)
  return thumbnail?.thumbnailVersion === THUMBNAIL_VERSION ? thumbnail : undefined
}

export function putImageThumbnail(thumbnail: StoredImageThumbnail): Promise<IDBValidKey> {
  const { thumbnailDataUrl, ...index } = thumbnail
  return appRuntime.files.write(thumbnailPath(thumbnail.id), thumbnailDataUrl).then(() =>
    isDesktopRuntime
      ? putDesktopRecord(STORE_THUMBNAILS, thumbnail.id, index)
      : dbTransaction(STORE_THUMBNAILS, 'readwrite', (s) => s.put(index)),
  )
}

export async function getImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  const existingThumbnail = await getStoredImageThumbnail(id)
  if (existingThumbnail?.thumbnailVersion === THUMBNAIL_VERSION) {
    const image = await getImage(id)
    if (image && (!image.width || !image.height) && existingThumbnail.width && existingThumbnail.height) {
      await putImage({ ...image, width: existingThumbnail.width, height: existingThumbnail.height })
    }
    return existingThumbnail
  }

  const image = await getImage(id)
  if (!image) return undefined
  const legacyImage = image as StoredImage & Partial<StoredImageThumbnail>
  if (legacyImage.thumbnailDataUrl && legacyImage.thumbnailVersion === THUMBNAIL_VERSION) {
    const thumbnail: StoredImageThumbnail = {
      id,
      thumbnailDataUrl: legacyImage.thumbnailDataUrl,
      width: legacyImage.width,
      height: legacyImage.height,
      thumbnailVersion: THUMBNAIL_VERSION,
    }
    await putImageThumbnail(thumbnail)
    if ((!image.width || !image.height) && thumbnail.width && thumbnail.height) {
      await putImage({ ...image, width: thumbnail.width, height: thumbnail.height })
    }
    return thumbnail
  }

  const metadata = await safeCreateImageThumbnail(image.dataUrl)
  if (!metadata.thumbnailDataUrl) return undefined
  const thumbnail: StoredImageThumbnail = {
    id,
    thumbnailDataUrl: metadata.thumbnailDataUrl,
    width: metadata.width,
    height: metadata.height,
    thumbnailVersion: THUMBNAIL_VERSION,
  }
  await putImageThumbnail(thumbnail)
  if (metadata.width && metadata.height && (image.width !== metadata.width || image.height !== metadata.height)) {
    await putImage({ ...image, width: metadata.width, height: metadata.height })
  }
  return thumbnail
}

export function getAllImages(): Promise<StoredImage[]> {
  if (isDesktopRuntime) return desktopRecords<StoredImageIndex>(STORE_IMAGES).then(async (indexes) => {
    const images = await Promise.all(indexes.map(async (index) => {
      const dataUrl = await appRuntime.files.read(imagePath(index.id))
      return dataUrl ? { ...index, dataUrl } : null
    }))
    return images.filter((image): image is StoredImage => image !== null)
  })
  return dbTransaction<StoredImageIndex[]>(STORE_IMAGES, 'readonly', (s) => s.getAll()).then(async (indexes) => {
    const images = await Promise.all(indexes.map(async (index) => {
      const dataUrl = await appRuntime.files.read(imagePath(index.id))
      return dataUrl ? { ...index, dataUrl } : null
    }))
    return images.filter((image): image is StoredImage => image !== null)
  })
}

export function getAllImageIds(): Promise<string[]> {
  if (isDesktopRuntime) return invokeDesktop('record_ids', { collection: STORE_IMAGES })
  return dbTransaction(STORE_IMAGES, 'readonly', (s) => s.getAllKeys()).then((keys) =>
    keys.map(String),
  )
}

export function putImage(image: StoredImage): Promise<IDBValidKey> {
  const { dataUrl, ...index } = image
  if (isDesktopRuntime) return invokeDesktop<string>('image_put', {
    id: image.id,
    dataUrl,
    metadata: JSON.stringify(index),
    source: image.source ?? 'upload',
  })
  return appRuntime.files.write(imagePath(image.id), dataUrl).then(() =>
    dbTransaction(STORE_IMAGES, 'readwrite', (s) => s.put(index)),
  )
}

export function deleteImage(id: string): Promise<undefined> {
  if (isDesktopRuntime) return invokeDesktop('image_delete', { id })
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_IMAGES, STORE_THUMBNAILS], 'readwrite')
        tx.objectStore(STORE_IMAGES).delete(id)
        tx.objectStore(STORE_THUMBNAILS).delete(id)
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
      }),
  ).then(async () => {
    await Promise.all([appRuntime.files.remove(imagePath(id)), appRuntime.files.remove(thumbnailPath(id))])
    return undefined
  })
}

export function clearImages(): Promise<undefined> {
  if (isDesktopRuntime) return invokeDesktop('images_clear')
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_IMAGES, STORE_THUMBNAILS], 'readwrite')
        tx.objectStore(STORE_IMAGES).clear()
        tx.objectStore(STORE_THUMBNAILS).clear()
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
      }),
  ).then(async () => {
    await appRuntime.files.clear()
    return undefined
  })
}

// ===== Image hashing & dedup =====

export async function hashDataUrl(dataUrl: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return hashDataUrlFallback(dataUrl)
  }

  const data = new TextEncoder().encode(dataUrl)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hashDataUrlFallback(dataUrl: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193

  for (let i = 0; i < dataUrl.length; i++) {
    const code = dataUrl.charCodeAt(i)
    h1 ^= code
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= code
    h2 = Math.imul(h2, 0x27d4eb2d)
  }

  return `fallback-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

export interface StoreImageResult {
  id: string
  width?: number
  height?: number
}

/**
 * 存储图片，若已存在（按 hash 去重）则跳过。
 * 返回 image id 及图片真实宽高。
 */
export async function storeImage(dataUrl: string, source: NonNullable<StoredImage['source']> = 'upload'): Promise<string> {
  return (await storeImageWithSize(dataUrl, source)).id
}

export async function storeImageWithSize(dataUrl: string, source: NonNullable<StoredImage['source']> = 'upload'): Promise<StoreImageResult> {
  const id = await hashDataUrl(dataUrl)
  const existing = await getImage(id)
  if (!existing) {
    const thumbnail = await safeCreateImageThumbnail(dataUrl)
    const index = {
      id,
      createdAt: Date.now(),
      source,
      width: thumbnail.width,
      height: thumbnail.height,
    }
    if (isDesktopRuntime) await invokeDesktop('image_put', { id, dataUrl, metadata: JSON.stringify(index), source })
    else {
      await appRuntime.files.write(imagePath(id), dataUrl)
      await dbTransaction(STORE_IMAGES, 'readwrite', (s) => s.put(index))
    }
    if (thumbnail.thumbnailDataUrl) await appRuntime.files.write(thumbnailPath(id), thumbnail.thumbnailDataUrl)
    if (thumbnail.thumbnailDataUrl) {
      const index = {
        id,
        width: thumbnail.width,
        height: thumbnail.height,
        thumbnailVersion: THUMBNAIL_VERSION,
      }
      if (isDesktopRuntime) await putDesktopRecord(STORE_THUMBNAILS, id, index)
      else await dbTransaction(STORE_THUMBNAILS, 'readwrite', (s) => s.put(index))
    }
    return { id, width: thumbnail.width, height: thumbnail.height }
  }

  if ((await getStoredImageThumbnail(id))?.thumbnailVersion !== THUMBNAIL_VERSION) {
    const thumbnail = await safeCreateImageThumbnail(existing.dataUrl)
    const width = thumbnail.width ?? existing.width
    const height = thumbnail.height ?? existing.height
    if (thumbnail.width && thumbnail.height && (existing.width !== thumbnail.width || existing.height !== thumbnail.height)) {
      await putImage({ ...existing, width: thumbnail.width, height: thumbnail.height })
    }
    if (thumbnail.thumbnailDataUrl) {
      await appRuntime.files.write(thumbnailPath(id), thumbnail.thumbnailDataUrl)
      const index = {
        id,
        width: thumbnail.width,
        height: thumbnail.height,
        thumbnailVersion: THUMBNAIL_VERSION,
      }
      if (isDesktopRuntime) await putDesktopRecord(STORE_THUMBNAILS, id, index)
      else await dbTransaction(STORE_THUMBNAILS, 'readwrite', (s) => s.put(index))
    }
    return { id, width, height }
  }
  return { id, width: existing.width, height: existing.height }
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = dataUrl
  })
}

async function createImageThumbnail(dataUrl: string): Promise<Omit<StoredImageThumbnail, 'id'>> {
  const image = await loadImage(dataUrl)
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width <= 0 || height <= 0) throw new Error('图片尺寸无效')

  const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 Canvas')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  return {
    thumbnailDataUrl: canvas.toDataURL('image/webp', THUMBNAIL_QUALITY),
    width,
    height,
    thumbnailVersion: THUMBNAIL_VERSION,
  }
}

async function safeCreateImageThumbnail(dataUrl: string): Promise<Partial<Omit<StoredImageThumbnail, 'id'>>> {
  try {
    return await createImageThumbnail(dataUrl)
  } catch {
    return {}
  }
}
