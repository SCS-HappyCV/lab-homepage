import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'

const MAX_DIMENSION = 1200
const QUALITY = 82
const THRESHOLD_BYTES = 800 * 1024 // 800KB

export interface CompressResult {
  path: string
  originalSize: number
  compressedSize: number
  saved: boolean
}

export async function compressImage(inputPath: string, outputPath?: string): Promise<CompressResult> {
  const output = outputPath ?? inputPath
  const stats = await fs.stat(inputPath)
  const originalSize = stats.size

  // 如果文件小于阈值，直接返回
  if (originalSize <= THRESHOLD_BYTES) {
    if (inputPath !== output) {
      await fs.copyFile(inputPath, output)
    }
    return {
      path: output,
      originalSize,
      compressedSize: originalSize,
      saved: false,
    }
  }

  // 获取图片信息
  const metadata = await sharp(inputPath).metadata()
  const { width, height } = metadata

  // 计算新的尺寸
  let newWidth = width ?? MAX_DIMENSION
  let newHeight = height ?? MAX_DIMENSION

  if (newWidth > MAX_DIMENSION || newHeight > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / (newWidth || 1), MAX_DIMENSION / (newHeight || 1))
    newWidth = Math.round(newWidth * ratio)
    newHeight = Math.round(newHeight * ratio)
  }

  // 构建压缩管道
  const pipeline = sharp(inputPath)
    .rotate()
    .resize(newWidth, newHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })

  // 根据输出格式设置压缩参数
  const ext = path.extname(output).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') {
    await pipeline.jpeg({ quality: QUALITY, mozjpeg: true }).toFile(output)
  } else if (ext === '.png') {
    await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(output)
  } else if (ext === '.webp') {
    await pipeline.webp({ quality: QUALITY, effort: 4 }).toFile(output)
  } else {
    // 默认使用 JPEG
    await pipeline.jpeg({ quality: QUALITY, mozjpeg: true }).toFile(output)
  }

  const compressedStats = await fs.stat(output)

  return {
    path: output,
    originalSize,
    compressedSize: compressedStats.size,
    saved: compressedStats.size < originalSize,
  }
}

export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

/**
 * 清空并重建照片暂存目录，用于服务启动时清理上次运行残留的未提交临时文件。
 */
export async function cleanupStagingDir(uploadDir: string): Promise<void> {
  const stagingDir = path.join(uploadDir, '_temp')
  await fs.rm(stagingDir, { recursive: true, force: true })
  await ensureDirectory(stagingDir)
}

/**
 * 生成成员照片的最终存放相对路径。
 * 文件名带时间戳后缀（<studentId>-<prefix>-<timestamp>.jpg），
 * 使每次替换图片后 URL 都不同，从而绕过 Cloudflare 等 CDN 的缓存。
 */
export function generatePhotoPath(cohort: string, studentId: string, prefix = 'photo', timestamp?: number): string {
  const suffix = timestamp ?? Date.now()
  const filename = `${studentId}-${prefix}-${suffix}.jpg`
  return path.join(cohort, filename)
}

/**
 * 把上传文件名清洗为 ASCII slug：去掉扩展名、转小写、空白转连字符、
 * 剥离非 [a-z0-9_-] 字符（含中文），截断到 40 字符；结果为空时回退 'photo'。
 */
export function slugifyImageName(name: string): string {
  const base = path
    .basename(name, path.extname(name))
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '')
  return base || 'photo'
}

/**
 * 生成相册照片的相对存放路径：<albumId>/<slug>-<timestamp>.jpg。
 * 时间戳保证每次上传都是新 URL，绕过 CDN 缓存。
 */
export function generateAlbumPhotoPath(albumId: string, originalName: string, timestamp?: number): string {
  const slug = slugifyImageName(originalName)
  const suffix = timestamp ?? Date.now()
  return path.join(albumId, `${slug}-${suffix}.jpg`)
}

/**
 * 生成相册封面的相对存放路径：<albumId>/cover-<timestamp>.jpg。
 */
export function generateAlbumCoverPath(albumId: string, timestamp?: number): string {
  const suffix = timestamp ?? Date.now()
  return path.join(albumId, `cover-${suffix}.jpg`)
}

/**
 * 给定原图相对路径，返回其缩略图相对路径：同级 thumbs/ 目录、同名 .webp。
 */
export function thumbnailPathFor(imageRelPath: string): string {
  const ext = path.extname(imageRelPath)
  const webp = imageRelPath.slice(0, imageRelPath.length - ext.length) + '.webp'
  return path.join(path.dirname(webp), 'thumbs', path.basename(webp))
}

/**
 * 生成 WebP 缩略图：960×960 fit:inside、不放大、q80，自动按 EXIF 旋转。
 */
export async function generateThumbnail(src: string, dest: string): Promise<void> {
  await ensureDirectory(path.dirname(dest))
  await sharp(src)
    .rotate()
    .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toFile(dest)
}
