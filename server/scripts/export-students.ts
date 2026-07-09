import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/db.js'
import type { StudentRecord } from '../src/types.js'

/**
 * SQLite 中 storage/research/achievements/experiences 存储为 JSON 字符串。
 * 该接口反映 SELECT * 返回的原始行形状，避免双重类型断言。
 */
interface StudentRow {
  id: string
  name: string
  cohort: string
  degree: string
  status: string
  research: string
  email: string
  phone: string | null
  wechat: string | null
  nativePlace: string | null
  photo: string | null
  destination: string | null
  bio: string
  achievements: string
  experiences: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** 安全解析 JSON 字符串为字符串数组 */
function safeParseJsonArray(raw: string): string[] {
  if (!raw || raw.trim().length === 0) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.warn(`Expected a JSON array but got ${typeof parsed}, treating as empty array`)
      return []
    }
    return parsed as string[]
  } catch (err) {
    console.warn(`Failed to parse JSON, treating as empty array: ${(err as Error).message}`)
    return []
  }
}

function main() {
  const config = loadConfig()
  const db = openDatabase(config.sqlitePath)

  try {
    const rows = db.prepare('SELECT * FROM students ORDER BY sortOrder').all() as unknown as StudentRow[]

    const exportData: StudentRecord[] = rows.map((row) => ({
      ...row,
      research: safeParseJsonArray(row.research),
      achievements: safeParseJsonArray(row.achievements),
      experiences: safeParseJsonArray(row.experiences),
    }))

    const outPath = fileURLToPath(new URL('../data/export-students.json', import.meta.url))
    writeFileSync(outPath, JSON.stringify(exportData, null, 2), 'utf-8')
    console.log(`Exported ${exportData.length} students to ${outPath}`)
  } finally {
    db.close()
  }
}

main()
