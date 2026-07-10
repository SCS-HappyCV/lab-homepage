import type { AppDatabase } from './db.js'
import type { StudentRecord, StudentStatus } from './types.js'

type StudentRow = Omit<StudentRecord, 'research' | 'achievements' | 'experiences'> & {
  research: string
  achievements: string
  experiences: string
}

const requiredTextFields: Array<keyof StudentRecord> = [
  'id',
  'name',
  'cohort',
]

export class StudentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StudentValidationError'
  }
}

export interface StudentRepository {
  list(): StudentRecord[]
  get(id: string): StudentRecord | null
  create(student: StudentRecord): StudentRecord
  update(id: string, student: StudentRecord): StudentRecord | null
  delete(id: string): boolean
}

export function createStudentRepository(db: AppDatabase): StudentRepository {
  return {
    list() {
      return db
        .prepare(
          `SELECT * FROM students
           ORDER BY cohort DESC, sortOrder ASC, name ASC`,
        )
        .all()
        .map((row) => fromRow(row as StudentRow))
    },

    get(id) {
      const row = db.prepare('SELECT * FROM students WHERE id = ?').get(id)
      return row ? fromRow(row as StudentRow) : null
    },

    create(student) {
      const normalized = normalizeStudent(student)
      const row = toRow(normalized)

      db.prepare(
        `INSERT INTO students (
          id, name, cohort, degree, status, research, email, phone, wechat,
          nativePlace, photo, destination, bio, achievements, experiences,
          sortOrder, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.id,
        row.name,
        row.cohort,
        row.degree,
        row.status,
        row.research,
        row.email,
        row.phone ?? '',
        row.wechat ?? '',
        row.nativePlace ?? '',
        row.photo ?? '',
        row.destination ?? '',
        row.bio,
        row.achievements,
        row.experiences,
        row.sortOrder,
        row.createdAt,
        row.updatedAt,
      )

      return normalized
    },

    update(id, student) {
      if (!exists(db, id)) return null

      const normalized = normalizeStudent({ ...student, id })
      const row = toRow(normalized)

      db.prepare(
        `UPDATE students SET
          name = ?, cohort = ?, degree = ?, status = ?, research = ?,
          email = ?, phone = ?, wechat = ?, nativePlace = ?, photo = ?,
          destination = ?, bio = ?, achievements = ?, experiences = ?,
          sortOrder = ?, createdAt = ?, updatedAt = ?
        WHERE id = ?`,
      ).run(
        row.name,
        row.cohort,
        row.degree,
        row.status,
        row.research,
        row.email,
        row.phone ?? '',
        row.wechat ?? '',
        row.nativePlace ?? '',
        row.photo ?? '',
        row.destination ?? '',
        row.bio,
        row.achievements,
        row.experiences,
        row.sortOrder,
        row.createdAt,
        new Date().toISOString(),
        id,
      )

      return fromRow(db.prepare('SELECT * FROM students WHERE id = ?').get(id) as StudentRow)
    },

    delete(id) {
      const result = db.prepare('DELETE FROM students WHERE id = ?').run(id)
      return result.changes > 0
    },
  }
}

function exists(db: AppDatabase, id: string) {
  return Boolean(db.prepare('SELECT id FROM students WHERE id = ?').get(id))
}

function normalizeStudent(student: StudentRecord): StudentRecord {
  for (const field of requiredTextFields) {
    const value = student[field]
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new StudentValidationError(`${String(field)} is required`)
    }
  }

  if (!isStudentStatus(student.status)) {
    throw new StudentValidationError('status must be current or alumni')
  }

  return {
    ...student,
    id: student.id.trim(),
    name: student.name.trim(),
    cohort: student.cohort.trim(),
    degree: student.degree.trim(),
    email: student.email.trim(),
    bio: student.bio.trim(),
    research: normalizeArray(student.research),
    achievements: normalizeArray(student.achievements),
    experiences: normalizeArray(student.experiences),
    sortOrder: Number.isFinite(student.sortOrder) ? student.sortOrder : 0,
    createdAt: student.createdAt || new Date().toISOString(),
    updatedAt: student.updatedAt || new Date().toISOString(),
  }
}

function isStudentStatus(value: string): value is StudentStatus {
  return value === 'current' || value === 'alumni'
}

function normalizeArray(value: string[]) {
  return Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean) : []
}

function toRow(student: StudentRecord): StudentRow {
  return {
    ...student,
    research: JSON.stringify(student.research),
    achievements: JSON.stringify(student.achievements),
    experiences: JSON.stringify(student.experiences),
  }
}

function fromRow(row: StudentRow): StudentRecord {
  return {
    ...row,
    research: parseArray(row.research),
    achievements: parseArray(row.achievements),
    experiences: parseArray(row.experiences),
  }
}

function parseArray(value: string) {
  const parsed = JSON.parse(value) as unknown
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
}
