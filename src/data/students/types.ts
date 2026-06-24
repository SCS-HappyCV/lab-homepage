export type StudentStatus = 'current' | 'alumni'

export interface StudentProfile {
  id: string
  name: string
  cohort: string
  degree: string
  role: string
  status: StudentStatus
  research: string[]
  email: string
  phone?: string
  wechat?: string
  nativePlace?: string
  photo?: string
  destination?: string
  bio: string
  achievements: string[]
  experiences: string[]
}
