import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createStudentRepository, StudentValidationError } from '../src/students.repo.js'
import { initDatabase } from '../src/db.js'
import type { StudentRecord } from '../src/types.js'

function createTestRepo() {
  const db = new DatabaseSync(':memory:')
  initDatabase(db)
  return createStudentRepository(db)
}

function sampleStudent(overrides: Partial<StudentRecord> = {}): StudentRecord {
  const now = '2026-07-09T00:00:00.000Z'

  return {
    id: '2026-zhang-san',
    name: 'Zhang San',
    cohort: '2026',
    degree: 'Master',
    status: 'current',
    research: ['Computer Vision'],
    email: 'zhangsan@example.com',
    phone: '',
    wechat: '',
    nativePlace: '',
    photo: '',
    destination: '',
    advisor: '周维',
    bio: 'Researches computer vision.',
    achievements: ['Paper draft'],
    experiences: ['2026 joined lab'],
    sortOrder: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

test('repository creates and lists students sorted by cohort and sort order', () => {
  const repo = createTestRepo()

  repo.create(sampleStudent({ id: '2025-b', cohort: '2025', sortOrder: 2 }))
  repo.create(sampleStudent({ id: '2026-a', cohort: '2026', sortOrder: 1 }))

  const students = repo.list()

  assert.deepEqual(
    students.map((student) => student.id),
    ['2026-a', '2025-b'],
  )
  assert.deepEqual(students[0].research, ['Computer Vision'])
  assert.deepEqual(students[0].achievements, ['Paper draft'])
})

test('repository updates and deletes students by id', () => {
  const repo = createTestRepo()
  repo.create(sampleStudent({ id: '2026-a' }))

  const updated = repo.update('2026-a', sampleStudent({ id: '2026-a', name: 'Updated Name', research: ['AI'] }))
  assert.equal(updated.name, 'Updated Name')
  assert.deepEqual(updated.research, ['AI'])

  assert.equal(repo.delete('2026-a'), true)
  assert.deepEqual(repo.list(), [])
})

test('repository rejects records with missing required fields', () => {
  const repo = createTestRepo()
  const invalid = sampleStudent({ id: '' })

  assert.throws(() => repo.create(invalid), StudentValidationError)
})

test('repository returns null when updating an unknown student', () => {
  const repo = createTestRepo()

  assert.equal(repo.update('missing', sampleStudent({ id: 'missing' })), null)
})

test('repository stores empty advisor when missing or blank', () => {
  const repo = createTestRepo()

  const missing = repo.create(sampleStudent({ id: '2026-missing', advisor: undefined as unknown as string }))
  assert.equal(missing.advisor, '')

  const blank = repo.create(sampleStudent({ id: '2026-blank', advisor: '   ' }))
  assert.equal(blank.advisor, '')
})

test('repository persists an explicitly provided advisor', () => {
  const repo = createTestRepo()

  const created = repo.create(sampleStudent({ id: '2026-adv', advisor: '李老师' }))
  assert.equal(created.advisor, '李老师')

  const fetched = repo.get('2026-adv')
  assert.equal(fetched?.advisor, '李老师')

  const updated = repo.update('2026-adv', sampleStudent({ id: '2026-adv', advisor: '王老师' }))
  assert.equal(updated?.advisor, '王老师')
})
