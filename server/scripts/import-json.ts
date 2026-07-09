import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/db.js'
import { createStudentRepository } from '../src/students.repo.js'
import type { StudentRecord } from '../src/types.js'

function main() {
  const config = loadConfig()
  const db = openDatabase(config.sqlitePath)
  const repo = createStudentRepository(db)

  const jsonPath = fileURLToPath(new URL('../data/export-students.json', import.meta.url))
  const data = JSON.parse(readFileSync(jsonPath, 'utf-8')) as StudentRecord[]

  let count = 0
  for (const record of data) {
    repo.create(record)
    count++
  }

  db.close()
  console.log(`Imported ${count} students from ${jsonPath}`)
}

main()
