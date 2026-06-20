import type { StudentProfile } from './types'

export { studentPhoto } from './helpers'
export type { StudentProfile, StudentStatus } from './types'

const modules = import.meta.glob<{ default: StudentProfile[] }>('./years/*.ts', { eager: true })

export const studentProfiles = Object.keys(modules)
  .sort((a, b) => b.localeCompare(a))
  .flatMap((path) => modules[path].default)

export const cohortOrder = Array.from(new Set(studentProfiles.map((member) => member.cohort))).sort((a, b) =>
  b.localeCompare(a),
)
