import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/db.js'
import type { StudentRecord, StudentStatus } from '../src/types.js'

/**
 * SQLite 中 research/achievements/experiences 存储为 JSON 字符串，
 * 可空文本列为 string | null。
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
  coverPhoto: string | null
  destination: string | null
  advisor: string
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
      id: row.id,
      name: row.name,
      cohort: row.cohort,
      degree: row.degree,
      status: row.status as StudentStatus,
      email: row.email,
      // 将 SQLite 的 null 转为 undefined，JSON.stringify 会自动省略 undefined 字段
      phone: row.phone ?? undefined,
      wechat: row.wechat ?? undefined,
      nativePlace: row.nativePlace ?? undefined,
      photo: row.photo ?? undefined,
      coverPhoto: row.coverPhoto ?? undefined,
      destination: row.destination ?? undefined,
      advisor: row.advisor || '周维',
      bio: row.bio,
      research: safeParseJsonArray(row.research),
      achievements: safeParseJsonArray(row.achievements),
      experiences: safeParseJsonArray(row.experiences),
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))

    const outPath = fileURLToPath(new URL('../data/export-students.json', import.meta.url))
    writeFileSync(outPath, JSON.stringify(exportData, null, 2), 'utf-8')
    console.log(`Exported ${exportData.length} students to ${outPath}`)
  } finally {
    db.close()
  }
}

main()
