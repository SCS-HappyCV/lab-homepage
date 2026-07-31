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
  Plus,
  Save,
  ImageOff,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Pencil,
} from 'lucide-vue-next'
import { galleryEvents, galleryCategories, galleryYears } from '../data/gallery'
import { labImage } from '../data/gallery/helpers'
import type { GalleryEvent, GalleryPhoto } from '../data/gallery/types'

const CUSTOM_EVENTS_KEY = 'gallery-custom-events'
const allCategories = '全部'

type SortOrder = 'desc' | 'asc'

const customEvents = ref<GalleryEvent[]>([])
const activeCategories = ref<string[]>([allCategories])
const activeYear = ref('全部')
const searchText = ref('')
const sortOrder = ref<SortOrder>('desc')
const selectedEvent = ref<GalleryEvent | null>(null)
const selectedPhoto = ref<GalleryPhoto | null>(null)
const photoRatios = ref<Record<string, number>>({})

const isEditorOpen = ref(false)
const editorError = ref('')
const editorForm = ref(createEmptyForm())

const allEvents = computed(() => [...galleryEvents, ...customEvents.value])

const heroGallery = computed(() => {
  const featured = allEvents.value.filter((event) => event.categories.includes('精选')).slice(0, 3)
  return featured.length > 0 ? featured : allEvents.value.slice(0, 3)
})

const filteredEvents = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  return allEvents.value.filter((event) => {
    const matchesCategory =
      activeCategories.value.includes(allCategories) ||
      activeCategories.value.some((category) => event.categories.includes(category))
    const matchesYear = activeYear.value === '全部' || event.year === activeYear.value
    const text = [event.title, event.year, event.location, event.date, ...(event.categories || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return matchesCategory && matchesYear && (!keyword || text.includes(keyword))
  })
})

const categories = computed(() => [allCategories, ...galleryCategories])

const sortedEvents = computed(() => {
  const events = [...filteredEvents.value]
  events.sort((a, b) => {
    const order = sortOrder.value === 'asc' ? 1 : -1
    const dateDiff = (a.date || '').localeCompare(b.date || '')
    if (dateDiff !== 0) return dateDiff * order
    return a.year.localeCompare(b.year) * order
  })
  return events
})

const groupedEvents = computed(() => {
  const groups = new Map<string, GalleryEvent[]>()
  sortedEvents.value.forEach((event) => {
    if (!groups.has(event.year)) groups.set(event.year, [])
    groups.get(event.year)!.push(event)
  })
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, events]) => ({ year, events }))
})

const activeFiltersCount = computed(() => {
  let count = 0
  if (!activeCategories.value.includes(allCategories)) count += activeCategories.value.length
  if (activeYear.value !== '全部') count += 1
  if (searchText.value.trim().length > 0) count += 1
  return count
})

