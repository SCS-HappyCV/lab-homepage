export type StudentStatus = 'current' | 'alumni'

export interface StudentRecord {
  id: string
  name: string
  cohort: string
  degree: string
  status: StudentStatus
  research: string[]
  email: string
  phone?: string
  wechat?: string
  nativePlace?: string
  birthDate?: string
  photo?: string
  coverPhoto?: string
  destination?: string
  advisor: string
  bio: string
  achievements: string[]
  experiences: string[]
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ServerConfig {
  port: number
  adminPassHash: string
  jwtSecret: string
  sqlitePath: string
  corsOrigin: string
  uploadDir: string
}
