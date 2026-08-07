import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { createAuthService, registerAuthRoutes } from './auth.js'
import { loadConfig } from './config.js'
import { openDatabase } from './db.js'
import { createStudentRepository } from './students.repo.js'
import { createStudentRouter } from './students.routes.js'
import { createPatentRouter } from './patents.routes.js'
import { createPatentRecognitionRouter } from './patent/patent-recognition.routes.js'
import type { ServerConfig } from './types.js'

export interface AppOptions {
  config: ServerConfig
}

export function createApp(options: Partial<AppOptions> = {}) {
  const config = options.config ?? loadConfig()
  const app = express()

  const allowedOrigins = config.corsOrigin.split(',').map(s => s.trim())
  app.use(cors({
    origin: config.corsOrigin === '*'
      ? true
      : (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true)
          } else {
            callback(new Error('Not allowed by CORS'))
          }
        }
  }))
  app.use(express.json({ limit: '1mb' }))

  // 静态文件服务 - 照片访问
  // 文件名固定（<id>-avatar.jpg / <id>-cover.jpg），替换图片时 URL 不变，
  // 因此必须禁用边缘强缓存、强制每次回源校验 ETag/Last-Modified，
  // 否则 Cloudflare 等 CDN 会一直返回替换前的旧图。
  const uploadsBaseDir = path.dirname(config.uploadDir)
  app.use('/uploads', express.static(uploadsBaseDir, {
    lastModified: true,
    etag: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
      res.set('Access-Control-Allow-Origin', '*')
    },
  }))

  const authService = createAuthService(config)
  const db = openDatabase(config.sqlitePath)
  const studentRepo = createStudentRepository(db)

  // 专利识别模块配置
  const patentUploadDir = process.env.PATENT_UPLOAD_DIR || path.join(process.cwd(), 'data', 'patents')
  const patentTempDir = process.env.PATENT_TEMP_DIR || path.join(process.cwd(), 'data', 'patents', 'temp')

  registerAuthRoutes(app, authService)
  app.use(createStudentRouter({ repo: studentRepo, authService, uploadDir: config.uploadDir }))
  app.use(createPatentRouter({ db, authService, uploadDir: config.uploadDir }))
  app.use(createPatentRecognitionRouter({
    db,
    authService,
    uploadDir: patentUploadDir,
    tempDir: patentTempDir,
  }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'lab-homepage-api' })
  })

  return app
}
