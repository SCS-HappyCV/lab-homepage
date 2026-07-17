import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { requireAdmin, type AuthService } from './auth.js'
import { StudentValidationError, type StudentRepository } from './students.repo.js'
import type { StudentRecord } from './types.js'
import { compressImage, ensureDirectory, generatePhotoPath } from './image-utils.js'

export interface StudentRouterDeps {
  repo: StudentRepository
  authService: AuthService
  uploadDir: string
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export function createStudentRouter({ repo, authService, uploadDir }: StudentRouterDeps) {
  const router = Router()
  const adminOnly = requireAdmin(authService)

  // 配置 multer
  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await ensureDirectory(uploadDir)
        cb(null, uploadDir)
      } catch (error) {
        cb(error as Error, '')
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
      const timestamp = Date.now()
      const random = Math.random().toString(16).slice(2, 8)
      cb(null, `temp-${timestamp}-${random}${ext}`)
    },
  })

  const upload = multer({
    storage,
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(null, true)
      } else {
        cb(new Error('不支持的文件类型，请上传 jpg、png 或 webp 格式的图片'))
      }
    },
  })

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

  // 照片上传接口（头像）
  router.post('/students/:id/photo', adminOnly, upload.single('photo'), async (req, res) => {
    const id = String(req.params.id)

    if (!req.file) {
      res.status(400).json({ error: '请选择要上传的照片' })
      return
    }

    try {
      // 获取学生信息
      const student = repo.get(id)
      if (!student) {
        res.status(404).json({ error: 'Student not found' })
        return
      }

      // 记录旧照片路径，用于后续清理
      const oldPhotoUrl = student.photo

      // 生成最终文件路径
      const relativePath = generatePhotoPath(student.cohort, id, 'avatar')
      const finalDir = path.join(uploadDir, student.cohort)
      const finalPath = path.join(uploadDir, relativePath)

      // 确保目录存在
      await ensureDirectory(finalDir)

      // 压缩图片
      const result = await compressImage(req.file.path, finalPath)

      // 删除临时文件
      const fs = await import('node:fs/promises')
      await fs.unlink(req.file.path).catch(() => {})

      // 更新学生的 photo 字段
      const photoUrl = `/uploads/students/${relativePath.replace(/\\/g, '/')}`
      const updated = repo.update(id, { ...student, photo: photoUrl })

      // 上传成功后，删除旧照片文件（如果路径与新照片不同）
      if (updated && oldPhotoUrl && oldPhotoUrl !== photoUrl) {
        await deleteUploadedPhoto(oldPhotoUrl, uploadDir)
      }

      if (!updated) {
        res.status(500).json({ error: '更新学生照片失败' })
        return
      }

      res.json({
        photo: photoUrl,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        saved: result.saved,
      })
    } catch (error) {
      // 清理临时文件
      const fs = await import('node:fs/promises')
      await fs.unlink(req.file.path).catch(() => {})

      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: '文件大小超过限制（最大 5MB）' })
          return
        }
      }

      console.error('Photo upload error:', error)
      res.status(500).json({ error: '照片上传失败' })
    }
  })

  // 背景图上传接口
  router.post('/students/:id/cover-photo', adminOnly, upload.single('photo'), async (req, res) => {
    const id = String(req.params.id)

    if (!req.file) {
      res.status(400).json({ error: '请选择要上传的照片' })
      return
    }

    try {
      const student = repo.get(id)
      if (!student) {
        res.status(404).json({ error: 'Student not found' })
        return
      }

      const oldCoverUrl = student.coverPhoto

      const relativePath = generatePhotoPath(student.cohort, id, 'cover')
      const finalDir = path.join(uploadDir, student.cohort)
      const finalPath = path.join(uploadDir, relativePath)

      await ensureDirectory(finalDir)
      const result = await compressImage(req.file.path, finalPath)

      const fs = await import('node:fs/promises')
      await fs.unlink(req.file.path).catch(() => {})

      const photoUrl = `/uploads/students/${relativePath.replace(/\\/g, '/')}`
      const updated = repo.update(id, { ...student, coverPhoto: photoUrl })

      if (updated && oldCoverUrl && oldCoverUrl !== photoUrl) {
        await deleteUploadedPhoto(oldCoverUrl, uploadDir)
      }

      if (!updated) {
        res.status(500).json({ error: '更新背景图失败' })
        return
      }

      res.json({
        photo: photoUrl,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        saved: result.saved,
      })
    } catch (error) {
      const fs = await import('node:fs/promises')
      await fs.unlink(req.file.path).catch(() => {})

      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: '文件大小超过限制（最大 5MB）' })
          return
        }
      }

      console.error('Cover photo upload error:', error)
      res.status(500).json({ error: '背景图上传失败' })
    }
  })

  return router
}

function resolveUploadedPhotoPath(photoUrl: string, uploadDir: string): string | null {
  const prefix = '/uploads/students/'
  if (!photoUrl.startsWith(prefix)) return null

  const relativePath = photoUrl.slice(prefix.length)
  return path.join(uploadDir, relativePath)
}

async function deleteUploadedPhoto(photoUrl: string, uploadDir: string): Promise<void> {
  const diskPath = resolveUploadedPhotoPath(photoUrl, uploadDir)
  if (!diskPath) return

  try {
    await fs.unlink(diskPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Failed to delete old photo:', error)
    }
  }
}

function withDefaults(input: Partial<StudentRecord>, forcedId?: string): StudentRecord {
  const now = new Date().toISOString()

  return {
    id: forcedId ?? String(input.id ?? ''),
    name: String(input.name ?? ''),
    cohort: String(input.cohort ?? ''),
    degree: String(input.degree ?? ''),
    status: normalizeStatus(input.status),
    research: asStringArray(input.research),
    email: String(input.email ?? ''),
    phone: String(input.phone ?? ''),
    wechat: String(input.wechat ?? ''),
    nativePlace: String(input.nativePlace ?? ''),
    photo: String(input.photo ?? ''),
    coverPhoto: String(input.coverPhoto ?? ''),
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
