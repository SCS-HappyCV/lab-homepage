import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  slugifyImageName,
  generateAlbumPhotoPath,
  generateAlbumCoverPath,
  thumbnailPathFor,
  generateThumbnail,
} from '../../src/image-utils.js'

test('slugifyImageName strips extension, non-ASCII, and collapses to ascii slug', () => {
  assert.equal(slugifyImageName('DSC_1795.JPG'), 'dsc_1795')
  assert.equal(slugifyImageName('毕业合影 2026.png'), '2026')
  assert.equal(slugifyImageName('中文纯名称.webp'), 'photo')
  assert.equal(slugifyImageName('My Photo (1).jpg'), 'my-photo-1')
  assert.equal(slugifyImageName('a'.repeat(60) + '.jpg').length, 40)
})

test('generateAlbumPhotoPath uses slug and timestamp suffix', () => {
  const rel = generateAlbumPhotoPath('2026-graduation', 'DSC_1795.JPG', 1700000000000)
  assert.equal(rel, join('2026-graduation', 'dsc_1795-1700000000000.jpg'))
})

test('generateAlbumCoverPath uses fixed cover slug', () => {
  const rel = generateAlbumCoverPath('2026-graduation', 1700000000000)
  assert.equal(rel, join('2026-graduation', 'cover-1700000000000.jpg'))
})

test('thumbnailPathFor maps image to thumbs webp', () => {
  assert.equal(
    thumbnailPathFor(join('2026-graduation', 'dsc_1795-1.jpg')),
    join('2026-graduation', 'thumbs', 'dsc_1795-1.webp'),
  )
})

test('generateThumbnail writes a webp thumbnail under 960px', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'album-thumb-'))
  try {
    const src = join(dir, 'big.jpg')
    await sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .jpeg().toFile(src)

    const dest = join(dir, 'thumbs', 'big.webp')
    await generateThumbnail(src, dest)

    assert.ok(existsSync(dest), 'thumbnail file should exist')
    const meta = await sharp(dest).metadata()
    assert.equal(meta.format, 'webp')
    assert.ok((meta.width ?? 0) <= 960)
    assert.ok((meta.height ?? 0) <= 960)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
