import type { StudentProfile } from '../data/students/types'

const TOKEN_KEY = 'lab-member-admin-token'

export interface TokenStorage {
  getToken(): string
  setToken(token: string): void
  clearToken(): void
}

export interface MemberApiOptions {
  baseUrl: string
  storage: TokenStorage
  fetchImpl?: typeof fetch
}

export function browserTokenStorage(): TokenStorage {
  return {
    getToken() {
      try {
        return localStorage.getItem(TOKEN_KEY) ?? ''
      } catch {
        return ''
      }
    },
    setToken(token) {
      try {
        localStorage.setItem(TOKEN_KEY, token)
      } catch {
        // Storage can be unavailable in privacy modes.
      }
    },
    clearToken() {
      try {
        localStorage.removeItem(TOKEN_KEY)
      } catch {
        // Storage can be unavailable in privacy modes.
      }
    },
  }
}

export function memoryTokenStorage(initialToken = ''): TokenStorage {
  let token = initialToken

  return {
    getToken: () => token,
    setToken: (nextToken) => {
      token = nextToken
    },
    clearToken: () => {
      token = ''
    },
  }
}

export function createMemberApi({ baseUrl, storage, fetchImpl = fetch }: MemberApiOptions) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')

  async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!normalizedBaseUrl) {
      throw new Error('VITE_API_BASE_URL is not configured')
    }

    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(storage.getToken() ? { Authorization: `Bearer ${storage.getToken()}` } : {}),
        ...(init.headers ?? {}),
      },
    })

    if (!response.ok) {
      throw new Error(`API request failed with ${response.status}`)
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return {
    getToken: storage.getToken,
    clearToken: storage.clearToken,

    async login(password: string) {
      const result = await requestJson<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      storage.setToken(result.token)
    },

    async verifyToken() {
      await requestJson<{ ok: boolean }>('/auth/me')
    },

    listStudents() {
      return requestJson<StudentProfile[]>('/students')
    },

    createStudent(member: StudentProfile) {
      return requestJson<StudentProfile>('/students', {
        method: 'POST',
        body: JSON.stringify(member),
      })
    },

    updateStudent(id: string, member: StudentProfile) {
      return requestJson<StudentProfile>(`/students/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(member),
      })
    },

    deleteStudent(id: string) {
      return requestJson<void>(`/students/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },

    async uploadPhoto(memberId: string, file: File): Promise<{ photo: string; originalSize: number; compressedSize: number; saved: boolean }> {
      if (!normalizedBaseUrl) {
        throw new Error('VITE_API_BASE_URL is not configured')
      }

      const formData = new FormData()
      formData.append('photo', file)

      const response = await fetchImpl(`${normalizedBaseUrl}/students/${encodeURIComponent(memberId)}/photo`, {
        method: 'POST',
        headers: {
          Authorization: storage.getToken() ? `Bearer ${storage.getToken()}` : '',
        },
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(error.error || `Upload failed with ${response.status}`)
      }

      return response.json()
    },

    async uploadCoverPhoto(memberId: string, file: File): Promise<{ photo: string; originalSize: number; compressedSize: number; saved: boolean }> {
      if (!normalizedBaseUrl) {
        throw new Error('VITE_API_BASE_URL is not configured')
      }

      const formData = new FormData()
      formData.append('photo', file)

      const response = await fetchImpl(`${normalizedBaseUrl}/students/${encodeURIComponent(memberId)}/cover-photo`, {
        method: 'POST',
        headers: {
          Authorization: storage.getToken() ? `Bearer ${storage.getToken()}` : '',
        },
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(error.error || `Upload failed with ${response.status}`)
      }

      return response.json()
    },
  }
}

export const memberApi = createMemberApi({
  baseUrl: import.meta.env?.VITE_API_BASE_URL ?? '',
  storage: browserTokenStorage(),
})
