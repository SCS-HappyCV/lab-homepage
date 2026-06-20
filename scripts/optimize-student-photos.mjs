import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const studentsRoot = path.join(projectRoot, 'public', 'students')
const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const force = process.argv.includes('--force')

function readPositiveNumberOption(name, fallback) {
  const prefix = `--${name}=`
  const argument = process.argv.find((item) => item.startsWith(prefix))

  if (!argument) {
    return fallback
  }

  const value = Number(argument.slice(prefix.length))

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid --${name} value: ${argument.slice(prefix.length)}`)
  }

  return value
}

const thresholdKb = readPositiveNumberOption('threshold-kb', 800)
const maxDimension = readPositiveNumberOption('max', 1200)
const quality = Math.min(100, Math.round(readPositiveNumberOption('quality', 82)))
const thresholdBytes = thresholdKb * 1024

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function collectImages(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const images = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      images.push(...(await collectImages(entryPath)))
      continue
    }

    if (
      entry.isFile() &&
      !entry.name.includes('.optimized-') &&
      supportedExtensions.has(path.extname(entry.name).toLowerCase())
    ) {
      images.push(entryPath)
    }
  }

  return images
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function toRelativePath(targetPath) {
  return path.relative(projectRoot, targetPath).split(path.sep).join('/')
}

function buildPipeline(sourcePath) {
  const extension = path.extname(sourcePath).toLowerCase()
  const pipeline = sharp(sourcePath)
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })

  if (extension === '.jpg' || extension === '.jpeg') {
    return pipeline.jpeg({ quality, mozjpeg: true })
  }

  if (extension === '.png') {
    return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true })
  }

  return pipeline.webp({ quality, effort: 4 })
}

async function optimizePhoto(sourcePath) {
  const before = await fs.stat(sourcePath)

  if (!force && before.size <= thresholdBytes) {
    return { status: 'skipped', sourcePath, before: before.size, after: before.size }
  }

  const extension = path.extname(sourcePath)
  const tempPath = path.join(
    path.dirname(sourcePath),
    `.${path.basename(sourcePath, extension)}.optimized-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}${extension}`,
  )

  await buildPipeline(sourcePath).toFile(tempPath)

  const after = await fs.stat(tempPath)

  if (after.size >= before.size) {
    await fs.rm(tempPath, { force: true })
    return { status: 'kept', sourcePath, before: before.size, after: after.size }
  }

  const backupPath = `${sourcePath}.backup-${Date.now()}`

  await fs.rename(sourcePath, backupPath)

  try {
    await fs.rename(tempPath, sourcePath)
    await fs.rm(backupPath, { force: true })
  } catch (error) {
    await fs.rename(backupPath, sourcePath).catch(() => {})
    await fs.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }

  return { status: 'optimized', sourcePath, before: before.size, after: after.size }
}

if (!(await pathExists(studentsRoot))) {
  throw new Error(`Student photo folder not found: ${studentsRoot}`)
}

const sourceImages = await collectImages(studentsRoot)
const results = []

for (const sourcePath of sourceImages) {
  results.push(await optimizePhoto(sourcePath))
}

for (const result of results) {
  if (result.status === 'optimized') {
    const percent = (100 - (result.after / result.before) * 100).toFixed(1)
    console.log(
      `Optimized ${toRelativePath(result.sourcePath)}: ${formatBytes(result.before)} -> ${formatBytes(
        result.after,
      )} (${percent}% smaller)`,
    )
  }
}

const optimizedCount = results.filter((item) => item.status === 'optimized').length
const skippedCount = results.filter((item) => item.status === 'skipped').length
const keptCount = results.filter((item) => item.status === 'kept').length

console.log(
  `Student photo optimization complete: ${optimizedCount} optimized, ${skippedCount} skipped, ${keptCount} kept.`,
)
