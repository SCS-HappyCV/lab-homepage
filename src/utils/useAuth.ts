import { ref } from 'vue'
import { memberApi } from './api'

const STORAGE_KEY = 'lab-member-auth'

const isMember = ref(false)
const authLoaded = ref(false)

function init() {
  if (authLoaded.value) return

  try {
    isMember.value = localStorage.getItem(STORAGE_KEY) === '1' || Boolean(memberApi.getToken())
  } catch {
    isMember.value = Boolean(memberApi.getToken())
  }

  authLoaded.value = true
}

export function useAuth() {
  init()

  async function verify(inputPassword: string): Promise<boolean> {
    try {
      await memberApi.login(inputPassword)
      isMember.value = true
      try {
        localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        // Ignore unavailable browser storage.
      }
      return true
    } catch {
      return false
    }
  }

  function logout() {
    isMember.value = false
    memberApi.clearToken()
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore unavailable browser storage.
    }
  }

  return { isMember, verify, logout }
}
