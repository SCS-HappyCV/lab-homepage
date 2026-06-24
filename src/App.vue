<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { Github, Images, Lock, LockOpen, Menu, Users, X } from 'lucide-vue-next'
import { useAuth } from './composables/useAuth'
import LoginDialog from './components/LoginDialog.vue'

const router = useRouter()
const route = useRoute()
const isMenuOpen = ref(false)
const showLogin = ref(false)
const { isMember, logout } = useAuth()

/** 允许子页面通过自定义事件请求打开登录弹窗 */
function openLogin() {
  showLogin.value = true
}

if (typeof window !== 'undefined') {
  window.addEventListener('open-login', openLogin)
}

const sectionItems = [
  // { label: '研究方向', id: 'research' },
  { label: '成果展示', id: 'work' },
  { label: '团队风采', id: 'team' },
  { label: '加入我们', id: 'join' },
]

function closeMenu() {
  isMenuOpen.value = false
}

async function goHome(sectionId?: string) {
  closeMenu()

  if (route.path !== '/') {
    await router.push('/')
    await nextTick()
  }

  if (!sectionId) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  window.requestAnimationFrame(() => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function goPeople() {
  closeMenu()
  void router.push('/people')
}

function goGallery() {
  closeMenu()
  void router.push('/gallery')
}
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <button class="brand" type="button" aria-label="Happy Computer Vision Lab 首页" @click="goHome()">
        <span class="brand-mark">HCV</span>
        <span class="brand-text">Happy Computer Vision Lab</span>
      </button>

      <button
        class="nav-toggle"
        type="button"
        :aria-expanded="isMenuOpen"
        aria-controls="primary-nav"
        @click="isMenuOpen = !isMenuOpen"
      >
        <Menu v-if="!isMenuOpen" :size="22" />
        <X v-else :size="22" />
        <span class="sr-only">切换导航</span>
      </button>

      <nav id="primary-nav" class="primary-nav" :class="{ 'is-open': isMenuOpen }">
        <button class="nav-link" type="button" @click="goHome()">首页</button>
        <button class="nav-link" type="button" :class="{ active: route.path === '/people' }" @click="goPeople">
          团队成员
        </button>
        <button class="nav-link" type="button" :class="{ active: route.path === '/gallery' }" @click="goGallery">
          <Images :size="17" />
          照片墙
        </button>
        <button
          v-for="item in sectionItems"
          :key="item.id"
          class="nav-link"
          type="button"
          @click="goHome(item.id)"
        >
          {{ item.label }}
        </button>
        <a class="nav-action" href="https://github.com/Happy-Computer-Vision" target="_blank" rel="noreferrer">
          <Github :size="18" />
          GitHub
        </a>
        <button
          class="nav-link auth-toggle"
          type="button"
          :aria-label="isMember ? '退出成员模式' : '成员登录'"
          :title="isMember ? '退出成员模式' : '成员登录'"
          @click="isMember ? logout() : (showLogin = true)"
        >
          <LockOpen v-if="isMember" :size="18" style="color: #8be0b4" />
          <Lock v-else :size="18" style="color: #f87171" />
        </button>
      </nav>
    </header>

    <RouterView />

    <LoginDialog :visible="showLogin" @close="showLogin = false" />

    <footer class="site-footer">
      <span>Happy Computer Vision Lab</span>
      <span class="footer-meta">
        <Users :size="16" />
        AI · Computer Vision · Multimodal Learning
      </span>
    </footer>
  </div>
</template>
