/**
 * 简化的专利仓库
 * 只包含核心字段：专利名称、发明人、专利类型、专利号
 */
import type { AppDatabase } from '../db.js'
import { v4 as uuidv4 } from 'uuid'

export interface SimplePatent {
  id: string
  patent_name: string
  patent_number: string
  inventors: string[]  // 发明人数组
  patent_type: string  // '发明' | '实用新型' | '外观设计'
  file_id: string | null
  created_at: string
  updated_at: string
}

export interface CreatePatentInput {
  patent_name: string
  patent_number: string
  inventors: string[]
  patent_type: string
  file_id?: string
}

export class SimplePatentRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  /**
   * 创建专利
   */
  create(input: CreatePatentInput): SimplePatent {
    const id = `pat_${uuidv4()}`
    const now = new Date().toISOString()
    const inventorsJson = JSON.stringify(input.inventors)

    this.db.prepare(`
      INSERT INTO patents_simple (id, patent_name, patent_number, inventors, patent_type, file_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.patent_name,
      input.patent_number,
      inventorsJson,
      input.patent_type,
      input.file_id || null,
      now,
      now
    )

    return this.get(id)!
  }

  /**
   * 获取专利
   */
  get(id: string): SimplePatent | null {
    const row = this.db.prepare('SELECT * FROM patents_simple WHERE id = ?').get(id) as any
    if (!row) return null
    return this.mapRow(row)
  }

  /**
   * 通过专利号查找
   */
  findByPatentNumber(patentNumber: string): SimplePatent | null {
    const row = this.db.prepare('SELECT * FROM patents_simple WHERE patent_number = ?').get(patentNumber) as any
    if (!row) return null
    return this.mapRow(row)
  }

  /**
   * 获取所有专利
   */
  list(limit = 100, offset = 0): SimplePatent[] {
    const rows = this.db.prepare(`
      SELECT * FROM patents_simple
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[]

    return rows.map(row => this.mapRow(row))
  }

  /**
   * 获取总数
   */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM patents_simple').get() as any
    return row.count
  }

  /**
   * 更新专利
   */
  update(id: string, input: Partial<CreatePatentInput>): SimplePatent | null {
    const existing = this.get(id)
    if (!existing) return null

    const updates: string[] = []
    const values: any[] = []

    if (input.patent_name !== undefined) {
      updates.push('patent_name = ?')
      values.push(input.patent_name)
    }
    if (input.patent_number !== undefined) {
      updates.push('patent_number = ?')
      values.push(input.patent_number)
    }
    if (input.inventors !== undefined) {
      updates.push('inventors = ?')
      values.push(JSON.stringify(input.inventors))
    }
    if (input.patent_type !== undefined) {
      updates.push('patent_type = ?')
      values.push(input.patent_type)
    }

    if (updates.length === 0) return existing

    updates.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    const sql = `UPDATE patents_simple SET ${updates.join(', ')} WHERE id = ?`
    this.db.prepare(sql).run(...values)

    return this.get(id)
  }

  /**
   * 删除专利
   */
  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM patents_simple WHERE id = ?').run(id)
    return result.changes > 0
  }

  /**
   * 映射数据库行到对象
   */
  private mapRow(row: any): SimplePatent {
    return {
      id: row.id,
      patent_name: row.patent_name,
      patent_number: row.patent_number,
      inventors: this.parseInventors(row.inventors),
      patent_type: row.patent_type,
      file_id: row.file_id || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  /**
   * 解析发明人JSON
   */
  private parseInventors(value: string): string[] {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
}

/**
 * 创建简单专利仓库实例
 */
export function createSimplePatentRepository(db: AppDatabase): SimplePatentRepository {
  return new SimplePatentRepository(db)
}
