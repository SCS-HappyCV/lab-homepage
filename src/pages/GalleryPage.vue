<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
  X,
  Calendar,
  MapPin,
  Images,
  Search,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Plus,
  Pencil,
  Save,
  Trash2,
  Upload,
  AlertTriangle,
} from 'lucide-vue-next'
import { memberApi } from '../utils/api'
import { resolvePhotoUrl } from '../utils/publicAsset'
import { useAuth } from '../utils/useAuth'
import DatePicker from '../components/DatePicker.vue'
import type { Album, AlbumInput, AlbumListItem, Photo } from '../data/gallery/types'

const { isMember } = useAuth()

const allCategories = '全部'

type SortOrder = 'desc' | 'asc'

const albums = ref<AlbumListItem[]>([])
const isLoading = ref(false)
const apiError = ref('')

const activeCategories = ref<string[]>([allCategories])
const activeYear = ref('全部')
const searchText = ref('')
const sortOrder = ref<SortOrder>('desc')
const selectedAlbum = ref<Album | null>(null)
const selectedPhoto = ref<Photo | null>(null)
const photoRatios = ref<Record<string, number>>({})
const detailLoading = ref(false)

// 相册新建/编辑对话框
type AlbumEditorMode = 'create' | 'edit'
interface AlbumFormState {
  id: string
  title: string
  year: string
  date: string
  location: string
  description: string
  category: string
  featured: boolean
  coverUrl: string
}

const ALBUM_CATEGORIES = ['生活照', '毕业照'] as const
const currentYear = String(new Date().getFullYear())
const albumEditorMode = ref<AlbumEditorMode>('create')
const isAlbumEditorOpen = ref(false)
const albumEditorError = ref('')
const isSavingAlbum = ref(false)
const isUploadingCover = ref(false)
const albumForm = ref<AlbumFormState>(createEmptyAlbumForm())
const coverFileInput = ref<HTMLInputElement | null>(null)
const selectedCoverName = ref('')
let pendingCoverFile: File | null = null
let pendingCoverObjectUrl = ''

// 删除相册确认弹窗
const isDeleteConfirmOpen = ref(false)
const isDeletingAlbum = ref(false)
const deleteTarget = ref<{ id: string; title: string } | null>(null)

function createEmptyAlbumForm(): AlbumFormState {
  return {
    id: '',
    title: '',
    year: currentYear,
    date: '',
    location: '',
    description: '',
    category: ALBUM_CATEGORIES[0],
    featured: false,
    coverUrl: '',
  }
}

const coverPreviewUrl = computed(() => {
  if (pendingCoverObjectUrl) return pendingCoverObjectUrl
  return albumForm.value.coverUrl ? resolvePhotoUrl(albumForm.value.coverUrl) : ''
})

function resetPendingCover() {
  pendingCoverFile = null
  if (pendingCoverObjectUrl) {
    URL.revokeObjectURL(pendingCoverObjectUrl)
    pendingCoverObjectUrl = ''
  }
  selectedCoverName.value = ''
  if (coverFileInput.value) coverFileInput.value.value = ''
}

function openCreateAlbum() {
  albumEditorMode.value = 'create'
  albumForm.value = createEmptyAlbumForm()
  resetPendingCover()
  albumEditorError.value = ''
  isAlbumEditorOpen.value = true
}

function openEditAlbum(album: AlbumListItem) {
  albumEditorMode.value = 'edit'
  albumForm.value = {
    id: album.id,
    title: album.title,
    year: album.year,
    date: album.date,
    location: album.location,
    description: album.description,
    category: album.categories[0] ?? ALBUM_CATEGORIES[0],
    featured: album.featured,
    coverUrl: album.coverUrl,
  }
  resetPendingCover()
  albumEditorError.value = ''
  isAlbumEditorOpen.value = true
}

function closeAlbumEditor() {
  isAlbumEditorOpen.value = false
  albumEditorError.value = ''
  resetPendingCover()
}

function pickCoverFile() {
  coverFileInput.value?.click()
}

function onCoverFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (pendingCoverObjectUrl) URL.revokeObjectURL(pendingCoverObjectUrl)
  pendingCoverFile = file
  pendingCoverObjectUrl = URL.createObjectURL(file)
  selectedCoverName.value = file.name
}

function resolveYear(): string {
  const date = albumForm.value.date.trim()
  const match = date.match(/^(\d{4})/)
  if (match) return match[1]
  const fallback = albumForm.value.year.trim()
  return fallback || currentYear
}

async function saveAlbum() {
  albumEditorError.value = ''
  const title = albumForm.value.title.trim()
  if (!title) {
    albumEditorError.value = '请填写标题'
    return
  }

  const input: AlbumInput = {
    title,
    year: resolveYear(),
    date: albumForm.value.date.trim(),
    location: albumForm.value.location.trim(),
    description: albumForm.value.description.trim(),
    categories: albumForm.value.category ? [albumForm.value.category] : [],
    featured: albumForm.value.featured,
  }

  isSavingAlbum.value = true
  try {
    let albumId = albumForm.value.id
    if (albumEditorMode.value === 'create') {
      const created = await memberApi.createAlbum(input)
      albumId = created.id
    } else {
      await memberApi.updateAlbum(albumId, input)
    }
    if (pendingCoverFile && albumId) {
      isUploadingCover.value = true
      await memberApi.uploadAlbumCover(albumId, pendingCoverFile)
    }
    closeAlbumEditor()
    await loadAlbums()
    if (albumId && selectedAlbum.value?.id === albumId) {
      selectedAlbum.value = await memberApi.getAlbum(albumId)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    albumEditorError.value = message ? `保存失败：${message}` : '保存失败，请稍后重试。'
  } finally {
    isSavingAlbum.value = false
    isUploadingCover.value = false
  }
}

function requestDeleteAlbum(album: { id: string; title: string }) {
  deleteTarget.value = { id: album.id, title: album.title }
  isDeleteConfirmOpen.value = true
}

function cancelDeleteAlbum() {
  if (isDeletingAlbum.value) return
  isDeleteConfirmOpen.value = false
  deleteTarget.value = null
}

async function confirmDeleteAlbum() {
  const album = deleteTarget.value
  if (!album || isDeletingAlbum.value) return
  isDeletingAlbum.value = true
  try {
    await memberApi.deleteAlbum(album.id)
    if (selectedAlbum.value?.id === album.id) {
      selectedAlbum.value = null
      selectedPhoto.value = null
    }
    isDeleteConfirmOpen.value = false
    deleteTarget.value = null
    closeAlbumEditor()
    await loadAlbums()
  } catch {
    albumEditorError.value = '删除失败，请确认登录状态有效后重试。'
  } finally {
    isDeletingAlbum.value = false
  }
}

const categories = computed(() => {
  const set = new Set<string>()
  albums.value.forEach((album) => album.categories.forEach((c) => set.add(c)))
  return [allCategories, ...Array.from(set).sort()]
})

const years = computed(() =>
  Array.from(new Set(albums.value.map((album) => album.year))).sort((a, b) => Number(b) - Number(a)),
)

const heroGallery = computed(() => {
  const featured = albums.value.filter((album) => album.featured).slice(0, 3)
  return featured.length > 0 ? featured : albums.value.slice(0, 3)
})

const filteredAlbums = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  return albums.value.filter((album) => {
    const matchesCategory =
      activeCategories.value.includes(allCategories) ||
      activeCategories.value.some((category) => album.categories.includes(category))
    const matchesYear = activeYear.value === '全部' || album.year === activeYear.value
    const text = [album.title, album.year, album.location, album.date, ...(album.categories || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return matchesCategory && matchesYear && (!keyword || text.includes(keyword))
  })
})

const sortedAlbums = computed(() => {
  const list = [...filteredAlbums.value]
  list.sort((a, b) => {
    const order = sortOrder.value === 'asc' ? 1 : -1
    const dateDiff = (a.date || '').localeCompare(b.date || '')
    if (dateDiff !== 0) return dateDiff * order
    return a.year.localeCompare(b.year) * order
  })
  return list
})

const groupedAlbums = computed(() => {
  const groups = new Map<string, AlbumListItem[]>()
  sortedAlbums.value.forEach((album) => {
    if (!groups.has(album.year)) groups.set(album.year, [])
    groups.get(album.year)!.push(album)
  })
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, list]) => ({ year, events: list }))
})

