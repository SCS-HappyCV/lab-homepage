import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/db.js'
import { createAlbumRepository } from '../src/albums/albums.repo.js'
import {
  compressImage,
  ensureDirectory,
  generateAlbumCoverPath,
  generateAlbumPhotoPath,
  generateThumbnail,
  thumbnailPathFor,
} from '../src/image-utils.js'

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
const publicLabDir = join(projectRoot, 'public', 'gallery', 'lab')

interface MigratePhoto {
  source: string       // 绝对路径
  originalName: string // 用于生成 slug 文件名
  caption?: string
}

interface MigrateAlbum {
  id: string
  title: string
  year: string
  date: string
  location: string
  description: string
  categories: string[]
  featured: boolean
  coverOriginalName: string // 从 photos 中选哪张做封面（匹配 originalName）
  photos: MigratePhoto[]
}

const albums: MigrateAlbum[] = [
  {
    id: '2026-graduation',
    title: '2026 届毕业合影',
    year: '2026',
    date: '2026-06',
    location: '湘潭大学',
    description: '记录 2026 届毕业生在实验室、校园里的珍贵瞬间，包含信息楼、铜像广场、三拱门等地标合影。',
    categories: ['毕业照'],
    featured: true,
    coverOriginalName: 'DSC_1795.JPG',
    photos: [
      { source: join(publicLabDir, '2026', 'DSC_1795.JPG'), originalName: 'DSC_1795.JPG', caption: '信息科技大楼' },
      { source: join(publicLabDir, '2026', 'DSC_1759.JPG'), originalName: 'DSC_1759.JPG', caption: '工科楼' },
      { source: join(publicLabDir, '2026', 'DSC_1773.JPG'), originalName: 'DSC_1773.JPG', caption: '信息楼' },
      { source: join(publicLabDir, '2026', 'DSC_1780.JPG'), originalName: 'DSC_1780.JPG', caption: '信息楼' },
      { source: join(publicLabDir, '2026', 'DSC_1838.JPG'), originalName: 'DSC_1838.JPG', caption: '信息科技大楼 632' },
      { source: join(publicLabDir, '2026', 'DSC_1850.JPG'), originalName: 'DSC_1850.JPG', caption: '信息科技大楼 616' },
      { source: join(publicLabDir, '2026', 'DSC_1824.JPG'), originalName: 'DSC_1824.JPG', caption: '信息科技大楼' },
      { source: join(publicLabDir, '2026', 'DSC_1820.JPG'), originalName: 'DSC_1820.JPG', caption: '信息科技大楼' },
      { source: join(publicLabDir, '2026', '1.jpg'), originalName: '1.jpg', caption: '诗词碑' },
      { source: join(publicLabDir, '2026', '2.jpg'), originalName: '2.jpg', caption: '铜像广场' },
      { source: join(publicLabDir, '2026', '3.jpg'), originalName: '3.jpg', caption: '铜像广场' },
      { source: join(publicLabDir, '2026', '4.jpg'), originalName: '4.jpg', caption: '铜像广场' },
      { source: join(publicLabDir, '2026', '5.jpg'), originalName: '5.jpg', caption: '铜像广场' },
      { source: join(publicLabDir, '2026', '6.jpg'), originalName: '6.jpg', caption: '铜像广场' },
      { source: join(publicLabDir, '2026', '7.jpg'), originalName: '7.jpg', caption: '南门' },
      { source: join(publicLabDir, '2026', '8.jpg'), originalName: '8.jpg', caption: '南门' },
      { source: join(publicLabDir, '2026', '9.jpg'), originalName: '9.jpg', caption: '南门' },
      { source: join(publicLabDir, '2026', '10.jpg'), originalName: '10.jpg', caption: '南门' },
      { source: join(publicLabDir, '2026', '11.jpg'), originalName: '11.jpg', caption: '三拱门' },
    ],
  },
  {
    id: '2025-summer-life',
    title: '夏季户外合影',
    year: '2025',
    date: '2025-06',
    location: '湘潭大学校园',
    description: '2025 年夏季实验室成员户外合影，记录轻松愉快的团队时光。',
    categories: ['生活照'],
    featured: true,
    coverOriginalName: 'lab-life.jpg',
    photos: [
      { source: join(publicLabDir, 'lab-life.jpg'), originalName: 'lab-life.jpg' },
    ],
  },
  {
    id: '2025-campus-moment',
    title: '校园生活片段',
    year: '2025',
    date: '2025-06',
    location: '湘潭大学校园湖畔',
    description: '校园湖畔的日常随拍，捕捉实验室生活的温馨瞬间。',
    categories: ['生活照'],
    featured: true,
    coverOriginalName: 'campus-moment.jpg',
    photos: [
      { source: join(publicLabDir, 'campus-moment.jpg'), originalName: 'campus-moment.jpg' },
    ],
  },
]

