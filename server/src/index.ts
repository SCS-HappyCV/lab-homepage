import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { loadConfig } from './config.js'
import type { ServerConfig } from './types.js'

export interface AppOptions {
  config: ServerConfig
}

export function createApp(options: Partial<AppOptions> = {}) {
  const config = options.config ?? loadConfig()
  const app = express()

  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin }))
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'lab-homepage-api' })
  })

  return app
}

const isMainModule = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false

if (isMainModule) {
  const config = loadConfig()
  const app = createApp({ config })

  app.listen(config.port, () => {
    console.log(`Lab homepage API listening on port ${config.port}`)
  })
}
