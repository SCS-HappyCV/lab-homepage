<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  CalendarDays,
  Camera,
  ChevronDown,
  ChevronUp,
  Filter,
  ImageIcon,
  MapPin,
  Search,
  X,
} from 'lucide-vue-next'
import {
  galleryCategories,
  galleryYears,
  sortedGalleryItems,
  type GalleryCategory,
  type GalleryItem,
} from '../data/gallery/index'

type CategoryFilter = '全部' | GalleryCategory

interface JustifiedTile {
  item: GalleryItem
  width: number
}

interface JustifiedRow {
  id: string
  height: number
  tiles: JustifiedTile[]
}

const photosPerYearCollapsed = 12
const defaultPhotoRatio = 1.5
const rowGap = 6

const activeYear = ref('全部')
const activeCategory = ref<CategoryFilter>('全部')
const expandedYears = ref(new Set<string>())
const searchText = ref('')
const selectedPhoto = ref<GalleryItem | null>(null)
const photoRatios = ref<Record<string, number>>({})
const mosaicWidths = ref<Record<string, number>>({})

const mosaicElements = new Map<string, HTMLElement>()
let mosaicObserver: ResizeObserver | undefined

const filteredGallery = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()

  return sortedGalleryItems.filter((item) => {
    const matchesYear = activeYear.value === '全部' || item.year === activeYear.value
    const matchesCategory = activeCategory.value === '全部' || item.category === activeCategory.value
    const text = [item.title, item.year, item.category, item.location]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return matchesYear && matchesCategory && (!keyword || text.includes(keyword))
  })
})

const groupedGallery = computed(() =>
  galleryYears
    .map((year) => {
      const items = filteredGallery.value.filter((item) => item.year === year)
      const expanded = expandedYears.value.has(year)
      const categoryCount = new Set(items.map((item) => item.category)).size

      return {
        year,
        items,
        categoryCount,
        latestDate: items[0]?.date ?? '',
        visibleItems: expanded ? items : items.slice(0, photosPerYearCollapsed),
        hiddenCount: Math.max(0, items.length - photosPerYearCollapsed),
        expanded,
      }
    })
    .filter((group) => group.items.length > 0),
)

const heroGallery = computed(() => {
  const featured = sortedGalleryItems.filter((item) => item.featured).slice(0, 3)
  return featured.length > 0 ? featured : sortedGalleryItems.slice(0, 3)
})

const totalPhotoCount = computed(() => filteredGallery.value.length)
const visibleYearCount = computed(() => groupedGallery.value.length)

