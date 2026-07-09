import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../src/index.js'

test('GET /health returns service status', async () => {
  const app = createApp()

  const response = await request(app).get('/health').expect(200)

  assert.equal(response.body.ok, true)
  assert.equal(response.body.service, 'lab-homepage-api')
})
