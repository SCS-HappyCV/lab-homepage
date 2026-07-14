/**
 * 专利识别模块数据库迁移
 */
import type { AppDatabase } from '../db.js'

export function migratePatentTables(db: AppDatabase) {
  // 1. 简化的专利表（只包含核心字段）
  db.exec(`
    CREATE TABLE IF NOT EXISTS patents_simple (
      id TEXT PRIMARY KEY,
      patent_name TEXT NOT NULL,
      patent_number TEXT NOT NULL UNIQUE,
      inventors TEXT NOT NULL,
      patent_type TEXT NOT NULL,
      file_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // 2. 专利文件表
  db.exec(`
    CREATE TABLE IF NOT EXISTS patent_files (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    )
  `)

  // 为sha256建立索引
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_patent_files_sha256 ON patent_files(sha256)`)
  } catch {
    // 索引已存在，忽略
  }

  // 3. 识别任务表
  db.exec(`
    CREATE TABLE IF NOT EXISTS patent_recognitions (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      text_extraction_status TEXT NOT NULL DEFAULT 'PENDING',
      ocr_status TEXT NOT NULL DEFAULT 'PENDING',
      llm_status TEXT NOT NULL DEFAULT 'PENDING',
      raw_text TEXT,
      normalized_text TEXT,
      rule_result TEXT,
      llm_result TEXT,
      merged_result TEXT,
      needs_manual_review INTEGER NOT NULL DEFAULT 1,
      error_code TEXT,
      error_message TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT,
      FOREIGN KEY (file_id) REFERENCES patent_files(id)
    )
  `)

  // 为识别任务表建立索引
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_patent_recognitions_file_id ON patent_recognitions(file_id)`)
  } catch {
    // 索引已存在，忽略
  }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_patent_recognitions_status ON patent_recognitions(status)`)
  } catch {
    // 索引已存在，忽略
  }

  console.log('Patent tables migration completed')
}
