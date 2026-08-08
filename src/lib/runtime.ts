import { blobToDataUrl } from './dataUrl'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

export const AWAI_DB_NAME = 'awai-creative-workbench'
export const AWAI_DB_VERSION = 1

const STORE_NAMES = ['tasks', 'images', 'thumbnails', 'agentConversations', 'settings']
const memoryMetadata = new Map<string, string>()

export type RuntimeMode = 'online' | 'desktop'

export interface RuntimeContract {
  mode: RuntimeMode
  authentication: {
    getSessionToken: () => string | null
  }
  credentials: {
    get: (id: string) => Promise<string | null>
    set: (id: string, value: string) => Promise<void>
  }
  metadata: {
    getItem: (key: string) => Promise<string | null>
    setItem: (key: string, value: string) => Promise<void>
    removeItem: (key: string) => Promise<void>
  }
  files: {
    read: (path: string) => Promise<string | null>
    write: (path: string, dataUrl: string) => Promise<void>
    remove: (path: string) => Promise<void>
    clear: () => Promise<void>
  }
  downloads: {
    save: (blob: Blob, name: string) => Promise<void>
  }
}

export interface DesktopLibraryStatus {
  initialized: boolean
  path: string | null
  suggestedPath: string
  unavailablePath: string | null
}

export interface DesktopCredential {
  id: string
  label: string
  available: boolean
}

export const isDesktopRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function invokeDesktop<T>(command: string, args?: Record<string, unknown>) {
  return invoke<T>(command, args)
}

export function stripCredentialPlaintext(value: string) {
  try {
    const parsed = JSON.parse(value)
    const visit = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(visit)
      if (!input || typeof input !== 'object') return input
      return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, key === 'apiKey' ? '' : visit(item)]))
    }
    return JSON.stringify(visit(parsed))
  } catch {
    return value
  }
}

export function openAwaiDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AWAI_DB_NAME, AWAI_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of STORE_NAMES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getFileHandle(path: string, create = false) {
  if (!navigator.storage?.getDirectory) throw new Error('当前浏览器不支持 OPFS 文件存储')
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop()
  if (!name) throw new Error('文件路径无效')
  let dir = await navigator.storage.getDirectory()
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create })
  return dir.getFileHandle(name, { create })
}

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s)
  if (!match) throw new Error('图片数据无效')
  const mime = match[1] || 'application/octet-stream'
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: mime })
}

async function getMetadata(id: string) {
  if (typeof indexedDB === 'undefined') return memoryMetadata.get(id) ?? null
  const db = await openAwaiDatabase()
  return new Promise<string | null>((resolve, reject) => {
    const request = db.transaction('settings', 'readonly').objectStore('settings').get(id)
    request.onsuccess = () => resolve(typeof request.result?.value === 'string' ? request.result.value : null)
    request.onerror = () => reject(request.error)
  })
}

async function setMetadata(id: string, value: string) {
  if (typeof indexedDB === 'undefined') {
    memoryMetadata.set(id, value)
    return
  }
  const db = await openAwaiDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('settings', 'readwrite')
    transaction.objectStore('settings').put({ id, value })
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

async function removeMetadata(id: string) {
  if (typeof indexedDB === 'undefined') {
    memoryMetadata.delete(id)
    return
  }
  const db = await openAwaiDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('settings', 'readwrite')
    transaction.objectStore('settings').delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

export const browserRuntime: RuntimeContract = {
  mode: 'online',
  authentication: {
    getSessionToken: () => sessionStorage.getItem('awai-session-token'),
  },
  credentials: {
    get: async () => null,
    set: async () => {},
  },
  metadata: {
    getItem: getMetadata,
    setItem: setMetadata,
    removeItem: removeMetadata,
  },
  files: {
    read: async (path) => {
      try {
        const file = await (await getFileHandle(path)).getFile()
        return blobToDataUrl(file)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') return null
        throw error
      }
    },
    write: async (path, dataUrl) => {
      const handle = await getFileHandle(path, true)
      const writer = await handle.createWritable()
      try {
        await writer.write(dataUrlToBlob(dataUrl))
        await writer.close()
      } catch (error) {
        await writer.abort()
        throw error
      }
    },
    remove: async (path) => {
      try {
        const parts = path.split('/').filter(Boolean)
        const name = parts.pop()
        if (!name || !navigator.storage?.getDirectory) return
        let dir = await navigator.storage.getDirectory()
        for (const part of parts) dir = await dir.getDirectoryHandle(part)
        await dir.removeEntry(name)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
      }
    },
    clear: async () => {
      if (!navigator.storage?.getDirectory) return
      const root = await navigator.storage.getDirectory()
      await Promise.all(['images', 'thumbnails'].map(async (name) => {
        try {
          await root.removeEntry(name, { recursive: true })
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
        }
      }))
    },
  },
  downloads: {
    save: async (blob, name) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    },
  },
}

export const desktopRuntime: RuntimeContract = {
  mode: 'desktop',
  authentication: {
    getSessionToken: () => null,
  },
  credentials: {
    get: (id) => invokeDesktop<string | null>('credential_get', { id }),
    set: (id, value) => invokeDesktop('credential_set', { id, value }),
  },
  metadata: {
    getItem: (key) => invokeDesktop<string | null>('metadata_get', { key }),
    setItem: (key, value) => invokeDesktop('metadata_set', { key, value: stripCredentialPlaintext(value) }),
    removeItem: (key) => invokeDesktop('metadata_remove', { key }),
  },
  files: {
    read: (path) => invokeDesktop<string | null>('file_read', { path }),
    write: (path, dataUrl) => invokeDesktop('file_write', { path, dataUrl }),
    remove: (path) => invokeDesktop('file_remove', { path }),
    clear: () => invokeDesktop('files_clear'),
  },
  downloads: {
    save: async (blob, name) => {
      const path = await save({ defaultPath: name })
      if (!path) return
      const dataUrl = await blobToDataUrl(blob)
      await invokeDesktop('download_write', { path, dataUrl })
    },
  },
}

export const appRuntime = isDesktopRuntime ? desktopRuntime : browserRuntime

export function getDesktopLibraryStatus() {
  return invokeDesktop<DesktopLibraryStatus>('library_status')
}

export function initializeDesktopLibrary(path: string) {
  return invokeDesktop<DesktopLibraryStatus>('library_initialize', { path })
}

export function reconnectDesktopLibrary() {
  return invokeDesktop<DesktopLibraryStatus>('library_reconnect')
}

export function relocateDesktopLibrary(path: string) {
  return invokeDesktop<DesktopLibraryStatus>('library_relocate', { path })
}

export function migrateDesktopLibrary(path: string) {
  return invokeDesktop<DesktopLibraryStatus>('library_migrate', { path })
}

export function listDesktopCredentials() {
  return invokeDesktop<DesktopCredential[]>('credential_list')
}

export async function createDesktopCredential(label: string, value: string) {
  return invokeDesktop<DesktopCredential>('credential_create', { label, value })
}

export async function hasLowBrowserStorage() {
  if (!navigator.storage?.estimate) return false
  const estimate = await navigator.storage.estimate()
  const remaining = (estimate.quota ?? 0) - (estimate.usage ?? 0)
  return remaining > 0 && remaining < 100 * 1024 * 1024
}
