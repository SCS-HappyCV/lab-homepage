import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

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
      photo TEXT,
      destination TEXT,
      bio TEXT NOT NULL,
      achievements TEXT NOT NULL,
      experiences TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)
}
