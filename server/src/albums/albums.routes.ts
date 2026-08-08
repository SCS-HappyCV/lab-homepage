import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { requireAdmin, type AuthService } from '../auth.js'
import {
  compressImage,
  ensureDirectory,
  generateAlbumCoverPath,
  generateAlbumPhotoPath,
  generateThumbnail,
  slugifyImageName,
  thumbnailPathFor,
} from '../image-utils.js'
import { AlbumValidationError, type AlbumRepository } from './albums.repo.js'
import type { AlbumInput } from './types.js'

export interface AlbumRouterDeps {
  repo: AlbumRepository
  authService: AuthService
  albumUploadDir: string
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_PHOTOS_PER_BATCH = 30
const URL_PREFIX = '/uploads/albums/'

export function createAlbumRouter({ repo, authService, albumUploadDir }: AlbumRouterDeps) {
  const router = Router()
  const adminOnly = requireAdmin(authService)

  function safeAlbumDir(id: string): string | null {
    const sid = String(id ?? '')
    if (!/^[a-zA-Z0-9_-]+$/.test(sid)) return null
    return path.join(albumUploadDir, sid)
  }

  const storage = multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        const albumDir = safeAlbumDir(String(req.params.id ?? ''))
        if (albumDir === null) {
          cb(new Error('相册 ID 非法'), '')
          return
        }
        await ensureDirectory(albumDir)
        cb(null, albumDir)
      } catch (error) {
        cb(error as Error, '')
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
      cb(null, `raw-${Date.now()}-${Math.random().toString(16).slice(2, 8)}${ext}`)
    },
  })

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true)
      else cb(new Error('不支持的文件类型，请上传 jpg、png 或 webp 格式的图片'))
    },
  })

  // 公开读
  router.get('/albums', (_req, res) => {
    res.json(repo.list())
  })

  router.get('/albums/:id', (req, res) => {
    if (!safeAlbumDir(String(req.params.id))) {
      res.status(400).json({ error: '相册 ID 非法' })
      return
    }
    const album = repo.get(String(req.params.id))
    if (!album) {
      res.status(404).json({ error: 'Album not found' })
      return
    }
    res.json(album)
  })

  // 建相册（后端生成 id）
  router.post('/albums', adminOnly, (req, res) => {
    try {
      const input = parseAlbumInput(req.body)
      const id = generateAlbumId(input.title, (candidate) => !repo.get(candidate))
      const album = repo.create(id, input)
      res.status(201).json(album)
    } catch (error) {
      handleWriteError(error, res)
    }
  })

  // 改元数据
  router.put('/albums/:id', adminOnly, (req, res) => {
    if (!safeAlbumDir(String(req.params.id))) {
      res.status(400).json({ error: '相册 ID 非法' })
      return
    }
    try {
      const id = String(req.params.id)
      const updated = repo.update(id, parseAlbumInput(req.body))
      if (!updated) {
        res.status(404).json({ error: 'Album not found' })
        return
      }
      res.json(updated)
    } catch (error) {
      handleWriteError(error, res)
    }
  })

  // 删相册：DB 级联删照片，再删整个目录
  router.delete('/albums/:id', adminOnly, async (req, res) => {
    if (!safeAlbumDir(String(req.params.id))) {
      res.status(400).json({ error: '相册 ID 非法' })
      return
    }
    const id = String(req.params.id)
    if (!repo.delete(id)) {
      res.status(404).json({ error: 'Album not found' })
      return
    }
    try {
      await fs.rm(path.join(albumUploadDir, id), { recursive: true, force: true })
    } catch (error) {
      // DB 已清，目录删除失败不阻塞响应
      console.error('Failed to remove album directory:', error)
    }
    res.status(204).send()
  })

  // 批量上传照片
  router.post('/albums/:id/photos', adminOnly, upload.array('photos', MAX_PHOTOS_PER_BATCH), async (req, res) => {
    const id = String(req.params.id)
    if (!safeAlbumDir(id)) {
      await cleanupRawFiles(req.files as Express.Multer.File[] | undefined)
      res.status(400).json({ error: '相册 ID 非法' })
      return
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    const album = repo.get(id)
    if (!album) {
      await cleanupRawFiles(files)
      res.status(404).json({ error: 'Album not found' })
      return
    }
    if (files.length === 0) {
      res.status(400).json({ error: '请选择要上传的照片' })
      return
    }

    const created: Array<{ imageUrl: string; thumbUrl: string; caption?: string }> = []
    const produced: string[] = [] // 已生成的最终文件绝对路径，用于失败回滚

    try {
      for (const file of files) {
        const imageRel = generateAlbumPhotoPath(id, file.originalname)
        const thumbRel = thumbnailPathFor(imageRel)
        const imageAbs = path.join(albumUploadDir, imageRel)
        const thumbAbs = path.join(albumUploadDir, thumbRel)

        // 先把两个目标路径登记下来，这样任一后续步骤抛异常时 catch 都能清理到
        produced.push(imageAbs, thumbAbs)
        await ensureDirectory(path.dirname(imageAbs))
        await compressImage(file.path, imageAbs)
        await generateThumbnail(imageAbs, thumbAbs)
        await fs.unlink(file.path).catch(() => {})

        created.push({
          imageUrl: toAlbumUrl(imageRel),
          thumbUrl: toAlbumUrl(thumbRel),
        })
      }

      const photos = repo.addPhotos(id, created)
      res.status(201).json({ photos })
    } catch (error) {
      // 回滚：删除本次已生成的文件；addPhotos 内部已用事务保证 DB 原子性
      await Promise.all(produced.map((p) => fs.rm(p, { recursive: true, force: true }).catch(() => {})))
      await cleanupRawFiles(files)
      console.error('Album photo upload error:', error)
      res.status(500).json({ error: '照片上传失败' })
    }
  })

  // 照片排序
  router.put('/albums/:id/photos/reorder', adminOnly, (req, res) => {
    if (!safeAlbumDir(String(req.params.id))) {
      res.status(400).json({ error: '相册 ID 非法' })
      return
    }
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.filter((x: unknown): x is string => typeof x === 'string')
      : []
    const ok = repo.reorderPhotos(String(req.params.id), orderedIds)
    if (!ok) {
      res.status(400).json({ error: '排序数据与相册照片不匹配' })
      return
    }
    res.json({ ok: true })
  })

  // 换封面
  router.post('/albums/:id/cover', adminOnly, upload.single('photo'), async (req, res) => {
    const id = String(req.params.id)
    if (!safeAlbumDir(id)) {
      await cleanupRawFiles(req.file ? [req.file] : [])
      res.status(400).json({ error: '相册 ID 非法' })
      return
    }
    const album = repo.get(id)
    if (!album) {
      await cleanupRawFiles(req.file ? [req.file] : [])
      res.status(404).json({ error: 'Album not found' })
      return
    }
    if (!req.file) {
      res.status(400).json({ error: '请选择要上传的封面' })
      return
    }

    const coverRel = generateAlbumCoverPath(id)
    const thumbRel = thumbnailPathFor(coverRel)
    const coverAbs = path.join(albumUploadDir, coverRel)
    const thumbAbs = path.join(albumUploadDir, thumbRel)

    try {
      await ensureDirectory(path.dirname(coverAbs))
      await compressImage(req.file.path, coverAbs)
      await generateThumbnail(coverAbs, thumbAbs)
      await fs.unlink(req.file.path).catch(() => {})

      const oldCover = album.coverUrl
      const oldThumb = album.coverThumb
      repo.updateCover(id, toAlbumUrl(coverRel), toAlbumUrl(thumbRel))

      // 删除旧封面原图与缩略图
      await Promise.all([deleteAlbumFile(oldCover), deleteAlbumFile(oldThumb)])

      res.json(repo.get(id))
    } catch (error) {
      await Promise.all([
        fs.unlink(req.file.path).catch(() => {}),
        ...(coverAbs ? [fs.rm(coverAbs, { force: true }).catch(() => {})] : []),
        ...(thumbAbs ? [fs.rm(thumbAbs, { force: true }).catch(() => {})] : []),
      ])
      console.error('Album cover upload error:', error)
      res.status(500).json({ error: '封面上传失败' })
    }
  })

  // 改 caption
  router.put('/photos/:id', adminOnly, (req, res) => {
    const caption = String(req.body?.caption ?? '')
    const updated = repo.updatePhotoCaption(String(req.params.id), caption)
    if (!updated) {
      res.status(404).json({ error: 'Photo not found' })
      return
    }
    res.json(updated)
  })

  // 删单张
  router.delete('/photos/:id', adminOnly, async (req, res) => {
    const photo = repo.deletePhoto(String(req.params.id))
    if (!photo) {
      res.status(404).json({ error: 'Photo not found' })
      return
    }
    await Promise.all([deleteAlbumFile(photo.imageUrl), deleteAlbumFile(photo.thumbUrl)])
    res.status(204).send()
  })

  // multer 在遇到非法文件/超限时会直接 next(error)，不会进入路由处理器；
  // 此时同批已写入磁盘的 raw-* 临时文件需要在错误中间件里清理，避免孤儿文件。
  router.use(async (error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (
      error instanceof multer.MulterError ||
      (error instanceof Error && error.message.includes('不支持的文件类型'))
    ) {
      const dir = safeAlbumDir(String(req.params.id ?? ''))
      if (dir !== null) {
        const files = await fs.readdir(dir).catch(() => [] as string[])
        await Promise.all(
          files
            .filter((f) => f.startsWith('raw-'))
            .map((f) => fs.unlink(path.join(dir, f)).catch(() => {})),
        )
      }
    }
    handleUploadError(error, req, res, next)
  })

  return router

  function toAlbumUrl(relPath: string): string {
    return `${URL_PREFIX}${relPath.split(path.sep).join('/')}`
  }

  async function deleteAlbumFile(url: string): Promise<void> {
    if (!url.startsWith(URL_PREFIX)) return
    const abs = path.join(albumUploadDir, url.slice(URL_PREFIX.length))
    try {
      await fs.unlink(abs)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Failed to delete album file:', error)
      }
    }
  }
}

