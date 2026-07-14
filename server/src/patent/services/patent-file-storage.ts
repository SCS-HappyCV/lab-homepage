/**
 * 专利文件存储服务
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'

export interface FileStorageConfig {
  uploadDir: string
  tempDir: string
}

export interface StoredFile {
  id: string
  originalName: string
  storedName: string
  storagePath: string
  mimeType: string
  fileSize: number
  sha256: string
}

export class PatentFileStorage {
  private config: FileStorageConfig

  constructor(config: FileStorageConfig) {
    this.config = config
  }

  /**
   * 初始化存储目录
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.uploadDir, { recursive: true })
    await fs.mkdir(this.config.tempDir, { recursive: true })
  }

  /**
   * 保存上传的文件
   */
  async saveFile(file: Express.Multer.File, userId: string): Promise<StoredFile> {
    // 生成唯一文件ID
    const fileId = `file_${uuidv4()}`

    // 生成存储文件名（UUID + 原始扩展名）
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf'
    const storedName = `${uuidv4()}${ext}`

    // 计算文件SHA-256
    const sha256 = await this.calculateSHA256(file.path)

    // 移动文件到最终存储位置
    const storagePath = path.join(this.config.uploadDir, storedName)
    await fs.rename(file.path, storagePath)

    return {
      id: fileId,
      originalName: file.originalname,
      storedName,
      storagePath,
      mimeType: file.mimetype,
      fileSize: file.size,
      sha256,
    }
  }

  /**
   * 计算文件SHA-256
   */
  async calculateSHA256(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath)
    const hashSum = crypto.createHash('sha256')
    hashSum.update(fileBuffer)
    return hashSum.digest('hex')
  }

  /**
   * 获取文件访问路径
   */
  getFilePath(storedName: string): string {
    return path.join(this.config.uploadDir, storedName)
  }

  /**
   * 删除文件
   */
  async deleteFile(storedName: string): Promise<void> {
    const filePath = path.join(this.config.uploadDir, storedName)
    try {
      await fs.unlink(filePath)
    } catch (error) {
      // 文件不存在，忽略错误
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  /**
   * 保存临时文件
   */
  async saveTempFile(buffer: Buffer, prefix: string, ext: string): Promise<string> {
    const tempFileName = `${prefix}_${uuidv4()}${ext}`
    const tempFilePath = path.join(this.config.tempDir, tempFileName)
    await fs.writeFile(tempFilePath, buffer)
    return tempFilePath
  }

  /**
   * 删除临时文件
   */
  async deleteTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  /**
   * 清理过期临时文件
   */
  async cleanTempFiles(maxAgeHours: number): Promise<number> {
    const now = Date.now()
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000
    let cleanedCount = 0

    try {
      const files = await fs.readdir(this.config.tempDir)
      for (const file of files) {
        const filePath = path.join(this.config.tempDir, file)
        const stats = await fs.stat(filePath)
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath)
          cleanedCount++
        }
      }
    } catch (error) {
      console.error('Failed to clean temp files:', error)
    }

    return cleanedCount
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(storedName: string): Promise<boolean> {
    const filePath = path.join(this.config.uploadDir, storedName)
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取文件大小
   */
  async getFileSize(storedName: string): Promise<number> {
    const filePath = path.join(this.config.uploadDir, storedName)
    const stats = await fs.stat(filePath)
    return stats.size
  }
}

/**
 * 创建文件存储服务实例
 */
export function createPatentFileStorage(config?: Partial<FileStorageConfig>): PatentFileStorage {
  const defaultConfig: FileStorageConfig = {
    uploadDir: process.env.PATENT_UPLOAD_DIR || './data/patents',
    tempDir: process.env.PATENT_TEMP_DIR || './data/patents/temp',
  }

  return new PatentFileStorage({ ...defaultConfig, ...config })
}
