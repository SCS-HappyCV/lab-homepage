import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../src/index.js'
import type { ServerConfig } from '../src/types.js'

function config(): ServerConfig {
  return {
    port: 3001,
    adminPassHash: '',
    jwtSecret: 'test-secret',
    sqlitePath: ':memory:',
    corsOrigin: '*',
  }
}

test('GET /health returns service status', async () => {
  const app = createApp({ config: config() })

  const response = await request(app).get('/health').expect(200)

  assert.equal(response.body.ok, true)
  assert.equal(response.body.service, 'lab-homepage-api')
})
