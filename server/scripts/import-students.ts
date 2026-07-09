import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadConfig } from '../src/config.js'
import { openDatabase, type AppDatabase } from '../src/db.js'
import { createStudentRepository } from '../src/students.repo.js'
import type { StudentRecord } from '../src/types.js'

interface ImportOptions {
  db: AppDatabase
  projectRoot: string
}

interface FrontendStudent {
  id: string
  name: string
  cohort: string
  degree: string
  role: string
  status: 'current' | 'alumni'
  research: string[]
  email: string
  phone?: string
  wechat?: string
  nativePlace?: string
  photo?: string
  destination?: string
  bio: string
  achievements: string[]
  experiences: string[]
}

export async function importStudentsFromFrontend({ db, projectRoot }: ImportOptions) {
  const repo = createStudentRepository(db)
  const existingIds = new Set(repo.list().map((student) => student.id))
  const modulesDir = resolve(projectRoot, 'src/data/students/years')
  const files = readdirSync(modulesDir)
    .filter((file) => file.endsWith('.ts'))
    .sort((a, b) => b.localeCompare(a))

  let imported = 0

  for (const file of files) {
    const moduleUrl = pathToFileURL(join(modulesDir, file)).href
    const module = (await import(moduleUrl)) as { default: FrontendStudent[] }

    module.default.forEach((student, index) => {
      const record = toRecord(student, index)
      if (existingIds.has(record.id)) {
        repo.update(record.id, record)
      } else {
        repo.create(record)
        existingIds.add(record.id)
      }
      imported += 1
    })
  }

  return imported
}

function toRecord(student: FrontendStudent, sortOrder: number): StudentRecord {
  const now = new Date().toISOString()

  return {
    id: student.id,
    name: student.name,
    cohort: student.cohort,
    degree: student.degree,
    role: student.role,
    status: student.status,
    research: student.research ?? [],
    email: student.email,
    phone: student.phone ?? '',
    wechat: student.wechat ?? '',
    nativePlace: student.nativePlace ?? '',
    photo: student.photo ?? '',
    destination: student.destination ?? '',
    bio: student.bio,
    achievements: student.achievements ?? [],
    experiences: student.experiences ?? [],
    sortOrder,
    createdAt: now,
    updatedAt: now,
  }
}

async function main() {
  const config = loadConfig()
  const db = openDatabase(config.sqlitePath)
  const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
  const imported = await importStudentsFromFrontend({ db, projectRoot })
  console.log(`Imported ${imported} students into ${config.sqlitePath}`)
}

const isMainModule = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false

if (isMainModule) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
