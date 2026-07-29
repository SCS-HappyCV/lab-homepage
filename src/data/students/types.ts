export type StudentStatus = 'current' | 'alumni'

export interface StudentProfile {
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
  bio: string
  achievements: string[]
  experiences: string[]
}
