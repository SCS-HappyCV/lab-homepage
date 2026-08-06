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

export interface Patent {
  id: number
  title: string
  patent_number: string
  inventors: string[]
  patent_type: '发明' | '实用新型' | '外观设计'
  pdf_path: string
  createdAt: string
  updatedAt: string
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

// 专利识别相关类型
export type PatentType = 'INVENTION' | 'UTILITY_MODEL' | 'DESIGN' | 'UNKNOWN'
export type NumberType = 'PATENT_NUMBER' | 'AUTHORIZATION_NUMBER' | 'PUBLICATION_NUMBER' | 'APPLICATION_NUMBER'

export interface FieldResult {
  value: string | string[] | null
  confidence: number
  source: string
  evidence: string
  needsReview: boolean
  conflicts: any[]
}

export interface PatentNumberFieldResult extends FieldResult {
  numberType: NumberType | null
  candidates: { value: string; numberType: string; label: string }[]
}

export interface RecognitionWarning {
  field: string
  code: string
  message: string
}

export interface RecognizeResponse {
  recognitionId: string
  fileId: string
  fileName: string
  fileSize: number
  recognitionStatus: string
  recognitionMethod: string[]
  patentName: FieldResult
  inventors: FieldResult
  patentType: FieldResult & { displayValue: string }
  patentNumber: PatentNumberFieldResult
  needsManualReview: boolean
  warnings: RecognitionWarning[]
}

export interface ConfirmPatentRequest {
  recognitionId: string
  fileId: string
  patentName: string
  inventors: string[]
  patentType: PatentType
  patentNumber: string
  numberType: NumberType
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
      // 尝试读取后端返回的错误消息
      try {
        const errorData = await response.json()
        throw new Error(errorData.message || errorData.error || `请求失败 (${response.status})`)
      } catch (e) {
        // 如果无法解析JSON，使用默认错误消息
        if (e instanceof Error && e.message.includes('请求失败')) {
          throw e
        }
        throw new Error(`请求失败 (${response.status})`)
      }
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

    /**
     * 上传头像/背景图到临时暂存目录，不写库。
     * 返回的 photo 为 `/uploads/students/_temp/...` 临时 URL，
     * 需在保存成员时随表单提交，由后端移动到最终路径。
     */
    uploadTempPhoto(file: File, kind: 'avatar' | 'cover'): Promise<{ photo: string; originalSize: number; compressedSize: number; saved: boolean }> {
      if (!normalizedBaseUrl) {
        return Promise.reject(new Error('VITE_API_BASE_URL is not configured'))
      }

      const formData = new FormData()
      formData.append('photo', file)
      formData.append('kind', kind)

      return fetchImpl(`${normalizedBaseUrl}/students/temp-photo`, {
        method: 'POST',
        headers: {
          Authorization: storage.getToken() ? `Bearer ${storage.getToken()}` : '',
        },
        body: formData,
      }).then((response) => {
        if (!response.ok) {
          return response.json().catch(() => ({ error: 'Upload failed' })).then((error) => {
            throw new Error(error.error || `Upload failed with ${response.status}`)
          })
        }
        return response.json()
      })
    },

    // 专利相关API
    listPatents(page: number = 1, pageSize: number = 10) {
      return requestJson<PaginatedResult<Patent>>(`/patents?page=${page}&pageSize=${pageSize}`)
    },

    getPatent(id: number) {
      return requestJson<Patent>(`/patents/${id}`)
    },

    getPatentDownloadUrl(id: number): string {
      return `${normalizedBaseUrl}/patents/${id}/download`
    },

    getPatentPreviewUrl(id: number): string {
      return `${normalizedBaseUrl}/patents/${id}/preview`
    },

    deletePatent(id: string) {
      return requestJson<void>(`/patents/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },

    // 专利识别API
    async recognizePatent(file: File, signal?: AbortSignal): Promise<RecognizeResponse> {
      if (!normalizedBaseUrl) {
        throw new Error('VITE_API_BASE_URL is not configured')
      }

      console.log('Starting patent recognition...', {
        fileName: file.name,
        fileSize: file.size,
        baseUrl: normalizedBaseUrl,
      })

      const formData = new FormData()
      formData.append('file', file)

      try {
        const response = await fetchImpl(`${normalizedBaseUrl}/patents/recognize`, {
          method: 'POST',
          headers: {
            Authorization: storage.getToken() ? `Bearer ${storage.getToken()}` : '',
          },
          body: formData,
          signal,
        })

        console.log('Recognition response status:', response.status)

        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: 'Recognition failed' }))
          console.error('Recognition error:', error)
          throw new Error(error.message || `Recognition failed with ${response.status}`)
        }

        const result = await response.json()
        console.log('Recognition result:', result)
        return result.data
      } catch (err) {
        console.error('Recognition request failed:', err)
        throw err
      }
    },

    async confirmPatent(data: ConfirmPatentRequest): Promise<{ id: string }> {
      return requestJson<{ id: string }>('/patents/confirm', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    async getRecognition(id: string): Promise<any> {
      return requestJson<any>(`/patents/recognitions/${id}`)
    },

    async cancelRecognition(id: string): Promise<void> {
      return requestJson<void>(`/patents/recognitions/${id}`, {
        method: 'DELETE',
      })
    },
  }
}

export const memberApi = createMemberApi({
  baseUrl: import.meta.env?.VITE_API_BASE_URL ?? '',
  storage: browserTokenStorage(),
})
