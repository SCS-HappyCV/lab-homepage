import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const galleryRoot = path.join(projectRoot, 'public', 'gallery', 'lab')
const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const force = process.argv.includes('--force')

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
      if (entry.name !== 'thumbs') {
        images.push(...(await collectImages(entryPath)))
      }
      continue
    }

    if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
      images.push(entryPath)
    }
  }

  return images
}

async function shouldGenerate(sourcePath, targetPath) {
  if (force || !(await pathExists(targetPath))) {
    return true
  }

  const [sourceStat, targetStat] = await Promise.all([fs.stat(sourcePath), fs.stat(targetPath)])
  return sourceStat.mtimeMs > targetStat.mtimeMs
}

async function generateThumbnail(sourcePath) {
  const sourceDirectory = path.dirname(sourcePath)
  const outputDirectory = path.join(sourceDirectory, 'thumbs')
  const outputFileName = `${path.basename(sourcePath, path.extname(sourcePath))}.webp`
  const outputPath = path.join(outputDirectory, outputFileName)

  if (!(await shouldGenerate(sourcePath, outputPath))) {
    return { status: 'skipped', sourcePath, outputPath }
  }

  await fs.mkdir(outputDirectory, { recursive: true })
  await sharp(sourcePath)
    .rotate()
    .resize({
      width: 960,
      height: 960,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80, effort: 4 })
    .toFile(outputPath)

  return { status: 'generated', sourcePath, outputPath }
}

if (!(await pathExists(galleryRoot))) {
  throw new Error(`Gallery folder not found: ${galleryRoot}`)
}

const sourceImages = await collectImages(galleryRoot)
const results = []

for (const sourcePath of sourceImages) {
  results.push(await generateThumbnail(sourcePath))
}

const generatedCount = results.filter((item) => item.status === 'generated').length
const skippedCount = results.filter((item) => item.status === 'skipped').length

console.log(`Gallery thumbnails complete: ${generatedCount} generated, ${skippedCount} skipped.`)
