import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../src/index.js'
import { hashPassphrase } from '../src/auth.js'
import type { ServerConfig, StudentRecord } from '../src/types.js'

function config(): ServerConfig {
  return {
    port: 3001,
    adminPassHash: hashPassphrase('secret-passphrase'),
    jwtSecret: 'test-secret',
    sqlitePath: ':memory:',
    corsOrigin: '*',
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

async function login(app: ReturnType<typeof createApp>) {
  const response = await request(app).post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)
  return response.body.token as string
}

test('student routes list, create, update, and delete records', async () => {
  const app = createApp({ config: config() })
  const token = await login(app)

  await request(app).get('/students').expect(200).expect([])

  const created = await request(app)
    .post('/students')
    .set('Authorization', `Bearer ${token}`)
    .send(sampleStudent())
    .expect(201)
  assert.equal(created.body.id, '2026-li-si')

  const listed = await request(app).get('/students').expect(200)
  assert.equal(listed.body.length, 1)

  const updated = await request(app)
    .put('/students/2026-li-si')
    .set('Authorization', `Bearer ${token}`)
    .send(sampleStudent({ name: 'Li Si Updated' }))
    .expect(200)
  assert.equal(updated.body.name, 'Li Si Updated')

  await request(app).delete('/students/2026-li-si').set('Authorization', `Bearer ${token}`).expect(204)
  await request(app).get('/students').expect(200).expect([])
})

test('student write routes reject missing auth and invalid records', async () => {
  const app = createApp({ config: config() })
  const token = await login(app)

  await request(app).post('/students').send(sampleStudent()).expect(401)
  await request(app)
    .post('/students')
    .set('Authorization', `Bearer ${token}`)
    .send(sampleStudent({ email: '' }))
    .expect(400)
})

test('student update and delete return 404 for unknown records', async () => {
  const app = createApp({ config: config() })
  const token = await login(app)

  await request(app).put('/students/missing').set('Authorization', `Bearer ${token}`).send(sampleStudent()).expect(404)
  await request(app).delete('/students/missing').set('Authorization', `Bearer ${token}`).expect(404)
})
