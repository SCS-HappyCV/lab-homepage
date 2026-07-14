/**
 * 专利文件仓库
 */
import type { AppDatabase } from '../../db.js'
import type { PatentFileRecord } from '../types.js'

export interface CreateFileInput {
  id: string
  originalName: string
  storedName: string
  storagePath: string
  mimeType: string
  fileSize: number
  sha256: string
  uploadedBy: string
}

export class PatentFileRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  /**
   * 创建文件记录
   */
  create(input: CreateFileInput): PatentFileRecord {
    const now = new Date().toISOString()
    const stmt = this.db.prepare(`
      INSERT INTO patent_files (id, original_name, stored_name, storage_path, mime_type, file_size, sha256, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      input.id,
      input.originalName,
      input.storedName,
      input.storagePath,
      input.mimeType,
      input.fileSize,
      input.sha256,
      input.uploadedBy,
      now
    )
    return this.get(input.id)!
  }

  /**
   * 获取文件记录
   */
  get(id: string): PatentFileRecord | null {
    const row = this.db.prepare('SELECT * FROM patent_files WHERE id = ? AND deleted_at IS NULL').get(id) as any
    if (!row) return null
    return this.mapRow(row)
  }

  /**
   * 通过SHA-256查找文件
   */
  findBySHA256(sha256: string): PatentFileRecord | null {
    const row = this.db.prepare('SELECT * FROM patent_files WHERE sha256 = ? AND deleted_at IS NULL').get(sha256) as any
    if (!row) return null
    return this.mapRow(row)
  }

  /**
   * 软删除文件
   */
  softDelete(id: string): boolean {
    const result = this.db.prepare(`
      UPDATE patent_files SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL
    `).run(id)
    return result.changes > 0
  }

  /**
   * 硬删除文件
   */
  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM patent_files WHERE id = ?').run(id)
    return result.changes > 0
  }

  /**
   * 获取用户上传的文件列表
   */
  listByUser(userId: string, limit = 50): PatentFileRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM patent_files
      WHERE uploaded_by = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit) as any[]

    return rows.map(row => this.mapRow(row))
  }

  /**
   * 映射数据库行到记录
   */
  private mapRow(row: any): PatentFileRecord {
    return {
      id: row.id,
      originalName: row.original_name,
      storedName: row.stored_name,
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      sha256: row.sha256,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
    }
  }
}

/**
 * 创建专利文件仓库实例
 */
export function createPatentFileRepository(db: AppDatabase): PatentFileRepository {
  return new PatentFileRepository(db)
}
