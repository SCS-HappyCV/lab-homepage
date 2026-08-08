import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { createApp } from '../src/index.js'
import { hashPassphrase } from '../src/auth.js'
import { withTestAgent } from './test-utils.js'
import type { ServerConfig, StudentRecord } from '../src/types.js'

function config(): ServerConfig {
  return {
    port: 3001,
    adminPassHash: hashPassphrase('secret-passphrase'),
    jwtSecret: 'test-secret',
    sqlitePath: ':memory:',
    corsOrigin: '*',
    uploadDir: '/tmp/lab-homepage-test-uploads',
    albumUploadDir: '/tmp/lab-homepage-test-albums',
  }
}

function sampleStudent(overrides: Partial<StudentRecord> = {}): StudentRecord {
  const now = '2026-07-09T00:00:00.000Z'

  return {
    id: '2026-li-si',
    name: 'Li Si',
    cohort: '2026',
    degree: 'Master',
    status: 'current',
    research: ['Vision'],
    email: 'lisi@example.com',
    phone: '',
    wechat: '',
    nativePlace: '',
    photo: '',
    destination: '',
    advisor: '周维',
    bio: 'Researches vision.',
    achievements: [],
    experiences: [],
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

test('student routes list, create, update, and delete records', async () => {
  const app = createApp({ config: config() })

  await withTestAgent(app, async (request) => {
    const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token

    await request.get('/students').expect(200).expect([])

    const created = await request
      .post('/students')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleStudent())
      .expect(201)
    assert.equal(created.body.id, '2026-li-si')

    const listed = await request.get('/students').expect(200)
    assert.equal(listed.body.length, 1)

    const updated = await request
      .put('/students/2026-li-si')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleStudent({ name: 'Li Si Updated' }))
      .expect(200)
    assert.equal(updated.body.name, 'Li Si Updated')

    await request.delete('/students/2026-li-si').set('Authorization', `Bearer ${token}`).expect(204)
    await request.get('/students').expect(200).expect([])
  })
})

test('student write routes reject missing auth and invalid records', async () => {
  const app = createApp({ config: config() })

  await withTestAgent(app, async (request) => {
    const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token

    await request.post('/students').send(sampleStudent()).expect(401)
    await request
      .post('/students')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleStudent({ email: '' }))
      .expect(400)
  })
})

test('student update and delete return 404 for unknown records', async () => {
  const app = createApp({ config: config() })

  await withTestAgent(app, async (request) => {
    const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token

    await request.put('/students/missing').set('Authorization', `Bearer ${token}`).send(sampleStudent()).expect(404)
    await request.delete('/students/missing').set('Authorization', `Bearer ${token}`).expect(404)
  })
})

async function createTestPhoto(directory: string, filename: string, background: { r: number; g: number; b: number }) {
  const buffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background,
    },
  })
    .jpeg()
    .toBuffer()

  const filePath = join(directory, filename)
  writeFileSync(filePath, buffer)
  return filePath
}

test('temp photo upload stages file without writing database, then save commits it', async () => {
  const testUploadDir = mkdtempSync(join(tmpdir(), 'student-uploads-'))
  const app = createApp({ config: { ...config(), uploadDir: testUploadDir } })
  const photoTempDir = mkdtempSync(join(tmpdir(), 'student-photos-'))

  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token

      const photoPath = await createTestPhoto(photoTempDir, 'first.jpg', { r: 255, g: 0, b: 0 })

      // 临时上传：返回 _temp 路径，数据库中尚无任何学生/照片字段
      const tempResponse = await request
        .post('/students/temp-photo')
        .set('Authorization', `Bearer ${token}`)
        .field('kind', 'avatar')
        .attach('photo', photoPath)
        .expect(200)

      const tempUrl: string = tempResponse.body.photo
      assert.match(tempUrl, /^\/uploads\/students\/_temp\/[0-9a-f]+-avatar\.jpg$/)
      const tempDiskPath = join(testUploadDir, '_temp', tempUrl.split('/').pop()!)
      assert.ok(existsSync(tempDiskPath), 'staged file should exist')

      assert.equal((await request.get('/students')).body.length, 0, 'temp upload must not create a student')

      // 新建成员并携带临时 URL：保存后移动到带时间戳的最终路径，临时文件消失
      const created = await request
        .post('/students')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleStudent({ photo: tempUrl }))
        .expect(201)

      assert.match(created.body.photo, /^\/uploads\/students\/2026\/2026-li-si-avatar-\d+\.jpg$/)
      const finalDiskPath = join(testUploadDir, '2026', created.body.photo.split('/').pop()!)
      assert.ok(existsSync(finalDiskPath), 'final avatar file should exist')
      assert.ok(!existsSync(tempDiskPath), 'staged file should be removed after commit')
    })
  } finally {
    rmSync(testUploadDir, { recursive: true, force: true })
    rmSync(photoTempDir, { recursive: true, force: true })
  }
})

