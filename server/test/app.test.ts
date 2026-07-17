import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/index.js'
import { withTestAgent } from './test-utils.js'
import type { ServerConfig } from '../src/types.js'

function config(): ServerConfig {
  return {
    port: 3001,
    adminPassHash: '',
    jwtSecret: 'test-secret',
    sqlitePath: ':memory:',
    corsOrigin: '*',
    uploadDir: '/tmp/lab-homepage-test-uploads',
  }
}

test('GET /health returns service status', async () => {
  const app = createApp({ config: config() })

  await withTestAgent(app, async (request) => {
    const response = await request.get('/health').expect(200)

    assert.equal(response.body.ok, true)
    assert.equal(response.body.service, 'lab-homepage-api')
  })
})
