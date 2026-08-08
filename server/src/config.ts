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
    albumUploadDir: process.env.ALBUM_UPLOAD_DIR ?? path.join(process.cwd(), 'data', 'uploads', 'albums'),
  }
}

export interface PatentConfig {
  uploadDir: string
  tempDir: string
  maxFileSizeMB: number
  maxPageCount: number
  parsePageCount: number
  ocrEnabled: boolean
  ocrDpi: number
  ocrLanguage: string
  llmEnabled: boolean
  llmApiKey: string
  llmBaseUrl: string
  llmModel: string
  llmTimeoutSeconds: number
  llmMaxRetries: number
  lowConfidenceThreshold: number
  ocrMinTextLength: number
  tempFileRetentionHours: number
}

export function loadPatentConfig(): PatentConfig {
  return {
    uploadDir: process.env.PATENT_UPLOAD_DIR || './data/patents',
    tempDir: process.env.PATENT_TEMP_DIR || './data/patents/temp',
    maxFileSizeMB: Number(process.env.PATENT_MAX_FILE_SIZE_MB ?? 30),
    maxPageCount: Number(process.env.PATENT_MAX_PAGE_COUNT ?? 500),
    parsePageCount: Number(process.env.PATENT_PARSE_PAGE_COUNT ?? 2),
    ocrEnabled: process.env.OCR_ENABLED !== 'false',
    ocrDpi: Number(process.env.OCR_DPI ?? 250),
    ocrLanguage: process.env.OCR_LANGUAGE ?? 'ch',
    llmEnabled: process.env.LLM_ENABLED !== 'false',
    llmApiKey: process.env.LLM_API_KEY ?? '',
    llmBaseUrl: process.env.LLM_BASE_URL ?? '',
    llmModel: process.env.LLM_MODEL ?? '',
    llmTimeoutSeconds: Number(process.env.LLM_TIMEOUT_SECONDS ?? 30),
    llmMaxRetries: Number(process.env.LLM_MAX_RETRIES ?? 1),
    lowConfidenceThreshold: Number(process.env.PATENT_LOW_CONFIDENCE_THRESHOLD ?? 0.80),
    ocrMinTextLength: Number(process.env.PATENT_OCR_MIN_TEXT_LENGTH ?? 80),
    tempFileRetentionHours: Number(process.env.PATENT_TEMP_FILE_RETENTION_HOURS ?? 24),
  }
}
