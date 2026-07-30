import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { initDatabase } from '../src/db.js'
import { createStudentRepository } from '../src/students.repo.js'
import type { StudentRecord } from '../src/types.js'

function sampleStudent(overrides: Partial<StudentRecord> = {}): StudentRecord {
  const now = '2026-07-30T00:00:00.000Z'

  return {
    id: '2026-legacy',
    name: 'Legacy Student',
    cohort: '2026',
    degree: 'Master',
    status: 'current',
    research: ['AI'],
    email: 'legacy@example.com',
    phone: '',
    wechat: '',
    nativePlace: '',
    birthDate: '2000-01-01',
    photo: '',
    coverPhoto: '',
    destination: '',
    bio: 'Legacy student with birthDate.',
    achievements: [],
    experiences: [],
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

test('initDatabase adds birthDate column to legacy students table', () => {
  const db = new DatabaseSync(':memory:')

  // Simulate legacy schema created before birthDate was introduced
  db.exec(`
    CREATE TABLE students (
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

  initDatabase(db)

  const repo = createStudentRepository(db)
  repo.create(sampleStudent())

  const student = repo.get('2026-legacy')
  assert.equal(student?.birthDate, '2000-01-01')
})
