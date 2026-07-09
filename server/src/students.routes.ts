import { Router } from 'express'
import { requireAdmin, type AuthService } from './auth.js'
import { StudentValidationError, type StudentRepository } from './students.repo.js'
import type { StudentRecord } from './types.js'

export interface StudentRouterDeps {
  repo: StudentRepository
  authService: AuthService
}

export function createStudentRouter({ repo, authService }: StudentRouterDeps) {
  const router = Router()
  const adminOnly = requireAdmin(authService)

  router.get('/students', (_req, res) => {
    res.json(repo.list())
  })

  router.post('/students', adminOnly, (req, res) => {
    try {
      const created = repo.create(withDefaults(req.body))
      res.status(201).json(created)
    } catch (error) {
      handleWriteError(error, res)
    }
  })

  router.put('/students/:id', adminOnly, (req, res) => {
    const id = String(req.params.id)
    try {
      const updated = repo.update(id, withDefaults(req.body, id))
      if (!updated) {
        res.status(404).json({ error: 'Student not found' })
        return
      }

      res.json(updated)
    } catch (error) {
      handleWriteError(error, res)
    }
  })

  router.delete('/students/:id', adminOnly, (req, res) => {
    const id = String(req.params.id)
    if (!repo.delete(id)) {
      res.status(404).json({ error: 'Student not found' })
      return
    }

    res.status(204).send()
  })

  return router
}

function withDefaults(input: Partial<StudentRecord>, forcedId?: string): StudentRecord {
  const now = new Date().toISOString()

  return {
    id: forcedId ?? String(input.id ?? ''),
    name: String(input.name ?? ''),
    cohort: String(input.cohort ?? ''),
    degree: String(input.degree ?? ''),
    role: String(input.role ?? ''),
    status: normalizeStatus(input.status),
    research: asStringArray(input.research),
    email: String(input.email ?? ''),
    phone: String(input.phone ?? ''),
    wechat: String(input.wechat ?? ''),
    nativePlace: String(input.nativePlace ?? ''),
    photo: String(input.photo ?? ''),
    destination: String(input.destination ?? ''),
    bio: String(input.bio ?? ''),
    achievements: asStringArray(input.achievements),
    experiences: asStringArray(input.experiences),
    sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
    createdAt: String(input.createdAt ?? now),
    updatedAt: now,
  }
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function normalizeStatus(value: unknown): StudentRecord['status'] {
  if (value === 'current' || value === 'alumni') return value
  return value as StudentRecord['status']
}

function handleWriteError(error: unknown, res: import('express').Response) {
  if (error instanceof StudentValidationError) {
    res.status(400).json({ error: error.message })
    return
  }

  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
    res.status(409).json({ error: 'Student id already exists' })
    return
  }

  throw error
}