function selectYear(year: string) {
  activeYear.value = year

  if (year !== '全部') {
    window.requestAnimationFrame(() => {
      document.getElementById(`gallery-year-${year}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

function toggleYear(year: string) {
  const next = new Set(expandedYears.value)

  if (next.has(year)) {
    next.delete(year)
  } else {
    next.add(year)
  }

  expandedYears.value = next
}

function targetRowHeight(containerWidth: number) {
  if (containerWidth < 520) {
    return 156
  }

  if (containerWidth < 820) {
    return 184
  }

  return 220
}

function photoRatio(item: GalleryItem) {
  return photoRatios.value[item.id] ?? defaultPhotoRatio
}

function buildRow(year: string, items: GalleryItem[], rowIndex: number, justify: boolean): JustifiedRow {
  const containerWidth = Math.max(mosaicWidths.value[year] ?? 900, 280)
  const aspectSum = items.reduce((sum, item) => sum + photoRatio(item), 0)
  const gapWidth = Math.max(items.length - 1, 0) * rowGap
  const rowHeight = justify
    ? Math.max(96, Math.min(320, (containerWidth - gapWidth) / aspectSum))
    : targetRowHeight(containerWidth)

  return {
    id: `${year}-${rowIndex}-${items.map((item) => item.id).join('-')}`,
    height: rowHeight,
    tiles: items.map((item) => {
      const width = photoRatio(item) * rowHeight

      return {
        item,
        width: Math.min(width, containerWidth),
      }
    }),
  }
}

function justifiedRows(year: string, items: GalleryItem[]) {
  const containerWidth = Math.max(mosaicWidths.value[year] ?? 900, 280)
  const targetHeight = targetRowHeight(containerWidth)
  const rows: JustifiedRow[] = []
  let current: GalleryItem[] = []
  let aspectSum = 0

  items.forEach((item) => {
    current.push(item)
    aspectSum += photoRatio(item)

    const projectedWidth = aspectSum * targetHeight + Math.max(current.length - 1, 0) * rowGap

    if (projectedWidth >= containerWidth) {
      rows.push(buildRow(year, current, rows.length, true))
      current = []
      aspectSum = 0
    }
  })

  if (current.length > 0) {
    const projectedWidth = aspectSum * targetHeight + Math.max(current.length - 1, 0) * rowGap
    const shouldJustifyLastRow = current.length > 1 && projectedWidth >= containerWidth * 0.72
    rows.push(buildRow(year, current, rows.length, shouldJustifyLastRow))
  }

  return rows
}

function setMosaicRef(year: string, element: Element | null) {
  const existingElement = mosaicElements.get(year)

  if (existingElement && existingElement !== element) {
    mosaicObserver?.unobserve(existingElement)
    mosaicElements.delete(year)
  }

  if (!(element instanceof HTMLElement)) {
    return
  }

  mosaicElements.set(year, element)
  mosaicObserver?.observe(element)

  const style = window.getComputedStyle(element)
  const contentWidth =
    element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)

  if (contentWidth > 0 && Math.abs((mosaicWidths.value[year] ?? 0) - contentWidth) > 1) {
    mosaicWidths.value = {
      ...mosaicWidths.value,
      [year]: contentWidth,
    }
  }
}

function updatePhotoRatio(item: GalleryItem, event: Event) {
  const image = event.target

  if (!(image instanceof HTMLImageElement) || image.naturalHeight === 0) {
    return
  }

  const ratio = image.naturalWidth / image.naturalHeight

  if (Math.abs((photoRatios.value[item.id] ?? 0) - ratio) < 0.01) {
    return
  }

  photoRatios.value = {
    ...photoRatios.value,
    [item.id]: ratio,
  }
}

function openPhoto(photo: GalleryItem) {
  selectedPhoto.value = photo
}

function closePhoto() {
  selectedPhoto.value = null
}

onMounted(() => {
  mosaicObserver = new ResizeObserver((entries) => {
    const nextWidths = { ...mosaicWidths.value }
    let hasChanged = false

    entries.forEach((entry) => {
      const year = (entry.target as HTMLElement).dataset.year

      if (year && Math.abs((nextWidths[year] ?? 0) - entry.contentRect.width) > 1) {
        nextWidths[year] = entry.contentRect.width
        hasChanged = true
      }
    })

    if (hasChanged) {
      mosaicWidths.value = nextWidths
    }
  })

  mosaicElements.forEach((element) => mosaicObserver?.observe(element))
})

onBeforeUnmount(() => {
  mosaicObserver?.disconnect()
  mosaicElements.clear()
})
</script>

<template>
  <main class="gallery-page">
    <section class="gallery-hero" aria-labelledby="gallery-title">
      <div class="gallery-hero-media">
        <img v-for="item in heroGallery" :key="item.id" :src="item.image" :alt="item.title" />
      </div>
      <div class="gallery-hero-overlay"></div>
      <div class="gallery-hero-content">
        <p class="eyebrow">Lab Gallery</p>
        <h1 id="gallery-title">照片墙</h1>
        <p>
          按年份记录实验室毕业合影、生活片段、比赛参会和组会活动，最新照片优先展示，长期沉淀团队共同记忆。
        </p>
      </div>
    </section>

    <section class="gallery-directory" aria-label="照片墙">
      <!-- <div class="directory-toolbar">
        <div>
          <p class="section-kicker">Archive</p>
          <h2>年度照片墙</h2>
        </div>
        <label class="people-search">
          <Search :size="18" />
          <input v-model="searchText" type="search" placeholder="搜索标题、年份或地点" />
        </label>
      </div> -->

      <div class="filter-row" aria-label="照片类型筛选">
        <button type="button" :class="{ active: activeCategory === '全部' }" @click="activeCategory = '全部'">
          全部
        </button>
        <button
          v-for="category in galleryCategories"
          :key="category"
          type="button"
          :class="{ active: activeCategory === category }"
          @click="activeCategory = category"
        >
          {{ category }}
        </button>
      </div>

      <div class="gallery-layout">
        <aside class="cohort-panel gallery-year-panel" aria-label="年份导航">
          <button type="button" :class="{ active: activeYear === '全部' }" @click="selectYear('全部')">
            <span>全部年份</span>
            <Filter :size="16" />
          </button>
          <button
            v-for="year in galleryYears"
            :key="year"
            type="button"
            :class="{ active: activeYear === year }"
            @click="selectYear(year)"
          >
            <span>{{ year }}</span>
            <Camera :size="16" />
          </button>
          <p>从最新年份开始浏览团队合影、毕业纪念、学术交流与日常片段。</p>
        </aside>

        <div class="gallery-groups">
          <div class="gallery-summary-strip" aria-label="照片墙概览">
            <span>{{ totalPhotoCount }} 张照片</span>
            <span>{{ visibleYearCount }} 个年份</span>
            <span>{{ activeCategory }}</span>
          </div>

          <section
            v-for="group in groupedGallery"
            :id="`gallery-year-${group.year}`"
            :key="group.year"
            class="gallery-year-group"
          >
            <div class="year-section-heading">
              <div>
                <p class="section-kicker">{{ group.year }}</p>
                <h3>{{ group.year }} 年记忆</h3>
              </div>
              <div class="year-section-stats">
                <span>{{ group.items.length }} 张照片</span>
                <span>{{ group.categoryCount }} 类记录</span>
                <span>最新 {{ group.latestDate }}</span>
              </div>
            </div>

            <div
              class="year-photo-justified"
              :ref="(element) => setMosaicRef(group.year, element)"
              :data-year="group.year"
            >
              <div v-for="row in justifiedRows(group.year, group.visibleItems)" :key="row.id" class="justified-row">
                <article
                  v-for="tile in row.tiles"
                  :key="tile.item.id"
                  class="photo-justified-card"
                  :style="{ width: `${tile.width}px`, height: `${row.height}px` }"
                >
                  <button type="button" class="photo-card-button" @click="openPhoto(tile.item)">
                    <img :src="tile.item.image" :alt="tile.item.title" @load="updatePhotoRatio(tile.item, $event)" />
                    <!-- <span class="photo-category">{{ tile.item.category }}</span> -->
                    <span class="photo-collage-info">
                      <!-- <strong>{{ tile.item.title }}</strong> -->
                      <!-- <span>{{ tile.item.date }} · {{ tile.item.location }}</span> -->
                    </span>
                  </button>
                </article>
              </div>
            </div>

            <button
              v-if="group.hiddenCount > 0"
              type="button"
              class="gallery-expand-button"
              @click="toggleYear(group.year)"
            >
              <ChevronUp v-if="group.expanded" :size="18" />
              <ChevronDown v-else :size="18" />
              {{ group.expanded ? '收起本年度照片' : `展开本年度全部照片（还有 ${group.hiddenCount} 张）` }}
            </button>
          </section>

          <div v-if="groupedGallery.length === 0" class="empty-state">
            <ImageIcon :size="38" />
            <h3>没有匹配的照片</h3>
            <p>可以清空搜索词，或切换年份与类型筛选。</p>
          </div>
        </div>
      </div>
    </section>

    <div v-if="selectedPhoto" class="drawer-backdrop" @click="closePhoto"></div>
    <aside v-if="selectedPhoto" class="photo-lightbox" role="dialog" aria-modal="true" aria-label="照片详情">
      <button class="drawer-close" type="button" aria-label="关闭照片详情" @click="closePhoto">
        <X :size="22" />
      </button>

      <img :src="selectedPhoto.image" :alt="selectedPhoto.title" />
      <div class="photo-lightbox-body">
        <span class="photo-category">{{ selectedPhoto.category }}</span>
        <h2>{{ selectedPhoto.title }}</h2>
        <dl>
          <div>
            <dt><CalendarDays :size="17" /> 日期</dt>
            <dd>{{ selectedPhoto.date }}</dd>
          </div>
          <div>
            <dt><MapPin :size="17" /> 地点</dt>
            <dd>{{ selectedPhoto.location }}</dd>
          </div>
        </dl>
      </div>
    </aside>
  </main>
</template>
