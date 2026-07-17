import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/db.js'
import { createStudentRepository } from '../src/students.repo.js'
import type { StudentRecord } from '../src/types.js'

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
const publicStudentsDir = join(projectRoot, 'public', 'students')

interface PhotoFile {
  cohort: string
  filename: string
  fullPath: string
}

function collectPhotoFiles(directory: string): PhotoFile[] {
  const files: PhotoFile[] = []

  if (!existsSync(directory)) {
    return files
  }

  for (const cohort of readdirSync(directory)) {
    const cohortDir = join(directory, cohort)
    const stat = statSync(cohortDir)
    if (!stat.isDirectory()) continue

    for (const filename of readdirSync(cohortDir)) {
      const fullPath = join(cohortDir, filename)
      if (statSync(fullPath).isFile()) {
        files.push({ cohort, filename, fullPath })
      }
    }
  }

  return files
}

function findStudentForPhoto(students: StudentRecord[], filename: string): StudentRecord | undefined {
  return students.find(
    (student) =>
      (student.photo && student.photo.includes(filename)) ||
      (student.coverPhoto && student.coverPhoto.includes(filename)),
  )
}

function determinePhotoField(student: StudentRecord, filename: string): 'photo' | 'coverPhoto' | null {
  if (student.coverPhoto && student.coverPhoto.includes(filename)) return 'coverPhoto'
  if (student.photo && student.photo.includes(filename)) return 'photo'
  return null
}

async function main() {
  const config = loadConfig()
  const db = openDatabase(config.sqlitePath)
  const repo = createStudentRepository(db)

  const files = collectPhotoFiles(publicStudentsDir)

  if (files.length === 0) {
    console.log('public/students/ 下没有需要迁移的照片')
    return
  }

  const students = repo.list()
  let migrated = 0

  for (const file of files) {
    const student = findStudentForPhoto(students, file.filename)
    if (!student) {
      console.warn(`未找到使用 ${file.cohort}/${file.filename} 的成员，跳过`)
      continue
    }

    const field = determinePhotoField(student, file.filename)
    if (!field) {
      console.warn(`无法确定 ${file.cohort}/${file.filename} 对应的照片类型，跳过`)
      continue
    }

    const uploadCohortDir = join(config.uploadDir, file.cohort)
    if (!existsSync(uploadCohortDir)) {
      mkdirSync(uploadCohortDir, { recursive: true })
    }

    const destPath = join(uploadCohortDir, file.filename)
    copyFileSync(file.fullPath, destPath)

    const newUrl = `/uploads/students/${file.cohort}/${file.filename}`
    repo.update(student.id, { ...student, [field]: newUrl })

    console.log(`已迁移 ${student.id} (${student.name}): ${file.cohort}/${file.filename} -> ${newUrl}`)
    migrated += 1
  }

  console.log(`迁移完成：${migrated}/${files.length} 个文件`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