const activeFiltersCount = computed(() => {
  let count = 0
  if (!activeCategories.value.includes(allCategories)) count += activeCategories.value.length
  if (activeYear.value !== '全部') count += 1
  if (searchText.value.trim().length > 0) count += 1
  return count
})

function toggleCategorySelection(category: string) {
  if (category === allCategories) {
    activeCategories.value = [allCategories]
  } else {
    const filtered = activeCategories.value.filter((c) => c !== allCategories)
    if (filtered.includes(category)) {
      const next = filtered.filter((c) => c !== category)
      activeCategories.value = next.length > 0 ? next : [allCategories]
    } else {
      activeCategories.value = [...filtered, category]
    }
  }
}

function resetFilters() {
  activeCategories.value = [allCategories]
  activeYear.value = '全部'
  searchText.value = ''
  sortOrder.value = 'desc'
}

async function openAlbum(album: AlbumListItem) {
  selectedAlbum.value = { ...album, photos: [] } as unknown as Album
  selectedPhoto.value = null
  detailLoading.value = true
  try {
    selectedAlbum.value = await memberApi.getAlbum(album.id)
  } catch {
    apiError.value = '相册照片加载失败，请稍后重试。'
  } finally {
    detailLoading.value = false
  }
}

function closeAlbum() {
  selectedAlbum.value = null
  selectedPhoto.value = null
}

function openPhoto(photo: Photo) {
  selectedPhoto.value = photo
}

function closePhoto() {
  selectedPhoto.value = null
}

function prevPhoto() {
  if (!selectedAlbum.value || !selectedPhoto.value) return
  const photos = selectedAlbum.value.photos
  const index = photos.findIndex((p) => p.id === selectedPhoto.value!.id)
  selectedPhoto.value = index > 0 ? photos[index - 1] : photos[photos.length - 1]
}

function nextPhoto() {
  if (!selectedAlbum.value || !selectedPhoto.value) return
  const photos = selectedAlbum.value.photos
  const index = photos.findIndex((p) => p.id === selectedPhoto.value!.id)
  selectedPhoto.value = index < photos.length - 1 ? photos[index + 1] : photos[0]
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (isDeleteConfirmOpen.value) cancelDeleteAlbum()
    else if (selectedPhoto.value) closePhoto()
    else if (selectedAlbum.value) closeAlbum()
    else if (isAlbumEditorOpen.value) closeAlbumEditor()
  } else if (selectedPhoto.value) {
    if (e.key === 'ArrowLeft') prevPhoto()
    if (e.key === 'ArrowRight') nextPhoto()
  }
}

function updatePhotoRatio(photo: Photo) {
  const img = new Image()
  img.onload = () => {
    photoRatios.value[photo.id] = img.naturalWidth / img.naturalHeight
  }
  img.src = resolvePhotoUrl(photo.imageUrl)
}

watch(
  () => selectedAlbum.value?.photos,
  (photos) => {
    if (!photos) return
    nextTick(() => {
      photos.forEach((photo) => {
        if (!photoRatios.value[photo.id]) updatePhotoRatio(photo)
      })
    })
  },
  { immediate: true },
)

watch(
  [selectedAlbum, selectedPhoto, isAlbumEditorOpen, isDeleteConfirmOpen],
  ([album, photo, editor, confirmDialog]) => {
    document.body.style.overflow = album || photo || editor || confirmDialog ? 'hidden' : ''
  },
  { immediate: true },
)

