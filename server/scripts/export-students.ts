import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/db.js'
import type { StudentRecord } from '../src/types.js'

function main() {
  const config = loadConfig()
  const db = openDatabase(config.sqlitePath)

  const rows = db.prepare('SELECT * FROM students ORDER BY sortOrder').all() as StudentRecord[]
  db.close()

  const exportData = rows.map((row) => ({
    ...row,
    research: JSON.parse(row.research as unknown as string) as string[],
    achievements: JSON.parse(row.achievements as unknown as string) as string[],
    experiences: JSON.parse(row.experiences as unknown as string) as string[],
  }))

  const outPath = fileURLToPath(new URL('../data/export-students.json', import.meta.url))
  writeFileSync(outPath, JSON.stringify(exportData, null, 2), 'utf-8')
  console.log(`Exported ${exportData.length} students to ${outPath}`)
}

main()
