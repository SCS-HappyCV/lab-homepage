import dotenv from 'dotenv'
import path from 'node:path'
import type { ServerConfig } from './types.js'

dotenv.config()

export function loadConfig(): ServerConfig {
  return {
    port: Number(process.env.PORT ?? 3001),
    adminPassHash: process.env.ADMIN_PASS_HASH ?? '',
    jwtSecret: process.env.JWT_SECRET ?? '',
    sqlitePath: process.env.SQLITE_PATH ?? './data/lab-homepage.db',
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
    uploadDir: process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'data', 'uploads', 'students'),
  }
}
