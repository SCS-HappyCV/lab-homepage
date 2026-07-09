import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemberApi, memoryTokenStorage } from '../src/utils/api.js'
import type { StudentProfile } from '../src/data/students/types.js'

const sampleStudent: StudentProfile = {
  id: '2026-a',
  name: 'Li Si',
  cohort: '2026',
  degree: 'Master',
  status: 'current',
  research: ['Vision'],
  email: 'lisi@example.com',
  bio: 'Researches vision.',
  achievements: [],
  experiences: [],
}

test('member api stores login token and sends it on writes', async () => {
  const storage = memoryTokenStorage()
  const requests: Array<{ url: string; init: RequestInit }> = []
  const api = createMemberApi({
    baseUrl: 'https://api.example.test/',
    storage,
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: String(url), init })
      if (String(url).endsWith('/auth/login')) {
        return jsonResponse({ token: 'admin-token' })
      }
      return jsonResponse(sampleStudent)
    },
  })

  await api.login('secret')
  await api.updateStudent('2026-a', sampleStudent)

  assert.equal(storage.getToken(), 'admin-token')
  assert.equal(requests[1].url, 'https://api.example.test/students/2026-a')
  assert.equal((requests[1].init.headers as Record<string, string>).Authorization, 'Bearer admin-token')
})

test('member api lists students from the backend', async () => {
  const api = createMemberApi({
    baseUrl: 'https://api.example.test',
    storage: memoryTokenStorage(),
    fetchImpl: async () => jsonResponse([sampleStudent]),
  })

  const students = await api.listStudents()

  assert.equal(students.length, 1)
  assert.equal(students[0].id, '2026-a')
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
