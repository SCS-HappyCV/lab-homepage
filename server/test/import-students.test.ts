import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { importStudentsFromFrontend } from '../scripts/import-students.js'
import { createStudentRepository } from '../src/students.repo.js'
import { initDatabase } from '../src/db.js'

test('import script loads existing frontend student records into sqlite', async () => {
  const db = new DatabaseSync(':memory:')
  initDatabase(db)

  const imported = await importStudentsFromFrontend({
    db,
    projectRoot: fileURLToPath(new URL('../..', import.meta.url)),
  })

  const students = createStudentRepository(db).list()
  assert.ok(imported > 0)
  assert.equal(students.length, imported)
  assert.ok(students[0].id)
})