async function loadAlbums() {
  isLoading.value = true
  apiError.value = ''
  try {
    albums.value = await memberApi.listAlbums()
  } catch {
    apiError.value = '相册数据服务暂时不可用，请稍后刷新重试。'
    albums.value = []
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void loadAlbums()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <main class="gallery-page">
    <section class="gallery-hero" aria-labelledby="gallery-title">
      <div class="gallery-hero-media">
        <img
          v-for="album in heroGallery"
          :key="album.id"
          :src="resolvePhotoUrl(album.coverUrl)"
          :alt="album.title"
          decoding="async"
        />
      </div>
      <div class="gallery-hero-overlay"></div>
      <div class="gallery-hero-content">
        <p class="eyebrow">Gallery</p>
        <h1 id="gallery-title">记录实验室的每一段时光</h1>
        <p>从毕业合影到日常随拍，用影像留住属于 Happy CV Lab 的故事。</p>
      </div>
    </section>

    <section class="people-directory" aria-label="相册列表">
      <div class="directory-toolbar gallery-toolbar">
        <div>
          <p class="section-kicker">Gallery</p>
          <h2>照片墙</h2>
          <p v-if="apiError" class="api-state warning">{{ apiError }}</p>
        </div>
        <div class="toolbar-actions">
          <button v-if="isMember" class="member-create-btn" type="button" @click="openCreateAlbum">
            <Plus :size="16" />
            <span>新建相册</span>
          </button>
          <label class="people-search toolbar-search">
            <Search :size="18" />
            <input v-model="searchText" type="search" placeholder="搜索相册、地点..." />
          </label>
        </div>
      </div>

      <div class="cohort-layout">
        <aside class="filter-panel">
          <div class="filter-group">
            <span class="filter-group-label filter-group-label-lg">排序</span>
            <button
              type="button"
              class="sort-btn sort-btn-compact"
              @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
            >
              <ArrowDown v-if="sortOrder === 'desc'" :size="16" />
              <ArrowUp v-else :size="16" />
              日期
            </button>
          </div>

          <h3 class="filter-panel-title filter-panel-title-lg">筛选</h3>

          <div class="filter-group">
            <span class="filter-group-label">分类</span>
            <div class="filter-pill-flex filter-pill-grid-3">
              <button
                v-for="category in categories"
                :key="category"
                type="button"
                :class="['filter-pill', { active: activeCategories.includes(category) }]"
                @click="toggleCategorySelection(category)"
              >
                {{ category }}
              </button>
            </div>
          </div>

          <div class="filter-group">
            <span class="filter-group-label">年份</span>
            <div class="filter-pill-flex filter-pill-grid-3">
              <button
                type="button"
                :class="['filter-pill', { active: activeYear === '全部' }]"
                @click="activeYear = '全部'"
              >
                全部
              </button>
              <button
                v-for="year in years"
                :key="year"
                type="button"
                :class="['filter-pill', { active: activeYear === year }]"
                @click="activeYear = year"
              >
                {{ year }}
              </button>
            </div>
          </div>

          <button
            v-if="activeFiltersCount > 0"
            class="login-btn login-btn-cancel filter-reset"
            type="button"
            @click="resetFilters"
          >
            <RotateCcw :size="14" />
            清除筛选
          </button>
        </aside>

        <div v-if="isLoading" class="member-groups gallery-groups gallery-empty">
          <p>正在加载相册…</p>
        </div>

        <div v-else-if="groupedAlbums.length === 0" class="member-groups gallery-groups gallery-empty">
          <ImageOff :size="48" />
          <p>没有找到匹配的相册</p>
          <button class="btn-clear" @click="resetFilters">清除筛选</button>
        </div>

        <div v-else class="member-groups gallery-groups">
          <section v-for="group in groupedAlbums" :key="group.year" class="member-group">
            <div class="member-group-heading">
              <h3>{{ group.year }}</h3>
              <span>{{ group.events.length }} 个相册</span>
            </div>
            <div class="events-grid">
              <article
                v-for="album in group.events"
                :key="album.id"
                class="event-card"
                @click="openAlbum(album)"
              >
                <div class="event-card-image">
                  <img
                    :src="resolvePhotoUrl(album.coverThumb || album.coverUrl)"
                    :alt="album.title"
                    loading="lazy"
                  />
                  <div class="event-card-tags">
                    <span v-for="category in album.categories.slice(0, 2)" :key="category" class="event-card-tag">
                      {{ category }}
                    </span>
                  </div>
                  <span class="event-card-count">
                    <Images :size="14" />
                    {{ album.photosCount }}
                  </span>
                  <button
                    v-if="isMember"
                    type="button"
                    class="album-card-edit"
                    aria-label="编辑相册"
                    @click.stop="openEditAlbum(album)"
                  >
                    <Pencil :size="14" />
                  </button>
                </div>
                <div class="event-card-body">
                  <h3 class="event-card-title">{{ album.title }}</h3>
                  <div class="event-card-meta">
                    <span><Calendar :size="14" /> {{ album.date }}</span>
                    <span><MapPin :size="14" /> {{ album.location }}</span>
                  </div>
                  <p v-if="album.description" class="event-card-desc">{{ album.description }}</p>
                  <div class="event-card-categories">
                    <span v-for="category in album.categories" :key="category" class="event-category-chip">
                      {{ category }}
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </section>

    <!-- Album Create/Edit Modal -->
    <Transition name="fade">
      <div v-if="isAlbumEditorOpen" class="editor-portal">
        <div class="editor-backdrop" @click="closeAlbumEditor"></div>
        <aside
          class="member-editor-card"
          role="dialog"
          aria-modal="true"
          :aria-label="albumEditorMode === 'create' ? '新建相册' : '编辑相册'"
        >
          <form class="member-editor-form" @submit.prevent="saveAlbum">
            <div class="editor-header">
              <div class="editor-heading">
                <h2>{{ albumEditorMode === 'create' ? '新建相册' : '编辑相册' }}</h2>
              </div>
              <button class="editor-close" type="button" aria-label="关闭" @click="closeAlbumEditor">
                <X :size="22" />
              </button>
            </div>

            <div class="editor-body">
              <div class="editor-section">
                <div class="editor-fields album-cover-desc">
                  <label class="editor-field">
                    封面图片
                    <div class="album-cover-field">
                      <div class="album-cover-preview">
                        <img v-if="coverPreviewUrl" :src="coverPreviewUrl" alt="封面预览" />
                        <span v-else class="album-cover-empty">未选择封面</span>
                      </div>
                      <div class="album-cover-actions">
                        <button class="album-cover-pick" type="button" @click="pickCoverFile">
                          <Upload :size="15" />
                          选择文件
                        </button>
                        <input
                          ref="coverFileInput"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          class="album-cover-input"
                          @change="onCoverFileSelected"
                        />
                        <span class="album-cover-filename">{{ selectedCoverName || '未选择文件' }}</span>
                      </div>
                      <p class="album-cover-hint">建议横版 16:10，JPG/PNG/WebP，单张 ≤5MB</p>
                      <label class="album-featured-field">
                        <input v-model="albumForm.featured" type="checkbox" />
                        <span>在照片墙顶部展示</span>
                      </label>
                    </div>
                  </label>

                  <label class="editor-field">
                    相册描述
                    <textarea v-model="albumForm.description" rows="9" maxlength="500"></textarea>
                  </label>
                </div>
              </div>

              <div class="editor-section">
                <div class="editor-fields">
                  <label class="editor-field">
                    标题 *
                    <input v-model="albumForm.title" type="text" required maxlength="100" />
                  </label>
                  <label class="editor-field">
                    分类
                    <select v-model="albumForm.category">
                      <option v-for="c in ALBUM_CATEGORIES" :key="c" :value="c">{{ c }}</option>
                    </select>
                  </label>
                  <label class="editor-field">
                    地点
                    <input
                      v-model="albumForm.location"
                      type="text"
                      placeholder="如 湘潭大学"
                      maxlength="100"
                    />
                  </label>
                  <label class="editor-field">
                    日期
                    <DatePicker v-model="albumForm.date" />
                  </label>
                </div>
              </div>

              <p v-if="albumEditorError" class="login-error editor-error">{{ albumEditorError }}</p>
            </div>

            <div class="editor-footer">
              <button
                type="submit"
                class="login-btn login-btn-confirm"
                :disabled="isSavingAlbum || isUploadingCover"
              >
                <Save :size="17" />
                {{ isSavingAlbum ? '保存中...' : isUploadingCover ? '上传封面中...' : '保存' }}
              </button>
              <button type="button" class="login-btn login-btn-cancel" @click="closeAlbumEditor">
                取消
              </button>
              <button
                v-if="albumEditorMode === 'edit'"
                type="button"
                class="login-btn album-delete-btn"
                :disabled="isSavingAlbum || isUploadingCover"
                @click="requestDeleteAlbum(albumForm)"
              >
                <Trash2 :size="16" />
                删除
              </button>
            </div>
          </form>
        </aside>
      </div>
    </Transition>

    <!-- Delete Album Confirm Dialog -->
    <Teleport to="body">
      <Transition name="confirm">
        <div
          v-if="isDeleteConfirmOpen && deleteTarget"
          class="album-confirm-overlay"
          @click.self="cancelDeleteAlbum"
        >
          <div class="album-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="album-confirm-title">
            <div class="album-confirm-icon">
              <AlertTriangle :size="28" />
            </div>
            <div class="album-confirm-body">
              <h3 id="album-confirm-title">删除相册</h3>
              <p>
                确认删除相册「{{ deleteTarget.title }}」吗？该相册的全部照片将被一并删除，此操作不可撤销。
              </p>
            </div>
            <div class="album-confirm-actions">
              <button
                type="button"
                class="album-confirm-cancel"
                :disabled="isDeletingAlbum"
                @click="cancelDeleteAlbum"
              >
                取消
              </button>
              <button
                type="button"
                class="album-confirm-delete"
                :disabled="isDeletingAlbum"
                @click="confirmDeleteAlbum"
              >
                {{ isDeletingAlbum ? '删除中...' : '确认删除' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Album Detail Modal -->
    <Transition name="fade">
      <div v-if="selectedAlbum" class="event-modal" @click.self="closeAlbum">
        <div class="event-modal-panel">
          <header class="event-modal-header">
            <div class="event-modal-title">
              <div class="event-modal-categories">
                <span v-for="category in selectedAlbum.categories" :key="category" class="event-modal-category">
                  {{ category }}
                </span>
              </div>
              <h2>{{ selectedAlbum.title }}</h2>
              <div class="event-modal-meta">
                <span><Calendar :size="14" /> {{ selectedAlbum.date }}</span>
                <span><MapPin :size="14" /> {{ selectedAlbum.location }}</span>
                <span><Images :size="14" /> {{ selectedAlbum.photos.length }} 张照片</span>
              </div>
            </div>
            <div class="event-modal-actions">
              <button class="event-modal-close" @click="closeAlbum">
                <X :size="22" />
              </button>
            </div>
          </header>

          <p v-if="selectedAlbum.description" class="event-modal-desc">{{ selectedAlbum.description }}</p>

          <div v-if="detailLoading" class="event-photos-grid">照片加载中…</div>
          <div v-else class="event-photos-grid">
            <div
              v-for="photo in selectedAlbum.photos"
              :key="photo.id"
              class="event-photo-item"
              :style="{
                aspectRatio: photoRatios[photo.id] ? String(photoRatios[photo.id]) : '1.5',
              }"
              @click="openPhoto(photo)"
            >
              <img
                :src="resolvePhotoUrl(photo.thumbUrl || photo.imageUrl)"
                :alt="photo.caption || selectedAlbum.title"
                loading="lazy"
              />
              <div v-if="photo.caption" class="event-photo-caption">{{ photo.caption }}</div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Photo Lightbox -->
    <Transition name="fade">
      <div v-if="selectedPhoto" class="photo-lightbox" @click.self="closePhoto">
        <button class="lightbox-nav lightbox-prev" @click.stop="prevPhoto">
          <ChevronLeft :size="32" />
        </button>
        <div class="lightbox-content">
          <img :src="resolvePhotoUrl(selectedPhoto.imageUrl)" :alt="selectedPhoto.caption || ''" />
          <div v-if="selectedPhoto.caption" class="lightbox-caption">{{ selectedPhoto.caption }}</div>
        </div>
        <button class="lightbox-nav lightbox-next" @click.stop="nextPhoto">
          <ChevronRight :size="32" />
        </button>
        <button class="lightbox-close" @click.stop="closePhoto">
          <X :size="24" />
        </button>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.gallery-page {
  min-height: 100vh;
  background: #f8f9fa;
}

.gallery-groups {
  padding-bottom: 80px;
}

.album-card-edit {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  opacity: 0.85;
  transition: opacity 0.2s, background 0.2s;
}

.event-card:hover .album-card-edit,
.album-card-edit:focus-visible {
  opacity: 1;
}

.album-card-edit:hover {
  background: rgba(0, 0, 0, 0.78);
}

.album-featured-field {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  width: fit-content;
  margin-top: 4px;
  color: var(--ink, #17211f);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.album-featured-field input[type='checkbox'] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--green, #1d8163);
}

.album-cover-desc {
  grid-template-columns: minmax(0, 260px) minmax(0, 1fr);
  align-items: stretch;
}

.album-cover-desc > :last-child {
  display: flex;
  flex-direction: column;
}

.album-cover-desc > :last-child textarea {
  flex: 1;
  min-height: 180px;
}

.album-cover-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.album-cover-preview {
  width: min(220px, 100%);
  aspect-ratio: 16 / 10;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px dashed var(--line, #dce5df);
  background: #f4f7f5;
  overflow: hidden;
}

.album-cover-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.album-cover-empty {
  color: var(--muted, #5f6f69);
  font-size: 13px;
}

.album-cover-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.album-cover-pick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  min-height: 36px;
  border: 1px solid var(--green, #1d8163);
  border-radius: 8px;
  color: var(--green, #1d8163);
  background: #ffffff;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.album-cover-pick:hover {
  background: var(--green, #1d8163);
  color: #ffffff;
}

.album-cover-input {
  display: none;
}

.album-cover-filename {
  color: var(--muted, #5f6f69);
  font-size: 13px;
  font-weight: 600;
}

.album-cover-hint {
  margin: 0;
  color: var(--muted, #5f6f69);
  font-size: 12px;
}

.album-delete-btn {
  margin-left: auto;
  border-color: #dc2626 !important;
  background: #dc2626 !important;
  color: #ffffff !important;
}

.album-delete-btn:hover:not(:disabled) {
  background: #b91c1c !important;
  border-color: #b91c1c !important;
}

.album-delete-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 删除确认弹窗 */
.album-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
}

.album-confirm-dialog {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  background: var(--paper, #ffffff);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.album-confirm-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #fef2f2;
  color: #dc2626;
}

.album-confirm-body h3 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--ink, #17211f);
}

.album-confirm-body p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted, #5f6f69);
}

.album-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.album-confirm-cancel,
.album-confirm-delete {
  padding: 9px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.album-confirm-cancel {
  border: 1px solid var(--line, #dce5df);
  background: #ffffff;
  color: var(--ink, #17211f);
}

.album-confirm-cancel:hover:not(:disabled) {
  background: var(--soft, #eef4f0);
}

.album-confirm-delete {
  border: 1px solid #dc2626;
  background: #dc2626;
  color: #ffffff;
}

.album-confirm-delete:hover:not(:disabled) {
  background: #b91c1c;
  border-color: #b91c1c;
}

.album-confirm-cancel:disabled,
.album-confirm-delete:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.confirm-enter-active,
.confirm-leave-active {
  transition: opacity 0.25s ease;
}

.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}

.confirm-enter-active .album-confirm-dialog,
.confirm-leave-active .album-confirm-dialog {
  transition: transform 0.25s ease;
}

.confirm-enter-from .album-confirm-dialog,
.confirm-leave-to .album-confirm-dialog {
  transform: scale(0.96);
}


.gallery-groups.gallery-empty {
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 80px 24px;
  color: var(--muted, #5f6f69);
}

.filter-reset {
  width: 100%;
  justify-content: center;
  font-size: 13px;
  padding: 10px 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.filter-panel-title-lg {
  font-size: 16px;
  font-weight: 800;
  color: var(--ink, #17211f);
}

.filter-group-label-lg {
  font-size: 16px;
  font-weight: 800;
  color: var(--ink, #17211f);
}

.sort-btn-compact {
  width: fit-content;
  min-height: 34px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--line, #dce5df);
  background: #ffffff;
  color: var(--ink, #17211f);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sort-btn-compact:hover {
  border-color: var(--ink, #17211f);
  background: var(--soft, #eef4f0);
}

.filter-pill-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.filter-pill-grid-3 .filter-pill {
  width: 100%;
  justify-content: center;
  padding: 7px 4px;
  font-size: 14px;
}

.filter-reset {
  width: 100%;
}

.events-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.event-card {
  position: relative;
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: transform 0.25s, box-shadow 0.25s;
}

.event-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.1);
}

.event-card-image {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
}

.event-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s;
}

.event-card:hover .event-card-image img {
  transform: scale(1.05);
}

.event-card-tags {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.event-card-tag {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  backdrop-filter: blur(4px);
}

.event-card-count {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
}

.event-card-body {
  padding: 18px;
}

.event-card-title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--ink, #17211f);
}

.event-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--muted, #5f6f69);
  margin-bottom: 10px;
}

.event-card-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.event-card-desc {
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted, #5f6f69);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 12px;
}

.event-card-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.event-category-chip {
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--soft, #eef4f0);
  color: var(--green, #1f7a5a);
  font-size: 11px;
  font-weight: 700;
}

.btn-clear {
  padding: 8px 18px;
  border-radius: 999px;
  border: none;
  background: var(--green, #1f7a5a);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-clear:hover {
  opacity: 0.9;
}

.event-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(6px);
}

.event-modal-panel {
  width: 100%;
  max-width: 1100px;
  max-height: 90vh;
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
}

.event-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 28px;
  border-bottom: 1px solid var(--line, #dce5df);
}

.event-modal-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.event-modal-category {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--soft, #eef4f0);
  color: var(--green, #1f7a5a);
  font-size: 12px;
  font-weight: 700;
}

.event-modal-title h2 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--ink, #17211f);
}

.event-modal-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--muted, #5f6f69);
}

.event-modal-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.event-modal-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--soft, #eef4f0);
  color: var(--ink, #17211f);
  cursor: pointer;
  transition: background 0.2s;
}

.event-modal-close:hover {
  background: var(--line, #dce5df);
}

.event-modal-desc {
  padding: 16px 28px 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted, #5f6f69);
}

.event-photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
  padding: 24px 28px;
  overflow-y: auto;
}

.event-photo-item {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: #f1f5f9;
}

.event-photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.event-photo-item:hover img {
  transform: scale(1.04);
}

.event-photo-caption {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px 10px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  color: #fff;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s;
}

.event-photo-item:hover .event-photo-caption {
  opacity: 1;
}

.photo-lightbox {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.92);
}

.lightbox-content {
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.lightbox-content img {
  max-width: 100%;
  max-height: 82vh;
  object-fit: contain;
  border-radius: 6px;
}

.lightbox-caption {
  margin-top: 12px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
}

.lightbox-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}

.lightbox-nav:hover {
  background: rgba(255, 255, 255, 0.2);
}

.lightbox-prev {
  left: 24px;
}

.lightbox-next {
  right: 24px;
}

.lightbox-close {
  position: absolute;
  top: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 1024px) {
  .events-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .events-grid {
    grid-template-columns: 1fr;
  }

  .event-modal {
    padding: 0;
  }

  .event-modal-panel {
    max-height: 100vh;
    border-radius: 0;
  }

  .event-modal-header {
    padding: 16px;
  }

  .event-modal-title h2 {
    font-size: 18px;
  }

  .event-photos-grid {
    grid-template-columns: repeat(2, 1fr);
    padding: 16px;
    gap: 8px;
  }
}

@media (max-width: 820px) {
  .album-cover-desc {
    grid-template-columns: 1fr;
  }

  .album-cover-desc > :last-child textarea {
    min-height: 120px;
  }
}
</style>
