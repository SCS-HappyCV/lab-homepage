import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../src/index.js'
import { createAuthService, hashPassphrase } from '../src/auth.js'
import type { ServerConfig } from '../src/types.js'

function config(): ServerConfig {
  return {
    port: 3001,
    adminPassHash: hashPassphrase('secret-passphrase'),
    jwtSecret: 'test-secret',
    sqlitePath: ':memory:',
    corsOrigin: '*',
  }
}

test('hashPassphrase creates a stable sha256 digest', () => {
  assert.equal(hashPassphrase('abc'), hashPassphrase('abc'))
  assert.notEqual(hashPassphrase('abc'), 'abc')
})

test('auth service signs and verifies admin tokens', () => {
  const auth = createAuthService(config())

  const token = auth.login('secret-passphrase')

  assert.equal(typeof token, 'string')
  assert.equal(auth.verifyToken(token), true)
  assert.equal(auth.verifyToken(`${token}x`), false)
})

test('POST /auth/login accepts the correct passphrase and rejects a wrong one', async () => {
  const app = createApp({ config: config() })

  const ok = await request(app).post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)
  assert.equal(typeof ok.body.token, 'string')

  await request(app).post('/auth/login').send({ password: 'wrong' }).expect(401)
})

test('GET /auth/me requires a valid bearer token', async () => {
  const app = createApp({ config: config() })
  const login = await request(app).post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)

  await request(app).get('/auth/me').expect(401)
  await request(app).get('/auth/me').set('Authorization', `Bearer ${login.body.token}`).expect(200)
})
