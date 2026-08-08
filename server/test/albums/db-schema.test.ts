import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { initDatabase } from '../../src/db.js'

function freshDb() {
  const db = new DatabaseSync(':memory:')
  initDatabase(db)
  return db
}

test('initDatabase creates albums and photos tables with camelCase columns', () => {
  const db = freshDb()
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
  const names = tables.map((t) => t.name)
  assert.ok(names.includes('albums'), 'albums table should exist')
  assert.ok(names.includes('photos'), 'photos table should exist')

  const albumCols = db.prepare(`PRAGMA table_info(albums)`).all() as { name: string }[]
  assert.ok(albumCols.some((c) => c.name === 'coverUrl'))
  assert.ok(albumCols.some((c) => c.name === 'coverThumb'))
  assert.ok(albumCols.some((c) => c.name === 'sortOrder'))
  assert.ok(albumCols.some((c) => c.name === 'createdAt'))

  const photoCols = db.prepare(`PRAGMA table_info(photos)`).all() as { name: string }[]
  assert.ok(photoCols.some((c) => c.name === 'albumId'))
  assert.ok(photoCols.some((c) => c.name === 'imageUrl'))
  assert.ok(photoCols.some((c) => c.name === 'thumbUrl'))
  assert.ok(photoCols.some((c) => c.name === 'sortOrder'))
})

test('deleting an album cascades to its photos when foreign keys are on', () => {
  const db = freshDb()
  db.prepare(`INSERT INTO albums (id, title, year, date, location, description, categories, coverUrl, coverThumb, featured, sortOrder, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('a1', 'A', '2026', '', '', '', '[]', '', '', 0, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
  db.prepare(`INSERT INTO photos (id, albumId, imageUrl, thumbUrl, caption, sortOrder, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run('p1', 'a1', '/img.jpg', '/t.webp', '', 0, '2026-01-01T00:00:00Z')

  db.prepare('DELETE FROM albums WHERE id = ?').run('a1')
  const remaining = db.prepare('SELECT COUNT(*) AS n FROM photos').get() as { n: number }
  assert.equal(remaining.n, 0, 'photos should be cascade-deleted')
})
