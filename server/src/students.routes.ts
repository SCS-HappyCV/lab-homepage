import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
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

const TEMP_URL_PREFIX = '/uploads/students/_temp/'
const STAGING_DIRNAME = '_temp'
type PhotoKind = 'avatar' | 'cover'

export function createStudentRouter({ repo, authService, uploadDir }: StudentRouterDeps) {
  const router = Router()
  const adminOnly = requireAdmin(authService)
  const stagingDir = path.join(uploadDir, STAGING_DIRNAME)

  // 配置 multer：原始上传文件先落到暂存目录，压缩后再移动到最终路径
  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await ensureDirectory(stagingDir)
        cb(null, stagingDir)
      } catch (error) {
        cb(error as Error, '')
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
      const timestamp = Date.now()
      const random = Math.random().toString(16).slice(2, 8)
      cb(null, `raw-${timestamp}-${random}${ext}`)
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

  // 临时上传：仅压缩并存入暂存目录，不写库；保存成员时再移动到最终路径
  router.post('/students/temp-photo', adminOnly, upload.single('photo'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: '请选择要上传的照片' })
      return
    }

    const kind = parsePhotoKind(req.body?.kind)
    if (!kind) {
      await fs.unlink(req.file.path).catch(() => {})
      res.status(400).json({ error: '无效的图片类型' })
      return
    }

    const token = crypto.randomBytes(16).toString('hex')
    const filename = `${token}-${kind}.jpg`
    const finalPath = path.join(stagingDir, filename)

    try {
      const result = await compressImage(req.file.path, finalPath)
      await fs.unlink(req.file.path).catch(() => {})

      const photoUrl = `${TEMP_URL_PREFIX}${filename}`
      res.json({
        photo: photoUrl,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        saved: result.saved,
      })
    } catch (error) {
      await fs.unlink(req.file.path).catch(() => {})
      await fs.unlink(finalPath).catch(() => {})
      console.error('Temp photo upload error:', error)
      res.status(500).json({ error: '照片上传失败' })
    }
  })

  router.post('/students', adminOnly, async (req, res) => {
    try {
      const incoming = withDefaults(req.body)
      // 先落库以触发校验与唯一性约束，通过后再把暂存文件移动到最终路径
      const created = repo.create(incoming)

      try {
        const avatar = await commitPhotoField(created.photo ?? '', undefined, 'avatar', created.cohort, created.id, uploadDir)
        const cover = await commitPhotoField(created.coverPhoto ?? '', undefined, 'cover', created.cohort, created.id, uploadDir)

        let finalRecord = created
        if (avatar.finalUrl !== (created.photo ?? '') || cover.finalUrl !== (created.coverPhoto ?? '')) {
          finalRecord = repo.update(created.id, { ...created, photo: avatar.finalUrl, coverPhoto: cover.finalUrl }) ?? created
        }

        res.status(201).json(finalRecord)
      } catch (commitError) {
        // 文件移动或二次写库失败：回滚刚创建的记录，清理已移动的最终文件
        repo.delete(created.id)
        console.error('Student photo commit error:', commitError)
        res.status(500).json({ error: '保存成员图片失败' })
      }
    } catch (error) {
      handleWriteError(error, res)
    }
  })

  router.put('/students/:id', adminOnly, async (req, res) => {
    const id = String(req.params.id)
    const existing = repo.get(id)
    if (!existing) {
      res.status(404).json({ error: 'Student not found' })
      return
    }

    try {
      const incoming = withDefaults(req.body, id)
      // 先写库（触发校验），通过后再提交图片文件
      const saved = repo.update(id, incoming)
      if (!saved) {
        res.status(404).json({ error: 'Student not found' })
        return
      }

      try {
        const avatar = await commitPhotoField(saved.photo ?? '', existing.photo, 'avatar', saved.cohort, id, uploadDir)
        const cover = await commitPhotoField(saved.coverPhoto ?? '', existing.coverPhoto, 'cover', saved.cohort, id, uploadDir)

        let finalSaved = saved
        if (avatar.finalUrl !== (saved.photo ?? '') || cover.finalUrl !== (saved.coverPhoto ?? '')) {
          finalSaved = repo.update(id, { ...saved, photo: avatar.finalUrl, coverPhoto: cover.finalUrl }) ?? saved
        }

        // 数据库更新成功后，清理被替换/移除的旧图片文件
        await Promise.all(
          [...avatar.staleUrls, ...cover.staleUrls].map((url) => deleteUploadedPhoto(url, uploadDir)),
        )

        res.json(finalSaved)
      } catch (commitError) {
        // 文件移动或二次写库失败：回滚到编辑前的数据，避免记录指向不存在的临时文件
        repo.update(id, existing)
        console.error('Student photo commit error:', commitError)
        res.status(500).json({ error: '保存成员图片失败' })
      }
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

  // 集中处理 multer 中间件抛出的上传错误（文件超限、类型不支持等）
  router.use(handleUploadError)

  return router
}

function parsePhotoKind(value: unknown): PhotoKind | null {
  return value === 'avatar' || value === 'cover' ? value : null
}

interface PhotoCommit {
  finalUrl: string
  staleUrls: string[]
}

/**
 * 将单个图片字段提交到最终位置：
 * - 若新值是暂存 URL，把暂存文件移动到 <cohort>/<id>-<kind>.jpg 并返回最终 URL；
 * - 否则原值透传（空串表示移除、外链保持不变）；
 * - 收集需要在数据库写入成功后删除的旧文件 URL（与新值不同的旧地址）。
 */
async function commitPhotoField(
  newUrl: string,
  oldUrl: string | undefined,
  kind: PhotoKind,
  cohort: string,
  id: string,
  uploadDir: string,
): Promise<PhotoCommit> {
  if (newUrl.startsWith(TEMP_URL_PREFIX)) {
    const tempPath = resolveUploadedPhotoPath(newUrl, uploadDir)
    if (tempPath) {
      const relativePath = generatePhotoPath(cohort, id, kind)
      const finalPath = path.join(uploadDir, relativePath)
      await ensureDirectory(path.dirname(finalPath))
      await moveFile(tempPath, finalPath)
      const finalUrl = `/uploads/students/${relativePath.replace(/\\/g, '/')}`
      return { finalUrl, staleUrls: collectStale(oldUrl, finalUrl) }
    }
  }

  return { finalUrl: newUrl, staleUrls: collectStale(oldUrl, newUrl) }
}

function collectStale(oldUrl: string | undefined, newUrl: string): string[] {
  return oldUrl && oldUrl !== newUrl ? [oldUrl] : []
}

async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    await fs.copyFile(src, dest)
    await fs.unlink(src)
  }
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
    birthDate: String(input.birthDate ?? ''),
    photo: String(input.photo ?? ''),
    coverPhoto: String(input.coverPhoto ?? ''),
    destination: String(input.destination ?? ''),
    advisor: normalizeAdvisor(input.advisor),
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

function normalizeAdvisor(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return '周维'
}

function normalizeStatus(value: unknown): StudentRecord['status'] {
  if (value === 'current' || value === 'alumni') return value
  return value as StudentRecord['status']
}

function handleWriteError(error: unknown, res: Response): void {
  if (error instanceof StudentValidationError) {
    res.status(400).json({ error: error.message })
    return
  }

  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
    res.status(409).json({ error: 'Student id already exists' })
    return
  }

  console.error('Student write error:', error)
  if (!res.headersSent) {
    res.status(500).json({ error: '保存失败' })
  }
}

function handleUploadError(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: '文件大小超过限制（最大 5MB）' })
    return
  }

  if (error instanceof Error && error.message.includes('不支持的文件类型')) {
    res.status(400).json({ error: error.message })
    return
  }

  next(error)
}
