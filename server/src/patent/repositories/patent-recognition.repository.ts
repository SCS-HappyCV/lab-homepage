/**
 * 专利识别任务仓库
 */
import type { AppDatabase } from '../../db.js'
import type {
  PatentRecognitionRecord,
  RecognitionStatus,
  TextExtractionStatus,
  OcrStatus,
  LlmStatus,
  RuleResult,
  LlmResult,
  MergedResult,
} from '../types.js'

export interface CreateRecognitionInput {
  id: string
  fileId: string
  createdBy: string
}

export interface UpdateRecognitionInput {
  status?: RecognitionStatus
  textExtractionStatus?: TextExtractionStatus
  ocrStatus?: OcrStatus
  llmStatus?: LlmStatus
  rawText?: string | null
  normalizedText?: string | null
  ruleResult?: RuleResult | null
  llmResult?: LlmResult | null
  mergedResult?: MergedResult | null
  needsManualReview?: boolean
  errorCode?: string | null
  errorMessage?: string | null
}

export class PatentRecognitionRepository {
  private db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  /**
   * 创建识别任务
   */
  create(input: CreateRecognitionInput): PatentRecognitionRecord {
    const now = new Date().toISOString()
    const stmt = this.db.prepare(`
      INSERT INTO patent_recognitions (id, file_id, status, text_extraction_status, ocr_status, llm_status, needs_manual_review, created_by, created_at, updated_at)
      VALUES (?, ?, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 1, ?, ?, ?)
    `)
    stmt.run(input.id, input.fileId, input.createdBy, now, now)
    return this.get(input.id)!
  }

  /**
   * 获取识别任务
   */
  get(id: string): PatentRecognitionRecord | null {
    const row = this.db.prepare('SELECT * FROM patent_recognitions WHERE id = ?').get(id) as any
    if (!row) return null
    return this.mapRow(row)
  }

  /**
   * 获取识别任务（包含文件信息）
   */
  getWithFile(id: string): (PatentRecognitionRecord & { fileName?: string; fileSize?: number }) | null {
    const row = this.db.prepare(`
      SELECT pr.*, pf.original_name as fileName, pf.file_size as fileSize
      FROM patent_recognitions pr
      LEFT JOIN patent_files pf ON pr.file_id = pf.id
      WHERE pr.id = ?
    `).get(id) as any
    if (!row) return null
    return this.mapRow(row)
  }

  /**
   * 更新识别任务
   */
  update(id: string, input: UpdateRecognitionInput): PatentRecognitionRecord | null {
    const existing = this.get(id)
    if (!existing) return null

    const updates: string[] = []
    const values: any[] = []

    if (input.status !== undefined) {
      updates.push('status = ?')
      values.push(input.status)
    }
    if (input.textExtractionStatus !== undefined) {
      updates.push('text_extraction_status = ?')
      values.push(input.textExtractionStatus)
    }
    if (input.ocrStatus !== undefined) {
      updates.push('ocr_status = ?')
      values.push(input.ocrStatus)
    }
    if (input.llmStatus !== undefined) {
      updates.push('llm_status = ?')
      values.push(input.llmStatus)
    }
    if (input.rawText !== undefined) {
      updates.push('raw_text = ?')
      values.push(input.rawText)
    }
    if (input.normalizedText !== undefined) {
      updates.push('normalized_text = ?')
      values.push(input.normalizedText)
    }
    if (input.ruleResult !== undefined) {
      updates.push('rule_result = ?')
      values.push(JSON.stringify(input.ruleResult))
    }
    if (input.llmResult !== undefined) {
      updates.push('llm_result = ?')
      values.push(JSON.stringify(input.llmResult))
    }
    if (input.mergedResult !== undefined) {
      updates.push('merged_result = ?')
      values.push(JSON.stringify(input.mergedResult))
    }
    if (input.needsManualReview !== undefined) {
      updates.push('needs_manual_review = ?')
      values.push(input.needsManualReview ? 1 : 0)
    }
    if (input.errorCode !== undefined) {
      updates.push('error_code = ?')
      values.push(input.errorCode)
    }
    if (input.errorMessage !== undefined) {
      updates.push('error_message = ?')
      values.push(input.errorMessage)
    }

    if (updates.length === 0) return existing

    updates.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    const sql = `UPDATE patent_recognitions SET ${updates.join(', ')} WHERE id = ?`
    this.db.prepare(sql).run(...values)

    return this.get(id)
  }

  /**
   * 确认识别任务
   */
  confirm(id: string): PatentRecognitionRecord | null {
    return this.update(id, {
      status: 'CONFIRMED',
    })
  }

  /**
   * 取消识别任务
   */
  cancel(id: string): PatentRecognitionRecord | null {
    return this.update(id, {
      status: 'CANCELLED',
    })
  }

  /**
   * 删除识别任务
   */
  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM patent_recognitions WHERE id = ?').run(id)
    return result.changes > 0
  }

  /**
   * 获取用户的识别任务列表
   */
  listByUser(userId: string, limit = 50): PatentRecognitionRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM patent_recognitions
      WHERE created_by = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit) as any[]

    return rows.map(row => this.mapRow(row))
  }

  /**
   * 获取待处理的识别任务
   */
  listPending(limit = 100): PatentRecognitionRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM patent_recognitions
      WHERE status IN ('PENDING', 'PROCESSING')
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit) as any[]

    return rows.map(row => this.mapRow(row))
  }

  /**
   * 映射数据库行到记录
   */
  private mapRow(row: any): PatentRecognitionRecord {
    return {
      id: row.id,
      fileId: row.file_id,
      status: row.status,
      textExtractionStatus: row.text_extraction_status,
      ocrStatus: row.ocr_status,
      llmStatus: row.llm_status,
      rawText: row.raw_text,
      normalizedText: row.normalized_text,
      ruleResult: row.rule_result ? JSON.parse(row.rule_result) : null,
      llmResult: row.llm_result ? JSON.parse(row.llm_result) : null,
      mergedResult: row.merged_result ? JSON.parse(row.merged_result) : null,
      needsManualReview: row.needs_manual_review === 1,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      confirmedAt: row.confirmed_at,
    }
  }
}

/**
 * 创建识别任务仓库实例
 */
export function createPatentRecognitionRepository(db: AppDatabase): PatentRecognitionRepository {
  return new PatentRecognitionRepository(db)
}