async function cleanupRawFiles(files: Array<{ path: string }> | undefined): Promise<void> {
  if (!files) return
  await Promise.all(files.map((f) => fs.unlink(f.path).catch(() => {})))
}

function parseAlbumInput(body: unknown): AlbumInput {
  const data = (body ?? {}) as Record<string, unknown>
  return {
    title: String(data.title ?? ''),
    year: String(data.year ?? ''),
    date: typeof data.date === 'string' ? data.date : '',
    location: typeof data.location === 'string' ? data.location : '',
    description: typeof data.description === 'string' ? data.description : '',
    categories: Array.isArray(data.categories)
      ? data.categories.filter((c): c is string => typeof c === 'string')
      : [],
    featured: Boolean(data.featured),
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
  }
}

function generateAlbumId(title: string, isAvailable: (id: string) => boolean): string {
  const hasAscii = /[a-zA-Z0-9_-]/.test(title)
  const base = hasAscii ? (slugifyImageName(title) || 'album') : 'album'
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base}-${crypto.randomBytes(3).toString('hex')}`
    if (isAvailable(candidate)) return candidate
  }
  // 极端情况下回退到更长随机串
  return `${base}-${crypto.randomBytes(6).toString('hex')}`
}

function handleWriteError(error: unknown, res: Response): void {
  if (error instanceof AlbumValidationError) {
    res.status(400).json({ error: error.message })
    return
  }
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
    res.status(409).json({ error: 'Album id already exists' })
    return
  }
  console.error('Album write error:', error)
  if (!res.headersSent) res.status(500).json({ error: '保存失败' })
}

function handleUploadError(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (error instanceof Error && error.message === '相册 ID 非法') {
    res.status(400).json({ error: error.message })
    return
  }
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: '文件大小超过限制（最大 5MB）' })
      return
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ error: `一次最多上传 ${MAX_PHOTOS_PER_BATCH} 张照片` })
      return
    }
  }
  if (error instanceof Error && error.message.includes('不支持的文件类型')) {
    res.status(400).json({ error: error.message })
    return
  }
  next(error)
}
