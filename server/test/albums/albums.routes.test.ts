import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { createApp } from '../../src/index.js'
import { hashPassphrase } from '../../src/auth.js'
import { withTestAgent } from '../test-utils.js'
import type { ServerConfig } from '../../src/types.js'

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 3001,
    adminPassHash: hashPassphrase('secret-passphrase'),
    jwtSecret: 'test-secret',
    sqlitePath: ':memory:',
    corsOrigin: '*',
    uploadDir: '/tmp/lab-homepage-test-uploads',
    albumUploadDir: '/tmp/lab-homepage-test-albums',
    ...overrides,
  }
}

async function makeTestJpeg(directory: string, filename: string, background = { r: 10, g: 20, b: 30 }) {
  const filePath = join(directory, filename)
  await sharp({ create: { width: 800, height: 600, channels: 3, background } })
    .jpeg().toFile(filePath)
  return filePath
}

test('album reads are public; writes require auth', async () => {
  const app = createApp({ config: config() })
  await withTestAgent(app, async (request) => {
    await request.get('/albums').expect(200).expect([])
    await request.post('/albums').send({ title: 'X', year: '2026' }).expect(401)
  })
})

test('create album returns 201 with generated id', async () => {
  const app = createApp({ config: config() })
  await withTestAgent(app, async (request) => {
    const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
    const res = await request.post('/albums')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '毕业合影', year: '2026', categories: ['毕业照'] })
      .expect(201)
    assert.match(res.body.id, /^album-[0-9a-f]{6}$/, '中文标题剥离后回退 album- 前缀')
    assert.equal(res.body.title, '毕业合影')
  })
})

