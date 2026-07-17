import http from 'node:http'
import type { Express } from 'express'
import request from 'supertest'

export interface TestAgent {
  agent: request.SuperTest<request.Test>
  server: http.Server
}

export async function createTestAgent(app: Express): Promise<TestAgent> {
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  return { agent: request(server), server }
}

export async function withTestAgent(app: Express, callback: (agent: request.SuperTest<request.Test>) => Promise<void>): Promise<void> {
  const { agent, server } = await createTestAgent(app)
  try {
    await callback(agent)
  } finally {
    server.close()
  }
}
