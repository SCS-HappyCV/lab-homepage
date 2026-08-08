import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../db.js'
import type { Album, AlbumBase, AlbumInput, AlbumListItem, NewPhoto, Photo } from './types.js'

export class AlbumValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AlbumValidationError'
  }
}

export interface AlbumRepository {
  list(): AlbumListItem[]
  get(id: string): Album | null
  create(id: string, input: AlbumInput): Album
  update(id: string, input: AlbumInput): Album | null
  updateCover(id: string, coverUrl: string, coverThumb: string): Album | null
  delete(id: string): boolean
  addPhotos(albumId: string, photos: NewPhoto[]): Photo[]
  updatePhotoCaption(photoId: string, caption: string): Photo | null
  reorderPhotos(albumId: string, orderedIds: string[]): boolean
  getPhoto(photoId: string): Photo | null
  deletePhoto(photoId: string): Photo | null
}

type AlbumRow = Omit<AlbumBase, 'categories' | 'featured'> & {
  categories: string
  featured: number
}

type PhotoRow = Photo

export function createAlbumRepository(db: AppDatabase): AlbumRepository {
  return {
    list() {
      const rows = db
        .prepare(
          `SELECT a.*, (SELECT COUNT(*) FROM photos p WHERE p.albumId = a.id) AS photosCount
           FROM albums a
           ORDER BY a.sortOrder ASC, a.year DESC, a.title ASC`,
        )
        .all() as (AlbumRow & { photosCount: number })[]
      return rows.map((row) => ({ ...albumFromRow(row), photosCount: row.photosCount }))
    },

    get(id) {
      const row = db.prepare('SELECT * FROM albums WHERE id = ?').get(id) as AlbumRow | undefined
      if (!row) return null
      const photos = db
        .prepare('SELECT * FROM photos WHERE albumId = ? ORDER BY sortOrder ASC, createdAt ASC')
        .all(id) as unknown as PhotoRow[]
      return { ...albumFromRow(row), photos }
    },

    create(id, input) {
      const normalized = normalizeInput(input)
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO albums
          (id, title, year, date, location, description, categories, coverUrl, coverThumb, featured, sortOrder, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        normalized.title,
        normalized.year,
        normalized.date,
        normalized.location,
        normalized.description,
        JSON.stringify(normalized.categories),
        normalized.coverUrl,
        normalized.coverThumb,
        normalized.featured ? 1 : 0,
        normalized.sortOrder,
        now,
        now,
      )
      return this.get(id)!
    },

    update(id, input) {
      if (!albumExists(db, id)) return null
      const normalized = normalizeInput(input)
      db.prepare(
        `UPDATE albums SET
          title = ?, year = ?, date = ?, location = ?, description = ?, categories = ?,
          featured = ?, sortOrder = ?, updatedAt = ?
         WHERE id = ?`,
      ).run(
        normalized.title,
        normalized.year,
        normalized.date,
        normalized.location,
        normalized.description,
        JSON.stringify(normalized.categories),
        normalized.featured ? 1 : 0,
        normalized.sortOrder,
        new Date().toISOString(),
        id,
      )
      return this.get(id)
    },

    updateCover(id, coverUrl, coverThumb) {
      if (!albumExists(db, id)) return null
      db.prepare('UPDATE albums SET coverUrl = ?, coverThumb = ?, updatedAt = ? WHERE id = ?').run(
        coverUrl,
        coverThumb,
        new Date().toISOString(),
        id,
      )
      return this.get(id)
    },

    delete(id) {
      const result = db.prepare('DELETE FROM albums WHERE id = ?').run(id)
      return result.changes > 0
    },

    addPhotos(albumId, photos) {
      if (photos.length === 0) return []
      const now = new Date().toISOString()
      const maxRow = db.prepare('SELECT COALESCE(MAX(sortOrder), -1) AS m FROM photos WHERE albumId = ?').get(albumId) as { m: number }
      let startOrder = maxRow.m + 1

      const created: Photo[] = []
      db.exec('BEGIN')
      try {
        const insert = db.prepare(
          `INSERT INTO photos (id, albumId, imageUrl, thumbUrl, caption, sortOrder, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const photo of photos) {
          const record: Photo = {
            id: randomUUID(),
            albumId,
            imageUrl: photo.imageUrl,
            thumbUrl: photo.thumbUrl,
            caption: (photo.caption ?? '').trim(),
            sortOrder: startOrder++,
            createdAt: now,
          }
          insert.run(record.id, record.albumId, record.imageUrl, record.thumbUrl, record.caption, record.sortOrder, record.createdAt)
          created.push(record)
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return created
    },

    updatePhotoCaption(photoId, caption) {
      const result = db.prepare('UPDATE photos SET caption = ? WHERE id = ?').run(String(caption ?? '').trim(), photoId)
      if (result.changes === 0) return null
      return this.getPhoto(photoId)
    },

    reorderPhotos(albumId, orderedIds) {
      const existing = db.prepare('SELECT id FROM photos WHERE albumId = ?').all(albumId) as { id: string }[]
      if (existing.length !== orderedIds.length) return false
      const existingSet = new Set(existing.map((r) => r.id))
      if (!orderedIds.every((id) => existingSet.has(id))) return false
      if (new Set(orderedIds).size !== existing.length) return false

      db.exec('BEGIN')
      try {
        const update = db.prepare('UPDATE photos SET sortOrder = ? WHERE id = ? AND albumId = ?')
        orderedIds.forEach((id, index) => update.run(index, id, albumId))
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return true
    },

    getPhoto(photoId) {
      const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId) as PhotoRow | undefined
      return row ?? null
    },

    deletePhoto(photoId) {
      const photo = this.getPhoto(photoId)
      if (!photo) return null
      db.prepare('DELETE FROM photos WHERE id = ?').run(photoId)
      return photo
    },
  }
}

function albumExists(db: AppDatabase, id: string): boolean {
  return Boolean(db.prepare('SELECT id FROM albums WHERE id = ?').get(id))
}

function albumFromRow(row: AlbumRow): AlbumBase {
  return {
    ...row,
    categories: parseStringArray(row.categories),
    featured: Boolean(row.featured),
  }
}

function normalizeInput(input: AlbumInput): Required<Pick<AlbumInput, 'title' | 'year' | 'date' | 'location' | 'description' | 'categories' | 'coverUrl' | 'coverThumb' | 'featured' | 'sortOrder'>> {
  const title = String(input.title ?? '').trim()
  const year = String(input.year ?? '').trim()
  if (!title) throw new AlbumValidationError('title is required')
  if (!year) throw new AlbumValidationError('year is required')

  return {
    title,
    year,
    date: String(input.date ?? '').trim(),
    location: String(input.location ?? '').trim(),
    description: String(input.description ?? '').trim(),
    categories: Array.isArray(input.categories)
      ? input.categories.map((c) => String(c).trim()).filter(Boolean)
      : [],
    coverUrl: String(input.coverUrl ?? '').trim(),
    coverThumb: String(input.coverThumb ?? '').trim(),
    featured: Boolean(input.featured),
    sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}
