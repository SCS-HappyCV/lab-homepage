import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { createAuthService, registerAuthRoutes } from './auth.js'
import { loadConfig } from './config.js'
import { openDatabase } from './db.js'
import { createStudentRepository } from './students.repo.js'
import { createStudentRouter } from './students.routes.js'
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
  const uploadsBaseDir = path.dirname(config.uploadDir)
  app.use('/uploads', express.static(uploadsBaseDir, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => {
      res.set('Access-Control-Allow-Origin', '*')
    },
  }))

  const authService = createAuthService(config)
  const db = openDatabase(config.sqlitePath)
  const studentRepo = createStudentRepository(db)

  registerAuthRoutes(app, authService)
  app.use(createStudentRouter({ repo: studentRepo, authService, uploadDir: config.uploadDir }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'lab-homepage-api' })
  })

  return app
}
