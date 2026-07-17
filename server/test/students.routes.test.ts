import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

test('photo upload uses fixed filename and deletes previous uploaded file', async () => {
  const testUploadDir = mkdtempSync(join(tmpdir(), 'student-uploads-'))
  const app = createApp({ config: { ...config(), uploadDir: testUploadDir } })
  const photoTempDir = mkdtempSync(join(tmpdir(), 'student-photos-'))

  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token

      await request.post('/students').set('Authorization', `Bearer ${token}`).send(sampleStudent()).expect(201)

      const firstPhoto = await createTestPhoto(photoTempDir, 'first.jpg', { r: 255, g: 0, b: 0 })
      const secondPhoto = await createTestPhoto(photoTempDir, 'second.jpg', { r: 0, g: 255, b: 0 })

      const fixedDiskPath = join(testUploadDir, '2026', '2026-li-si-avatar.jpg')

      // 第一次上传
      const firstResponse = await request
        .post('/students/2026-li-si/photo')
        .set('Authorization', `Bearer ${token}`)
        .attach('photo', firstPhoto)
        .expect(200)

      assert.equal(firstResponse.body.photo, '/uploads/students/2026/2026-li-si-avatar.jpg')
      assert.ok(existsSync(fixedDiskPath), 'fixed-path avatar file should exist')

      // 模拟历史 timestamp 文件名旧照片
      const oldRelativePath = '2026/2026-li-si-avatar-1234567890.jpg'
      const oldDiskPath = join(testUploadDir, oldRelativePath)
      writeFileSync(oldDiskPath, Buffer.from('old photo'))

      await request
        .put('/students/2026-li-si')
        .set('Authorization', `Bearer ${token}`)
        .send(sampleStudent({ photo: `/uploads/students/${oldRelativePath.replace(/\\/g, '/')}` }))
        .expect(200)

      // 第二次上传应覆盖固定路径文件并删除旧 timestamp 文件
      const secondResponse = await request
        .post('/students/2026-li-si/photo')
        .set('Authorization', `Bearer ${token}`)
        .attach('photo', secondPhoto)
        .expect(200)

      assert.equal(secondResponse.body.photo, '/uploads/students/2026/2026-li-si-avatar.jpg')
      assert.ok(existsSync(fixedDiskPath), 'new avatar file should still exist at fixed path')
      assert.ok(!existsSync(oldDiskPath), 'old timestamp-named photo file should be deleted')
    })
  } finally {
    rmSync(testUploadDir, { recursive: true, force: true })
    rmSync(photoTempDir, { recursive: true, force: true })
  }
})
