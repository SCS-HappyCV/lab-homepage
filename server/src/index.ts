import express from 'express'
import cors from 'cors'
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

  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin }))
  app.use(express.json({ limit: '1mb' }))
  const authService = createAuthService(config)
  const db = openDatabase(config.sqlitePath)
  const studentRepo = createStudentRepository(db)

  registerAuthRoutes(app, authService)
  app.use(createStudentRouter({ repo: studentRepo, authService }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'lab-homepage-api' })
  })

  return app
}