async function processAlbumPhoto(
  albumUploadDir: string,
  albumId: string,
  source: string,
  originalName: string,
): Promise<{ imageUrl: string; thumbUrl: string }> {
  if (!existsSync(source)) {
    throw new Error(`源文件不存在: ${source}`)
  }
  const imageRel = generateAlbumPhotoPath(albumId, originalName)
  const thumbRel = thumbnailPathFor(imageRel)
  const imageAbs = join(albumUploadDir, imageRel)
  const thumbAbs = join(albumUploadDir, thumbRel)

  await ensureDirectory(join(albumUploadDir, albumId))
  await compressImage(source, imageAbs)
  await generateThumbnail(imageAbs, thumbAbs)

  return { imageUrl: `/uploads/albums/${imageRel.replace(/\\/g, '/')}`, thumbUrl: `/uploads/albums/${thumbRel.replace(/\\/g, '/')}` }
}

async function processCover(
  albumUploadDir: string,
  albumId: string,
  source: string,
): Promise<{ coverUrl: string; coverThumb: string }> {
  if (!existsSync(source)) throw new Error(`封面源文件不存在: ${source}`)
  const coverRel = generateAlbumCoverPath(albumId)
  const thumbRel = thumbnailPathFor(coverRel)
  const coverAbs = join(albumUploadDir, coverRel)
  const thumbAbs = join(albumUploadDir, thumbRel)

  await ensureDirectory(join(albumUploadDir, albumId))
  await compressImage(source, coverAbs)
  await generateThumbnail(coverAbs, thumbAbs)

  return { coverUrl: `/uploads/albums/${coverRel.replace(/\\/g, '/')}`, coverThumb: `/uploads/albums/${thumbRel.replace(/\\/g, '/')}` }
}

async function main() {
  const config = loadConfig()
  const db = openDatabase(config.sqlitePath)
  const repo = createAlbumRepository(db)

  await ensureDirectory(config.albumUploadDir)

  for (const album of albums) {
    // 幂等：删除已有记录（级联删照片）与目录
    repo.delete(album.id)
    const albumDir = join(config.albumUploadDir, album.id)
    rmSync(albumDir, { recursive: true, force: true })

    repo.create(album.id, {
      title: album.title,
      year: album.year,
      date: album.date,
      location: album.location,
      description: album.description,
      categories: album.categories,
      featured: album.featured,
      sortOrder: 0,
    })

    const photoInputs = []
    for (const photo of album.photos) {
      const processed = await processAlbumPhoto(config.albumUploadDir, album.id, photo.source, photo.originalName)
      photoInputs.push({ ...processed, caption: photo.caption })
    }
    repo.addPhotos(album.id, photoInputs)

    const coverSource =
      album.photos.find((p) => p.originalName === album.coverOriginalName)?.source ?? album.photos[0].source
    const cover = await processCover(config.albumUploadDir, album.id, coverSource)
    repo.updateCover(album.id, cover.coverUrl, cover.coverThumb)

    console.log(`已迁移相册 ${album.id}: ${photoInputs.length} 张照片，封面 ${cover.coverUrl}`)
  }

  console.log('迁移完成。')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
