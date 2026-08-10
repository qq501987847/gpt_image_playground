import { Pool, type QueryResultRow } from 'pg'

import type { AssetFile, AssetRecord, AssetRepository } from './types.js'

interface AssetRow extends QueryResultRow {
  id: string
  source_origin: string
  user_id: string
  task_id: string
  original_key: string
  original_bytes: string
  original_media_type: string
  thumbnail_key: string | null
  thumbnail_bytes: string | null
  thumbnail_media_type: string | null
  status: 'initialized' | 'available'
  created_at: Date
  updated_at: Date
  confirmed_at: Date | null
  expires_at: Date
}

function fromRow(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    sourceOrigin: row.source_origin,
    userId: row.user_id,
    taskId: row.task_id,
    original: { kind: 'original', objectKey: row.original_key, bytes: Number(row.original_bytes), mediaType: row.original_media_type },
    thumbnail: row.thumbnail_key && row.thumbnail_bytes && row.thumbnail_media_type
      ? { kind: 'thumbnail', objectKey: row.thumbnail_key, bytes: Number(row.thumbnail_bytes), mediaType: row.thumbnail_media_type }
      : undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at ?? undefined,
    expiresAt: row.expires_at,
  }
}

const COLUMNS = `id, source_origin, user_id, task_id, original_key, original_bytes, original_media_type,
  thumbnail_key, thumbnail_bytes, thumbnail_media_type, status, created_at, updated_at, confirmed_at, expires_at`

export class PostgresAssetRepository implements AssetRepository {
  constructor(private pool: Pool) {}

  async create(record: AssetRecord) {
    await this.pool.query(
      `INSERT INTO temporary_assets (${COLUMNS}) VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [record.id, record.sourceOrigin, record.userId, record.taskId, record.original.objectKey, record.original.bytes,
        record.original.mediaType, record.thumbnail?.objectKey ?? null, record.thumbnail?.bytes ?? null,
        record.thumbnail?.mediaType ?? null, record.status, record.createdAt, record.updatedAt,
        record.confirmedAt ?? null, record.expiresAt],
    )
  }

  async getOwned(id: string, sourceOrigin: string, userId: string) {
    const result = await this.pool.query<AssetRow>(
      `SELECT ${COLUMNS} FROM temporary_assets WHERE id = $1 AND source_origin = $2 AND user_id = $3`,
      [id, sourceOrigin, userId],
    )
    return result.rows[0] ? fromRow(result.rows[0]) : null
  }

  async listOwned(sourceOrigin: string, userId: string, now: Date) {
    const result = await this.pool.query<AssetRow>(
      `SELECT ${COLUMNS} FROM temporary_assets
       WHERE source_origin = $1 AND user_id = $2 AND status = 'available' AND expires_at > $3
       ORDER BY created_at DESC`,
      [sourceOrigin, userId, now],
    )
    return result.rows.map(fromRow)
  }

  async getConfirmedBytes(sourceOrigin: string, userId: string, now: Date) {
    const result = await this.pool.query<{ bytes: string }>(
      `SELECT COALESCE(SUM(original_bytes + COALESCE(thumbnail_bytes, 0)), 0)::text AS bytes
       FROM temporary_assets WHERE source_origin = $1 AND user_id = $2 AND status = 'available' AND expires_at > $3`,
      [sourceOrigin, userId, now],
    )
    return Number(result.rows[0]?.bytes ?? 0)
  }

  async markAvailable(id: string, files: AssetFile[], confirmedAt: Date) {
    const original = files.find((file) => file.kind === 'original')!
    const thumbnail = files.find((file) => file.kind === 'thumbnail')
    const result = await this.pool.query<AssetRow>(
      `UPDATE temporary_assets SET status = 'available', original_key = $2, original_bytes = $3, original_media_type = $4,
       thumbnail_key = $5, thumbnail_bytes = $6, thumbnail_media_type = $7, confirmed_at = $8, updated_at = $8
       WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, original.objectKey, original.bytes, original.mediaType, thumbnail?.objectKey ?? null,
        thumbnail?.bytes ?? null, thumbnail?.mediaType ?? null, confirmedAt],
    )
    if (!result.rows[0]) throw new Error('云端记录不存在')
    return fromRow(result.rows[0])
  }

  async remove(id: string) {
    await this.pool.query('DELETE FROM temporary_assets WHERE id = $1', [id])
  }

  async listForCleanup(now: Date, abandonedBefore: Date) {
    const result = await this.pool.query<AssetRow>(
      `SELECT ${COLUMNS} FROM temporary_assets
       WHERE expires_at <= $1 OR (status = 'initialized' AND created_at <= $2)`,
      [now, abandonedBefore],
    )
    return result.rows.map(fromRow)
  }

  async withUserLock<T>(sourceOrigin: string, userId: string, action: () => Promise<T>) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [sourceOrigin, userId])
      const result = await action()
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}