test('batch upload compresses, makes webp thumbnails, and lists photos', async () => {
  const albumDir = mkdtempSync(join(tmpdir(), 'album-uploads-'))
  const scratch = mkdtempSync(join(tmpdir(), 'album-scratch-'))
  const app = createApp({ config: config({ albumUploadDir: albumDir }) })
  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
      const created = await request.post('/albums').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Summer', year: '2025' }).expect(201)
      const albumId = created.body.id

      const p1 = await makeTestJpeg(scratch, 'first.jpg', { r: 200, g: 0, b: 0 })
      const p2 = await makeTestJpeg(scratch, 'second.jpg', { r: 0, g: 200, b: 0 })
      const upload = await request.post(`/albums/${albumId}/photos`)
        .set('Authorization', `Bearer ${token}`)
        .attach('photos', p1)
        .attach('photos', p2)
        .expect(201)

      assert.equal(upload.body.photos.length, 2)
      const album = await request.get(`/albums/${albumId}`).expect(200)
      assert.equal(album.body.photos.length, 2)
      assert.match(album.body.photos[0].imageUrl, /^\/uploads\/albums\/.+\/first-\d+\.jpg$/)
      assert.match(album.body.photos[0].thumbUrl, /^\/uploads\/albums\/.+\/thumbs\/first-\d+\.webp$/)

      // 磁盘文件存在
      const firstRel = album.body.photos[0].imageUrl.replace('/uploads/albums/', '')
      const thumbRel = album.body.photos[0].thumbUrl.replace('/uploads/albums/', '')
      assert.ok(existsSync(join(albumDir, firstRel)), 'original should exist')
      assert.ok(existsSync(join(albumDir, thumbRel)), 'thumbnail should exist')

      // 列表 photosCount
      const list = await request.get('/albums').expect(200)
      assert.equal(list.body[0].photosCount, 2)
    })
  } finally {
    rmSync(albumDir, { recursive: true, force: true })
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('batch upload rejects unsupported type and leaves no partial files', async () => {
  const albumDir = mkdtempSync(join(tmpdir(), 'album-uploads-'))
  const scratch = mkdtempSync(join(tmpdir(), 'album-scratch-'))
  const app = createApp({ config: config({ albumUploadDir: albumDir }) })
  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
      const created = await request.post('/albums').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Mix', year: '2025' }).expect(201)
      const albumId = created.body.id

      const good = await makeTestJpeg(scratch, 'good.jpg')
      const bad = join(scratch, 'bad.txt')
      writeFileSync(bad, 'not an image')

      const res = await request.post(`/albums/${albumId}/photos`)
        .set('Authorization', `Bearer ${token}`)
        .attach('photos', good)
        .attach('photos', bad, { filename: 'bad.txt', contentType: 'text/plain' })
      assert.equal(res.status, 400)

      const album = await request.get(`/albums/${albumId}`).expect(200)
      assert.equal(album.body.photos.length, 0, 'no photos should be committed')

      // 相册目录不应残留最终图片（仅有空 thumbs 目录可接受）
      const files = readdirSync(join(albumDir, albumId)).filter((f) => f !== 'thumbs')
      assert.deepEqual(files, [], 'no original files should remain')
    })
  } finally {
    rmSync(albumDir, { recursive: true, force: true })
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('uploading cover replaces it and deletes old cover files', async () => {
  const albumDir = mkdtempSync(join(tmpdir(), 'album-uploads-'))
  const scratch = mkdtempSync(join(tmpdir(), 'album-scratch-'))
  const app = createApp({ config: config({ albumUploadDir: albumDir }) })
  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
      const created = await request.post('/albums').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Cover', year: '2025' }).expect(201)
      const albumId = created.body.id

      const c1 = await makeTestJpeg(scratch, 'c1.jpg')
      const first = await request.post(`/albums/${albumId}/cover`).set('Authorization', `Bearer ${token}`)
        .attach('photo', c1).expect(200)
      const oldCoverUrl = first.body.coverUrl
      const oldCoverPath = join(albumDir, oldCoverUrl.replace('/uploads/albums/', ''))
      assert.ok(existsSync(oldCoverPath))
      const oldCoverThumbUrl = first.body.coverThumb
      const oldCoverThumbPath = join(albumDir, oldCoverThumbUrl.replace('/uploads/albums/', ''))
      assert.ok(existsSync(oldCoverThumbPath))

      const c2 = await makeTestJpeg(scratch, 'c2.jpg')
      const second = await request.post(`/albums/${albumId}/cover`).set('Authorization', `Bearer ${token}`)
        .attach('photo', c2).expect(200)
      assert.notEqual(second.body.coverUrl, oldCoverUrl)
      assert.ok(!existsSync(oldCoverPath), 'old cover original should be deleted')
      assert.ok(!existsSync(oldCoverThumbPath), 'old cover thumbnail should be deleted')
    })
  } finally {
    rmSync(albumDir, { recursive: true, force: true })
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('delete photo removes both files; delete album removes whole directory', async () => {
  const albumDir = mkdtempSync(join(tmpdir(), 'album-uploads-'))
  const scratch = mkdtempSync(join(tmpdir(), 'album-scratch-'))
  const app = createApp({ config: config({ albumUploadDir: albumDir }) })
  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
      const created = await request.post('/albums').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Del', year: '2025' }).expect(201)
      const albumId = created.body.id
      const p = await makeTestJpeg(scratch, 'p.jpg')
      const up = await request.post(`/albums/${albumId}/photos`).set('Authorization', `Bearer ${token}`)
        .attach('photos', p).expect(201)
      const photo = up.body.photos[0]
      const origPath = join(albumDir, photo.imageUrl.replace('/uploads/albums/', ''))
      const thumbPath = join(albumDir, photo.thumbUrl.replace('/uploads/albums/', ''))

      await request.delete(`/photos/${photo.id}`).set('Authorization', `Bearer ${token}`).expect(204)
      assert.ok(!existsSync(origPath))
      assert.ok(!existsSync(thumbPath))

      assert.ok(existsSync(join(albumDir, albumId)))
      await request.delete(`/albums/${albumId}`).set('Authorization', `Bearer ${token}`).expect(204)
      assert.ok(!existsSync(join(albumDir, albumId)), 'album directory should be removed')
    })
  } finally {
    rmSync(albumDir, { recursive: true, force: true })
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('reorder updates photo order; caption update works', async () => {
  const albumDir = mkdtempSync(join(tmpdir(), 'album-uploads-'))
  const scratch = mkdtempSync(join(tmpdir(), 'album-scratch-'))
  const app = createApp({ config: config({ albumUploadDir: albumDir }) })
  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
      const created = await request.post('/albums').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Order', year: '2025' }).expect(201)
      const albumId = created.body.id
      const a = await makeTestJpeg(scratch, 'a.jpg')
      const b = await makeTestJpeg(scratch, 'b.jpg')
      const up = await request.post(`/albums/${albumId}/photos`).set('Authorization', `Bearer ${token}`)
        .attach('photos', a).attach('photos', b).expect(201)
      const [first, second] = up.body.photos as { id: string }[]

      await request.put(`/albums/${albumId}/photos/reorder`).set('Authorization', `Bearer ${token}`)
        .send({ orderedIds: [second.id, first.id] }).expect(200)
      const album = await request.get(`/albums/${albumId}`).expect(200)
      assert.deepEqual(album.body.photos.map((p: { id: string }) => p.id), [second.id, first.id])

      await request.put(`/photos/${first.id}`).set('Authorization', `Bearer ${token}`)
        .send({ caption: '新说明' }).expect(200)
      const after = await request.get(`/albums/${albumId}`).expect(200)
      const target = after.body.photos.find((p: { id: string }) => p.id === first.id)
      assert.equal(target.caption, '新说明')
    })
  } finally {
    rmSync(albumDir, { recursive: true, force: true })
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('batch upload rolls back all produced files when thumbnail generation fails mid-batch', async () => {
  const albumDir = mkdtempSync(join(tmpdir(), 'album-uploads-'))
  const scratch = mkdtempSync(join(tmpdir(), 'album-scratch-'))
  const app = createApp({ config: config({ albumUploadDir: albumDir }) })
  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
      const created = await request.post('/albums').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Rollback', year: '2025' }).expect(201)
      const albumId = created.body.id
      const fixedTs = 1234567890123

      const originalNow = Object.getOwnPropertyDescriptor(Date, 'now')
      Object.defineProperty(Date, 'now', { value: () => fixedTs, configurable: true })

      try {
        // 预先在第二张照片的缩略图路径创建一个同名目录，
        // 使得 generateThumbnail 在 compressImage 成功后因目标为目录而抛出 EISDIR。
        const secondThumbRel = `${albumId}/thumbs/second-${fixedTs}.webp`
        mkdirSync(join(albumDir, secondThumbRel), { recursive: true })

        const first = await makeTestJpeg(scratch, 'first.jpg', { r: 200, g: 0, b: 0 })
        const second = await makeTestJpeg(scratch, 'second.jpg', { r: 0, g: 200, b: 0 })

        const res = await request.post(`/albums/${albumId}/photos`)
          .set('Authorization', `Bearer ${token}`)
          .attach('photos', first)
          .attach('photos', second)

        assert.equal(res.status, 500, 'mid-batch thumbnail failure should return 500')

        const album = await request.get(`/albums/${albumId}`).expect(200)
        assert.equal(album.body.photos.length, 0, 'no photos should be committed')

        const firstRel = `${albumId}/first-${fixedTs}.jpg`
        const firstThumbRel = `${albumId}/thumbs/first-${fixedTs}.webp`
        assert.ok(!existsSync(join(albumDir, firstRel)), 'first original should be rolled back')
        assert.ok(!existsSync(join(albumDir, firstThumbRel)), 'first thumbnail should be rolled back')
        assert.ok(!existsSync(join(albumDir, secondThumbRel)), 'second thumbnail obstruction should be rolled back')

        // raw 临时文件也应被清理；空的 thumbs 目录可接受
        const topFiles = readdirSync(join(albumDir, albumId)).filter((f) => f !== 'thumbs')
        assert.deepEqual(topFiles, [], 'no raw temp files or produced files should remain')
        const thumbsDir = join(albumDir, albumId, 'thumbs')
        if (existsSync(thumbsDir)) {
          assert.deepEqual(readdirSync(thumbsDir), [], 'thumbs directory should be empty')
        }
      } finally {
        if (originalNow) {
          Object.defineProperty(Date, 'now', originalNow)
        }
      }
    })
  } finally {
    rmSync(albumDir, { recursive: true, force: true })
    rmSync(scratch, { recursive: true, force: true })
  }
})
