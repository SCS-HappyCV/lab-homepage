import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthService, hashPassphrase } from '../src/auth.js'
import { createApp } from '../src/index.js'
import { withTestAgent } from './test-utils.js'
import type { ServerConfig } from '../src/types.js'

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

test('hashPassphrase creates a stable sha256 digest', () => {
  assert.equal(hashPassphrase('abc'), hashPassphrase('abc'))
  assert.notEqual(hashPassphrase('abc'), 'abc')
})

test('auth service signs and verifies admin tokens', () => {
  const auth = createAuthService(config())

  const token = auth.login('secret-passphrase')

  assert.ok(token, 'login should return a token')
  assert.equal(auth.verifyToken(token), true)
  assert.equal(auth.verifyToken(`${token}x`), false)
})

test('POST /auth/login accepts the correct passphrase and rejects a wrong one', async () => {
  const app = createApp({ config: config() })

  await withTestAgent(app, async (request) => {
    const ok = await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)
    assert.equal(typeof ok.body.token, 'string')

    await request.post('/auth/login').send({ password: 'wrong' }).expect(401)
  })
})

test('GET /auth/me requires a valid bearer token', async () => {
  const app = createApp({ config: config() })

  await withTestAgent(app, async (request) => {
    const login = await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)

    await request.get('/auth/me').expect(401)
    await request.get('/auth/me').set('Authorization', `Bearer ${login.body.token}`).expect(200)
  })
})
