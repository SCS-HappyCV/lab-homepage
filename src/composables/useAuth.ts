import { ref } from 'vue'

const STORAGE_KEY = 'lab-member-auth'

/** 全局共享的响应式状态 */
const isMember = ref(false)
const authLoaded = ref(false)

/** 初始化：从 localStorage 读取已保存的认证状态 */
function init() {
  if (authLoaded.value) return
  try {
    isMember.value = localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    isMember.value = false
  }
  authLoaded.value = true
}

/** 对输入字符串计算 SHA-256，返回十六进制摘要 */
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function useAuth() {
  init()

  /**
   * 验证口令：将输入哈希后与环境变量中的哈希比对。
   * 成功则写入 localStorage 并更新响应式状态。
   */
  async function verify(inputPassword: string): Promise<boolean> {
    const storedHash = import.meta.env.VITE_MEMBER_PASS_HASH
    if (!storedHash) {
      console.warn('未配置 VITE_MEMBER_PASS_HASH，成员验证不可用')
      return false
    }

    const inputHash = await sha256(inputPassword)
    if (inputHash === storedHash) {
      isMember.value = true
      try {
        localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        // localStorage 不可用时静默失败
      }
      return true
    }
    return false
  }

  /** 退出成员模式：清除 localStorage 并更新响应式状态 */
  function logout() {
    isMember.value = false
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // localStorage 不可用时静默失败
    }
  }

  return { isMember, authLoaded, verify, logout }
}
