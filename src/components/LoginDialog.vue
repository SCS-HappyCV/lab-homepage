<script setup lang="ts">
import { ref } from 'vue'
import { Lock, X } from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: []; success: [] }>()

const { verify } = useAuth()

const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleConfirm() {
  error.value = ''
  const pwd = password.value.trim()
  if (!pwd) {
    error.value = '请输入口令'
    return
  }

  loading.value = true
  try {
    const ok = await verify(pwd)
    if (ok) {
      password.value = ''
      emit('success')
      emit('close')
    } else {
      error.value = '口令错误，请重试'
    }
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  password.value = ''
  error.value = ''
  emit('close')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') handleConfirm()
  if (e.key === 'Escape') handleCancel()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="login-backdrop" @click.self="handleCancel">
      <div class="login-dialog" role="dialog" aria-modal="true" aria-label="成员身份验证" @keydown="handleKeydown">
        <button class="drawer-close" type="button" aria-label="关闭" @click="handleCancel">
          <X :size="20" />
        </button>

        <div class="login-icon">
          <Lock :size="28" />
        </div>
        <h3>成员身份验证</h3>
        <p class="login-hint">请输入成员口令以查看完整信息</p>

        <input
          v-model="password"
          type="password"
          class="login-input"
          placeholder="输入口令"
          autofocus
        />

        <p v-if="error" class="login-error">{{ error }}</p>

        <div class="login-actions">
          <button type="button" class="login-btn login-btn-confirm" :disabled="loading" @click="handleConfirm">
            {{ loading ? '验证中...' : '确认' }}
          </button>
          <button type="button" class="login-btn login-btn-cancel" @click="handleCancel">取消</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