test('saving a member replaces staged photo and deletes the previous file', async () => {
  const testUploadDir = mkdtempSync(join(tmpdir(), 'student-uploads-'))
  const app = createApp({ config: { ...config(), uploadDir: testUploadDir } })
  const photoTempDir = mkdtempSync(join(tmpdir(), 'student-photos-'))

  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token

      await request.post('/students').set('Authorization', `Bearer ${token}`).send(sampleStudent()).expect(201)

      // 先给成员配上一张旧头像（模拟历史 timestamp 命名文件，与最终固定路径不同）
      const oldRelativePath = '2026/2026-li-si-avatar-old.jpg'
      const oldDiskPath = join(testUploadDir, oldRelativePath)
      mkdirSync(join(testUploadDir, '2026'), { recursive: true })
      writeFileSync(oldDiskPath, Buffer.from('old photo'))
      await request
        .put('/students/2026-li-si')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleStudent({ photo: `/uploads/students/${oldRelativePath.replace(/\\/g, '/')}` }))
        .expect(200)

      // 上传新的临时头像
      const newPhotoPath = await createTestPhoto(photoTempDir, 'new.jpg', { r: 0, g: 255, b: 0 })
      const tempResponse = await request
        .post('/students/temp-photo')
        .set('Authorization', `Bearer ${token}`)
        .field('kind', 'avatar')
        .attach('photo', newPhotoPath)
        .expect(200)

      // 保存替换：生成新的带时间戳文件名，旧文件被删除
      const updated = await request
        .put('/students/2026-li-si')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleStudent({ photo: tempResponse.body.photo }))
        .expect(200)

      assert.match(updated.body.photo, /^\/uploads\/students\/2026\/2026-li-si-avatar-\d+\.jpg$/)
      const finalDiskPath = join(testUploadDir, '2026', updated.body.photo.split('/').pop()!)
      assert.ok(existsSync(finalDiskPath), 'final avatar should exist')
      assert.ok(!existsSync(oldDiskPath), 'previous avatar file should be deleted')
    })
  } finally {
    rmSync(testUploadDir, { recursive: true, force: true })
    rmSync(photoTempDir, { recursive: true, force: true })
  }
})

test('saving with an empty photo field removes the previous file from disk', async () => {
  const testUploadDir = mkdtempSync(join(tmpdir(), 'student-uploads-'))
  const app = createApp({ config: { ...config(), uploadDir: testUploadDir } })

  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token

      await request.post('/students').set('Authorization', `Bearer ${token}`).send(sampleStudent()).expect(201)

      const oldRelativePath = '2026/2026-li-si-avatar.jpg'
      const oldDiskPath = join(testUploadDir, oldRelativePath)
      mkdirSync(join(testUploadDir, '2026'), { recursive: true })
      writeFileSync(oldDiskPath, Buffer.from('old photo'))
      await request
        .put('/students/2026-li-si')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleStudent({ photo: `/uploads/students/${oldRelativePath.replace(/\\/g, '/')}` }))
        .expect(200)

      // 移除头像：保存空 photo 字段，旧文件应被删除
      const updated = await request
        .put('/students/2026-li-si')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleStudent({ photo: '' }))
        .expect(200)

      assert.equal(updated.body.photo ?? '', '')
      assert.ok(!existsSync(oldDiskPath), 'removed avatar file should be deleted from disk')
    })
  } finally {
    rmSync(testUploadDir, { recursive: true, force: true })
  }
})

test('temp photo upload rejects files larger than 5MB via error middleware', async () => {
  const testUploadDir = mkdtempSync(join(tmpdir(), 'student-uploads-'))
  const app = createApp({ config: { ...config(), uploadDir: testUploadDir } })

  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token

      const oversized = Buffer.alloc(6 * 1024 * 1024, 0)
      const response = await request
        .post('/students/temp-photo')
        .set('Authorization', `Bearer ${token}`)
        .field('kind', 'avatar')
        .attach('photo', oversized, { filename: 'big.jpg', contentType: 'image/jpeg' })

      assert.equal(response.status, 400)
      assert.match(String(response.body.error), /文件大小超过限制/)
    })
  } finally {
    rmSync(testUploadDir, { recursive: true, force: true })
  }
})
