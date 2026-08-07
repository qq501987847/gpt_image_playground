export type AssetKind = 'original' | 'thumbnail'
export type AssetStatus = 'initialized' | 'available'

export interface AssetFile {
  kind: AssetKind
  objectKey: string
  bytes: number
  mediaType: string
}

export interface AssetRecord {
  id: string
  sourceOrigin: string
  userId: string
  taskId: string
  original: AssetFile
  thumbnail?: AssetFile
  status: AssetStatus
  createdAt: Date
  updatedAt: Date
  confirmedAt?: Date
  expiresAt: Date
}

export interface AssetRepository {
  create: (record: AssetRecord) => Promise<void>
  getOwned: (id: string, sourceOrigin: string, userId: string) => Promise<AssetRecord | null>
  listOwned: (sourceOrigin: string, userId: string, now: Date) => Promise<AssetRecord[]>
  getConfirmedBytes: (sourceOrigin: string, userId: string, now: Date) => Promise<number>
  markAvailable: (id: string, files: AssetFile[], confirmedAt: Date) => Promise<AssetRecord>
  remove: (id: string) => Promise<void>
  listForCleanup: (now: Date, abandonedBefore: Date) => Promise<AssetRecord[]>
  withUserLock: <T>(sourceOrigin: string, userId: string, action: () => Promise<T>) => Promise<T>
}

export interface ObjectStore {
  createUploadUrl: (file: AssetFile, validSeconds: number) => Promise<string>
  createDownloadUrl: (file: AssetFile, validSeconds: number) => Promise<string>
  stat: (objectKey: string) => Promise<{ bytes: number; mediaType: string } | null>
  remove: (objectKeys: string[]) => Promise<void>
}

export interface IdentityVerifier {
  verify: (sourceOrigin: string, token: string) => Promise<{ userId: string }>
}

export interface AssetIdentity {
  sourceOrigin: string
  userId: string
}