const stats = computed(() => {
  const photoCount = allEvents.value.reduce((sum, event) => sum + event.photos.length, 0)
  return {
    eventCount: allEvents.value.length,
    photoCount,
    categoryCount: galleryCategories.length,
    yearCount: galleryYears.length,
  }
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

function openEvent(event: GalleryEvent) {
  selectedEvent.value = event
  selectedPhoto.value = null
  document.body.style.overflow = 'hidden'
}

function closeEvent() {
  selectedEvent.value = null
  selectedPhoto.value = null
  document.body.style.overflow = ''
}

function openPhoto(photo: GalleryPhoto) {
  selectedPhoto.value = photo
}

function closePhoto() {
  selectedPhoto.value = null
}

function prevPhoto() {
  if (!selectedEvent.value || !selectedPhoto.value) return
  const photos = selectedEvent.value.photos
  const index = photos.findIndex((p) => p.id === selectedPhoto.value!.id)
  selectedPhoto.value = index > 0 ? photos[index - 1] : photos[photos.length - 1]
}

function nextPhoto() {
  if (!selectedEvent.value || !selectedPhoto.value) return
  const photos = selectedEvent.value.photos
  const index = photos.findIndex((p) => p.id === selectedPhoto.value!.id)
  selectedPhoto.value = index < photos.length - 1 ? photos[index + 1] : photos[0]
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (selectedPhoto.value) closePhoto()
    else if (selectedEvent.value) closeEvent()
    else if (isEditorOpen.value) closeEditor()
  } else if (selectedPhoto.value) {
    if (e.key === 'ArrowLeft') prevPhoto()
    if (e.key === 'ArrowRight') nextPhoto()
  }
}

function updatePhotoRatio(photo: GalleryPhoto) {
  const img = new Image()
  img.onload = () => {
    photoRatios.value[photo.id] = img.naturalWidth / img.naturalHeight
  }
  img.src = photo.image
}

watch(
  () => selectedEvent.value?.photos,
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

function createEmptyForm() {
  return {
    id: '',
    title: '',
    year: String(new Date().getFullYear()),
    categoriesText: '',
    date: '',
    location: '',
    description: '',
    coverFile: '',
    photosText: '',
  }
}

function fillFormFromEvent(event: GalleryEvent) {
  editorForm.value = {
    id: event.id,
    title: event.title,
    year: event.year,
    categoriesText: event.categories.join(', '),
    date: event.date,
    location: event.location,
    description: event.description,
    coverFile: event.coverImage ? event.coverImage.split('/').pop() || '' : '',
    photosText: event.photos.map((p) => p.image.split('/').pop() || '').join('\n'),
  }
}

function isCustomEvent(event: GalleryEvent) {
  return event.id.startsWith('custom-')
}

function openCreateEditor() {
  editorForm.value = createEmptyForm()
  editorError.value = ''
  isEditorOpen.value = true
}

function openEditEditor(event: GalleryEvent) {
  if (!isCustomEvent(event)) return
  fillFormFromEvent(event)
  editorError.value = ''
  isEditorOpen.value = true
}

function closeEditor() {
  isEditorOpen.value = false
  editorError.value = ''
}

function saveCustomEvent() {
  editorError.value = ''

  const categories = editorForm.value.categoriesText
    .split(/[,，]/)
    .map((c) => c.trim())
    .filter(Boolean)

  if (!editorForm.value.title || !editorForm.value.year || categories.length === 0) {
    editorError.value = '标题、年份和分类为必填项。'
    return
  }

  const photoFileNames = editorForm.value.photosText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (photoFileNames.length === 0) {
    editorError.value = '请至少填写一张照片文件名。'
    return
  }

  const coverFile = editorForm.value.coverFile.trim() || photoFileNames[0]
  const year = editorForm.value.year.trim()

  const photos: GalleryPhoto[] = photoFileNames.map((fileName, index) => {
    const { image, thumbnail } = labImage(year, fileName)
    return {
      id: `${year}-${fileName.replace(/\.[^.]+$/, '')}-${index}-${Date.now()}`,
      image,
      thumbnail,
    }
  })

  const cover = labImage(year, coverFile)

  const event: GalleryEvent = {
    id: editorForm.value.id || `custom-${Date.now()}`,
    year,
    categories,
    title: editorForm.value.title.trim(),
    date: editorForm.value.date.trim(),
    location: editorForm.value.location.trim(),
    description: editorForm.value.description.trim(),
    coverImage: cover.image,
    coverThumbnail: cover.thumbnail,
    photos,
  }

  if (editorForm.value.id) {
    const index = customEvents.value.findIndex((e) => e.id === editorForm.value.id)
    if (index !== -1) {
      customEvents.value[index] = event
    } else {
      customEvents.value.push(event)
    }
  } else {
    customEvents.value.push(event)
  }

  persistCustomEvents()
  closeEditor()

  if (selectedEvent.value?.id === event.id) {
    selectedEvent.value = event
  }
}

function deleteCustomEvent(event: GalleryEvent) {
  if (!isCustomEvent(event)) return
  if (!window.confirm(`确认删除相册「${event.title}」吗？`)) return
  customEvents.value = customEvents.value.filter((e) => e.id !== event.id)
  persistCustomEvents()
  if (selectedEvent.value?.id === event.id) closeEvent()
}

function persistCustomEvents() {
  localStorage.setItem(CUSTOM_EVENTS_KEY, JSON.stringify(customEvents.value))
}

function loadCustomEvents() {
  try {
    const raw = localStorage.getItem(CUSTOM_EVENTS_KEY)
    if (raw) customEvents.value = JSON.parse(raw)
  } catch {
    customEvents.value = []
  }
}

onMounted(() => {
  loadCustomEvents()
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
          v-for="event in heroGallery"
          :key="event.id"
          :src="event.coverImage"
          :alt="event.title"
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

    <div class="people-directory">
      <div class="cohort-layout">
        <aside class="filter-panel">
          <h2 class="filter-panel-main-title">照片墙</h2>

          <div class="filter-panel-search">
            <Search :size="16" />
            <input v-model="searchText" type="text" placeholder="搜索相册、地点..." />
          </div>

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
                v-for="year in galleryYears"
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

          <button class="member-create-btn" type="button" @click="openCreateEditor">
            <Plus :size="18" />
            新建相册
          </button>
        </aside>

        <div v-if="groupedEvents.length === 0" class="member-groups gallery-groups gallery-empty">
          <ImageOff :size="48" />
          <p>没有找到匹配的相册</p>
          <button class="btn-clear" @click="resetFilters">清除筛选</button>
        </div>

        <div v-else class="member-groups gallery-groups">
          <section v-for="group in groupedEvents" :key="group.year" class="member-group">
            <div class="member-group-heading">
              <h3>{{ group.year }}</h3>
              <span>{{ group.events.length }} 个相册</span>
            </div>
            <div class="events-grid">
              <article
                v-for="event in group.events"
                :key="event.id"
                class="event-card"
                @click="openEvent(event)"
              >
                <div class="event-card-image">
                  <img :src="event.coverThumbnail || event.coverImage" :alt="event.title" loading="lazy" />
                  <div class="event-card-tags">
                    <span v-for="category in event.categories.slice(0, 2)" :key="category" class="event-card-tag">
                      {{ category }}
                    </span>
                  </div>
                  <span class="event-card-count">
                    <Images :size="14" />
                    {{ event.photos.length }}
                  </span>
                </div>
                <div class="event-card-body">
                  <h3 class="event-card-title">{{ event.title }}</h3>
                  <div class="event-card-meta">
                    <span><Calendar :size="14" /> {{ event.date }}</span>
                    <span><MapPin :size="14" /> {{ event.location }}</span>
                  </div>
                  <p v-if="event.description" class="event-card-desc">{{ event.description }}</p>
                  <div class="event-card-categories">
                    <span v-for="category in event.categories" :key="category" class="event-category-chip">
                      {{ category }}
                    </span>
                  </div>
                </div>

                <div v-if="isCustomEvent(event)" class="event-card-actions">
                  <button
                    class="event-card-action-btn"
                    type="button"
                    title="编辑相册"
                    @click.stop="openEditEditor(event)"
                  >
                    <Pencil :size="14" />
                  </button>
                  <button
                    class="event-card-action-btn event-card-action-delete"
                    type="button"
                    title="删除相册"
                    @click.stop="deleteCustomEvent(event)"
                  >
                    <X :size="14" />
                  </button>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- Event Detail Modal -->
    <Transition name="fade">
      <div v-if="selectedEvent" class="event-modal" @click.self="closeEvent">
        <div class="event-modal-panel">
          <header class="event-modal-header">
            <div class="event-modal-title">
              <div class="event-modal-categories">
                <span v-for="category in selectedEvent.categories" :key="category" class="event-modal-category">
                  {{ category }}
                </span>
              </div>
              <h2>{{ selectedEvent.title }}</h2>
              <div class="event-modal-meta">
                <span><Calendar :size="14" /> {{ selectedEvent.date }}</span>
                <span><MapPin :size="14" /> {{ selectedEvent.location }}</span>
                <span><Images :size="14" /> {{ selectedEvent.photos.length }} 张照片</span>
              </div>
            </div>
            <div class="event-modal-actions">
              <button
                v-if="isCustomEvent(selectedEvent)"
                class="event-modal-action-btn"
                type="button"
                title="编辑相册"
                @click="openEditEditor(selectedEvent)"
              >
                <Pencil :size="18" />
              </button>
              <button
                v-if="isCustomEvent(selectedEvent)"
                class="event-modal-action-btn event-modal-action-delete"
                type="button"
                title="删除相册"
                @click="deleteCustomEvent(selectedEvent)"
              >
                <X :size="18" />
              </button>
              <button class="event-modal-close" @click="closeEvent">
                <X :size="22" />
              </button>
            </div>
          </header>

          <p v-if="selectedEvent.description" class="event-modal-desc">{{ selectedEvent.description }}</p>

          <div class="event-photos-grid">
            <div
              v-for="photo in selectedEvent.photos"
              :key="photo.id"
              class="event-photo-item"
              :style="{
                aspectRatio: photoRatios[photo.id] ? String(photoRatios[photo.id]) : '1.5',
              }"
              @click="openPhoto(photo)"
            >
              <img :src="photo.thumbnail || photo.image" :alt="photo.caption || selectedEvent.title" loading="lazy" />
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
          <img :src="selectedPhoto.image" :alt="selectedPhoto.caption || ''" />
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

    <!-- Create Album Editor -->
    <Transition name="fade">
      <div v-if="isEditorOpen" class="editor-portal">
        <div class="editor-backdrop" @click="closeEditor"></div>
        <aside class="member-editor-card gallery-editor-card" role="dialog" aria-modal="true" aria-label="新建相册">
          <form class="member-editor-form" @submit.prevent="saveCustomEvent">
            <div class="editor-header">
              <div class="editor-heading"><h2>{{ editorForm.id ? '编辑相册' : '新建相册' }}</h2></div>
              <button class="editor-close" type="button" aria-label="关闭编辑器" @click="closeEditor">
                <X :size="22" />
              </button>
            </div>

            <div class="editor-body">
              <div class="editor-grid">
                <label>
                  <span>标题 <em class="required-hint">(必填)</em></span>
                  <input v-model="editorForm.title" type="text" placeholder="例如：2027 届毕业合影" required />
                </label>
                <label>
                  <span>年份 <em class="required-hint">(必填)</em></span>
                  <input v-model="editorForm.year" type="text" placeholder="2027" required />
                </label>
              </div>
              <label>
                <span>分类 <em class="required-hint">(必填，多个用逗号分隔)</em></span>
                <input v-model="editorForm.categoriesText" type="text" placeholder="毕业照" required />
              </label>
              <div class="editor-grid">
                <label>
                  <span>日期</span>
                  <input v-model="editorForm.date" type="text" placeholder="2027-06" />
                </label>
                <label>
                  <span>地点</span>
                  <input v-model="editorForm.location" type="text" placeholder="湘潭大学" />
                </label>
              </div>
              <label>
                <span>描述</span>
                <textarea v-model="editorForm.description" rows="3" placeholder="简单描述这个相册的内容..."></textarea>
              </label>
              <label>
                <span>封面文件名</span>
                <input v-model="editorForm.coverFile" type="text" placeholder="留空则使用第一张照片" />
              </label>
              <label>
                <span>照片文件名 <em class="required-hint">(必填，每行一个)</em></span>
                <textarea
                  v-model="editorForm.photosText"
                  rows="6"
                  placeholder="DSC_0001.JPG\nDSC_0002.JPG\n..."
                  required
                ></textarea>
              </label>
              <p class="editor-hint">
                照片文件需要提前放到 public/gallery/lab/{年份}/ 目录下，缩略图放到 thumbs/ 子目录。
              </p>
              <p v-if="editorError" class="login-error">{{ editorError }}</p>
            </div>

            <div class="editor-footer">
              <button type="submit" class="login-btn login-btn-confirm">
                <Save :size="17" /> 保存
              </button>
              <button type="button" class="login-btn login-btn-cancel" @click="closeEditor">取消</button>
            </div>
          </form>
        </aside>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.gallery-page {
  min-height: 100vh;
  background: #f8f9fa;
}

.filter-panel-main-title {
  font-size: 28px;
  font-weight: 800;
  color: var(--ink, #17211f);
  margin: 0;
  line-height: 1.2;
}

.filter-panel-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid var(--line, #dce5df);
  transition: border-color 0.2s;
}

.filter-panel-search:focus-within {
  border-color: var(--green, #1f7a5a);
}

.filter-panel-search input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--ink, #17211f);
}

.filter-panel-search input::placeholder {
  color: var(--muted, #5f6f69);
}

/* Gallery groups */
.gallery-groups {
  padding-bottom: 80px;
}

.gallery-groups.gallery-empty {
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 80px 24px;
  color: var(--muted, #5f6f69);
}

/* Filter panel extras */
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

.sort-btn-compact.active {
  color: #ffffff;
  background: #10201c;
  border-color: #10201c;
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

.filter-reset,
.member-create-btn {
  width: 100%;
}

/* Events grid inside groups */
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

.event-card-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}

.event-card:hover .event-card-actions {
  opacity: 1;
}

.event-card-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: rgba(31, 122, 90, 0.9);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}

.event-card-action-btn:hover {
  background: var(--green, #1f7a5a);
}

.event-card-action-delete {
  background: rgba(224, 49, 49, 0.85);
}

.event-card-action-delete:hover {
  background: #e03131;
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

/* Event Modal */
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

.event-modal-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--soft, #eef4f0);
  color: var(--green, #1f7a5a);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.event-modal-action-btn:hover {
  background: var(--green, #1f7a5a);
  color: #ffffff;
}

.event-modal-action-delete {
  color: #e03131;
}

.event-modal-action-delete:hover {
  background: #e03131;
  color: #ffffff;
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

/* Lightbox */
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

/* Editor */
.gallery-editor-card {
  width: min(560px, 90vw);
  height: min(90vh, 760px);
}

.editor-hint {
  font-size: 12px;
  color: var(--muted, #5f6f69);
  line-height: 1.5;
  margin-top: 4px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 1024px) {
  .events-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .toolbar-search {
    width: 100%;
  }

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
</style>
