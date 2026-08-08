import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { initDatabase } from '../../src/db.js'
import { createAlbumRepository, AlbumValidationError } from '../../src/albums/albums.repo.js'
import type { AlbumInput } from '../../src/albums/types.js'

function createTestRepo() {
  const db = new DatabaseSync(':memory:')
  initDatabase(db)
  return createAlbumRepository(db)
}

function sampleInput(overrides: Partial<AlbumInput> = {}): AlbumInput {
  return {
    title: '2026 届毕业合影',
    year: '2026',
    date: '2026-06',
    location: '湘潭大学',
    description: '毕业照',
    categories: ['毕业照'],
    featured: true,
    sortOrder: 0,
    ...overrides,
  }
}

test('create and list return photosCount without photos array', () => {
  const repo = createTestRepo()
  const created = repo.create('2026-graduation', sampleInput())
  assert.equal(created.id, '2026-graduation')
  assert.deepEqual(created.categories, ['毕业照'])
  assert.equal(created.featured, true)

  const list = repo.list()
  assert.equal(list.length, 1)
  assert.equal(list[0].photosCount, 0)
  assert.equal('photos' in list[0], false)
})

test('get returns album with photos sorted by sortOrder then createdAt', () => {
  const repo = createTestRepo()
  repo.create('a1', sampleInput())
  repo.addPhotos('a1', [
    { imageUrl: '/uploads/albums/a1/b-2.jpg', thumbUrl: '/uploads/albums/a1/thumbs/b-2.webp', caption: '二' },
    { imageUrl: '/uploads/albums/a1/a-1.jpg', thumbUrl: '/uploads/albums/a1/thumbs/a-1.webp', caption: '一' },
  ])

  const album = repo.get('a1')
  assert.ok(album)
  assert.equal(album!.photos.length, 2)
  assert.equal(album!.photos[0].caption, '二') // sortOrder 0
  assert.equal(album!.photos[1].caption, '一')
  assert.equal(repo.list()[0].photosCount, 2)
})

test('addPhotos appends sortOrder after existing photos', () => {
  const repo = createTestRepo()
  repo.create('a1', sampleInput())
  repo.addPhotos('a1', [{ imageUrl: '/x1.jpg', thumbUrl: '/t1.webp' }])
  repo.addPhotos('a1', [{ imageUrl: '/x2.jpg', thumbUrl: '/t2.webp' }])
  const photos = repo.get('a1')!.photos
  assert.deepEqual(photos.map((p) => p.sortOrder), [0, 1])
})

test('update changes metadata and bumps updatedAt', () => {
  const repo = createTestRepo()
  const created = repo.create('a1', sampleInput())
  const updated = repo.update('a1', { ...sampleInput(), title: '新标题', location: '长沙' })
  assert.ok(updated)
  assert.equal(updated!.title, '新标题')
  assert.equal(updated!.location, '长沙')
  assert.ok(Number.isNaN(Date.parse(updated!.updatedAt)) === false)
  // 更新不应清空已存在的封面
  assert.equal(updated!.coverUrl, created.coverUrl)
})

test('update returns null for unknown album', () => {
  const repo = createTestRepo()
  assert.equal(repo.update('missing', sampleInput()), null)
})

test('delete cascades photos', () => {
  const repo = createTestRepo()
  repo.create('a1', sampleInput())
  repo.addPhotos('a1', [{ imageUrl: '/x.jpg', thumbUrl: '/t.webp' }])
  assert.equal(repo.delete('a1'), true)
  assert.equal(repo.get('a1'), null)
})

test('reorderPhotos reassigns sortOrder by provided id order', () => {
  const repo = createTestRepo()
  repo.create('a1', sampleInput())
  const added = repo.addPhotos('a1', [
    { imageUrl: '/1.jpg', thumbUrl: '/1.webp' },
    { imageUrl: '/2.jpg', thumbUrl: '/2.webp' },
    { imageUrl: '/3.jpg', thumbUrl: '/3.webp' },
  ])
  const reordered = [added[2].id, added[0].id, added[1].id]
  assert.equal(repo.reorderPhotos('a1', reordered), true)
  const photos = repo.get('a1')!.photos
  assert.deepEqual(photos.map((p) => p.id), reordered)
  assert.deepEqual(photos.map((p) => p.sortOrder), [0, 1, 2])
})

test('reorderPhotos rejects duplicate ids and preserves original order', () => {
  const repo = createTestRepo()
  repo.create('a1', sampleInput())
  const added = repo.addPhotos('a1', [
    { imageUrl: '/1.jpg', thumbUrl: '/1.webp' },
    { imageUrl: '/2.jpg', thumbUrl: '/2.webp' },
    { imageUrl: '/3.jpg', thumbUrl: '/3.webp' },
  ])
  const originalOrder = added.map((p) => p.id)
  const dupOrder = [added[0].id, added[0].id, added[1].id]
  assert.equal(repo.reorderPhotos('a1', dupOrder), false)
  const photos = repo.get('a1')!.photos
  assert.deepEqual(photos.map((p) => p.id), originalOrder)
  assert.deepEqual(photos.map((p) => p.sortOrder), [0, 1, 2])
})

test('updatePhotoCaption and deletePhoto work', () => {
  const repo = createTestRepo()
  repo.create('a1', sampleInput())
  const [photo] = repo.addPhotos('a1', [{ imageUrl: '/x.jpg', thumbUrl: '/t.webp', caption: '旧' }])
  const updated = repo.updatePhotoCaption(photo.id, '新 caption')
  assert.equal(updated?.caption, '新 caption')
  const deleted = repo.deletePhoto(photo.id)
  assert.equal(deleted?.id, photo.id)
  assert.equal(repo.getPhoto(photo.id), null)
})

test('create rejects blank title or year', () => {
  const repo = createTestRepo()
  assert.throws(() => repo.create('a1', sampleInput({ title: '  ' })), AlbumValidationError)
  assert.throws(() => repo.create('a2', sampleInput({ year: '' })), AlbumValidationError)
})
