import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { migratePatentTables } from './patent/migration.js'

export type AppDatabase = DatabaseSync

export function openDatabase(sqlitePath: string): AppDatabase {
  if (sqlitePath !== ':memory:') {
    mkdirSync(dirname(sqlitePath), { recursive: true })
  }

  const db = new DatabaseSync(sqlitePath)
  initDatabase(db)
  return db
}

export function initDatabase(db: AppDatabase) {
  // node:sqlite 默认关闭外键约束，需显式开启以启用 ON DELETE CASCADE
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cohort TEXT NOT NULL,
      degree TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('current', 'alumni')),
      research TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      wechat TEXT,
      nativePlace TEXT,
      birthDate TEXT,
      photo TEXT,
      coverPhoto TEXT,
      destination TEXT,
      advisor TEXT NOT NULL DEFAULT '周维',
      bio TEXT NOT NULL,
      achievements TEXT NOT NULL,
      experiences TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  // 为已有数据库添加 birthDate 列（兼容旧数据库）
  try {
    db.exec(`ALTER TABLE students ADD COLUMN birthDate TEXT`)
  } catch {
    // 列已存在，忽略错误
  }

  // 为已有数据库添加 coverPhoto 列（兼容旧数据库）
  try {
    db.exec(`ALTER TABLE students ADD COLUMN coverPhoto TEXT`)
  } catch {
    // 列已存在，忽略错误
  }

  // 为已有数据库添加 advisor 列（导师，默认"周维"）
  try {
    db.exec(`ALTER TABLE students ADD COLUMN advisor TEXT NOT NULL DEFAULT '周维'`)
  } catch {
    // 列已存在，忽略错误
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS albums (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      year        TEXT NOT NULL,
      date        TEXT NOT NULL DEFAULT '',
      location    TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      categories  TEXT NOT NULL DEFAULT '[]',
      coverUrl    TEXT NOT NULL DEFAULT '',
      coverThumb  TEXT NOT NULL DEFAULT '',
      featured    INTEGER NOT NULL DEFAULT 0,
      sortOrder   INTEGER NOT NULL DEFAULT 0,
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS photos (
      id         TEXT PRIMARY KEY,
      albumId    TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      imageUrl   TEXT NOT NULL,
      thumbUrl   TEXT NOT NULL,
      caption    TEXT NOT NULL DEFAULT '',
      sortOrder  INTEGER NOT NULL DEFAULT 0,
      createdAt  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_photos_album ON photos(albumId, sortOrder);
  `)

  // 执行专利模块迁移（创建 patents_simple 等表）
  migratePatentTables(db)
}
