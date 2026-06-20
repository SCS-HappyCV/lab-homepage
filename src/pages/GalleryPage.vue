<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  CalendarDays,
  Camera,
  Filter,
  ImageIcon,
  MapPin,
  Search,
  Tag,
  Users,
  X,
} from 'lucide-vue-next'
import {
  galleryCategories,
  galleryYears,
  sortedGalleryItems,
  type GalleryCategory,
  type GalleryItem,
} from '../data/gallery'

type CategoryFilter = '全部' | GalleryCategory

const activeYear = ref('全部')
const activeCategory = ref<CategoryFilter>('全部')
const searchText = ref('')
const selectedPhoto = ref<GalleryItem | null>(null)

const filteredGallery = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()

  return sortedGalleryItems.filter((item) => {
    const matchesYear = activeYear.value === '全部' || item.year === activeYear.value
    const matchesCategory = activeCategory.value === '全部' || item.category === activeCategory.value
    const text = [item.title, item.category, item.location, item.people, item.photographer]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return matchesYear && matchesCategory && (!keyword || text.includes(keyword))
  })
})

const groupedGallery = computed(() =>
  galleryYears
    .map((year) => ({
      year,
      items: filteredGallery.value.filter((item) => item.year === year),
    }))
    .filter((group) => group.items.length > 0),
)

const heroGallery = computed(() => sortedGalleryItems.filter((item) => item.featured).slice(0, 3))

function openPhoto(photo: GalleryItem) {
  selectedPhoto.value = photo
}

function closePhoto() {
  selectedPhoto.value = null
}
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
          记录实验室毕业照、生活照、比赛参会照和组会活动。每张照片都保留标题、时间、地点和简介。
        </p>
      </div>
    </section>

    <section class="gallery-directory" aria-label="照片列表">
      <div class="directory-toolbar">
        <div>
          <p class="section-kicker">Archive</p>
          <h2>按年份和类型浏览</h2>
        </div>
        <label class="people-search">
          <Search :size="18" />
          <input v-model="searchText" type="search" placeholder="搜索标题、地点、介绍或参与人员" />
        </label>
      </div>

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
        <aside class="cohort-panel gallery-year-panel" aria-label="年份筛选">
          <button type="button" :class="{ active: activeYear === '全部' }" @click="activeYear = '全部'">
            <span>全部年份</span>
            <Filter :size="16" />
          </button>
          <button
            v-for="year in galleryYears"
            :key="year"
            type="button"
            :class="{ active: activeYear === year }"
            @click="activeYear = year"
          >
            <span>{{ year }}</span>
            <Camera :size="16" />
          </button>
          <p>按年份回看实验室活动记录，也可以用上方类型标签快速筛选不同场景。</p>
        </aside>

        <div class="gallery-groups">
          <section v-for="group in groupedGallery" :key="group.year" class="gallery-year-group">
            <div class="member-group-heading">
              <h3>{{ group.year }}</h3>
              <span>{{ group.items.length }} 张</span>
            </div>

            <div class="photo-wall-grid">
              <article v-for="item in group.items" :key="item.id" class="photo-wall-card">
                <button type="button" @click="openPhoto(item)">
                  <img :src="item.image" :alt="item.title" />
                  <span class="photo-category">{{ item.category }}</span>
                </button>
                <div class="photo-card-body">
                  <h4>{{ item.title }}</h4>
                  <div class="photo-meta">
                    <span>
                      <CalendarDays :size="15" />
                      {{ item.date }}
                    </span>
                    <span>
                      <MapPin :size="15" />
                      {{ item.location }}
                    </span>
                  </div>
                </div>
              </article>
            </div>
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
          <div v-if="selectedPhoto.people">
            <dt><Users :size="17" /> 参与人员</dt>
            <dd>{{ selectedPhoto.people }}</dd>
          </div>
          <div v-if="selectedPhoto.photographer">
            <dt><Tag :size="17" /> 摄影</dt>
            <dd>{{ selectedPhoto.photographer }}</dd>
          </div>
        </dl>
      </div>
    </aside>
  </main>
</template>
