<script setup lang="ts">
import { ref } from 'vue'
import {
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  Code2,
  Database,
  Eye,
  FileBadge2,
  Github,
  GraduationCap,
  Layers3,
  Mail,
  MapPin,
  Menu,
  Microscope,
  Sparkles,
  Users,
  X,
} from 'lucide-vue-next'
import campusMoment from './assets/lab/campus-moment.jpg'
import heroGroup from './assets/lab/hero-group.jpg'
import labLife from './assets/lab/lab-life.jpg'

const navItems = [
  { label: '研究方向', href: '#research' },
  { label: '成果展示', href: '#work' },
  { label: '团队风采', href: '#team' },
  { label: '加入我们', href: '#join' },
]

const researchAreas = [
  {
    title: '视觉感知',
    summary: '面向复杂场景的图像理解、目标检测、语义分割与三维感知。',
    icon: Eye,
  },
  {
    title: '多模态智能',
    summary: '探索视觉、语言与结构化信息融合，服务更可靠的智能分析。',
    icon: Layers3,
  },
  {
    title: '大模型应用',
    summary: '围绕视觉大模型、智能体与领域知识增强开展方法研究和工程验证。',
    icon: BrainCircuit,
  },
  {
    title: '智能系统',
    summary: '将算法能力落地到数据集、软件工具和真实应用场景。',
    icon: Microscope,
  },
]

const workItems = [
  { title: '论文', meta: 'Publications', status: '持续更新', icon: BookOpen },
  { title: '数据集', meta: 'Datasets', status: '整理中', icon: Database },
  { title: '软件', meta: 'Software', status: '开放计划中', icon: Code2 },
  { title: '专利', meta: 'Patents', status: '持续沉淀', icon: FileBadge2 },
]

const gallery = [
  {
    src: labLife,
    title: '实验室户外合影',
    caption: '开放、协作、持续探索。',
  },
  {
    src: campusMoment,
    title: '校园生活片段',
    caption: '科研之外，也保留真实的团队温度。',
  },
]

const isMenuOpen = ref(false)

function closeMenu() {
  isMenuOpen.value = false
}
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <a class="brand" href="#top" aria-label="Happy Computer Vision Lab 首页" @click="closeMenu">
        <span class="brand-mark">HCV</span>
        <span class="brand-text">Happy Computer Vision Lab</span>
      </a>

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
        <a v-for="item in navItems" :key="item.href" :href="item.href" @click="closeMenu">
          {{ item.label }}
        </a>
        <a class="nav-action" href="https://github.com/Happy-Computer-Vision" target="_blank" rel="noreferrer">
          <Github :size="18" />
          GitHub
        </a>
      </nav>
    </header>

    <main id="top">
      <section class="hero-section" aria-labelledby="hero-title">
        <img class="hero-media" :src="heroGroup" alt="" aria-hidden="true" />
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <p class="eyebrow">Xiangtan University · Computer Vision Research Group</p>
          <h1 id="hero-title">Happy Computer Vision Lab</h1>
          <p class="hero-copy">
            聚焦人工智能、计算机视觉、多模态学习与大模型应用，面向真实场景开展方法研究、系统实现与开放协作。
          </p>
          <div class="hero-actions" aria-label="主要入口">
            <a class="button button-primary" href="#research">
              <Sparkles :size="18" />
              研究方向
            </a>
            <a class="button button-secondary" href="mailto:zhou_wei@xtu.edu.cn">
              <Mail :size="18" />
              联系我们
            </a>
          </div>
        </div>
      </section>

      <section class="intro-band" aria-label="实验室概览">
        <div class="intro-grid">
          <div>
            <p class="section-kicker">About</p>
            <h2>面向智能视觉与真实应用的研究团队</h2>
          </div>
          <p>
            我们汇聚来自不同年级的研究生与本科生，围绕视觉感知、智能计算、多模态理解和工程应用开展长期研究。团队鼓励扎实的问题定义、可复现实验和面向真实需求的系统落地。
          </p>
        </div>
      </section>

      <section id="research" class="section-block" aria-labelledby="research-title">
        <div class="section-heading">
          <p class="section-kicker">Research</p>
          <h2 id="research-title">研究方向</h2>
          <p>以计算机视觉为核心，连接算法、数据、系统和行业场景。</p>
        </div>
        <div class="research-grid">
          <article v-for="area in researchAreas" :key="area.title" class="research-item">
            <component :is="area.icon" :size="28" />
            <h3>{{ area.title }}</h3>
            <p>{{ area.summary }}</p>
          </article>
        </div>
      </section>

      <section id="work" class="section-block work-section" aria-labelledby="work-title">
        <div class="section-heading">
          <p class="section-kicker">Output</p>
          <h2 id="work-title">成果展示</h2>
          <p>后续可按论文、数据集、软件与专利四类维护，避免首页变成零散列表。</p>
        </div>
        <div class="work-list">
          <article v-for="item in workItems" :key="item.title" class="work-item">
            <div class="work-icon">
              <component :is="item.icon" :size="24" />
            </div>
            <div>
              <h3>{{ item.title }}</h3>
              <p>{{ item.meta }}</p>
            </div>
            <span>{{ item.status }}</span>
          </article>
        </div>
      </section>

      <section id="team" class="section-block team-section" aria-labelledby="team-title">
        <div class="section-heading">
          <p class="section-kicker">People</p>
          <h2 id="team-title">团队风采</h2>
          <p>保留正式合影作为主页识别，团队生活照片用于展示实验室氛围。</p>
        </div>

        <figure class="team-photo">
          <img :src="heroGroup" alt="Happy Computer Vision Lab 2025 毕业合影" />
          <figcaption>Happy Computer Vision Lab · 2025</figcaption>
        </figure>

        <div class="gallery-grid">
          <figure v-for="photo in gallery" :key="photo.src" class="gallery-item">
            <img :src="photo.src" :alt="photo.title" />
            <figcaption>
              <strong>{{ photo.title }}</strong>
              <span>{{ photo.caption }}</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="join" class="section-block join-section" aria-labelledby="join-title">
        <div class="join-layout">
          <div>
            <p class="section-kicker">Join Us</p>
            <h2 id="join-title">欢迎对 AI 与计算机视觉感兴趣的同学加入</h2>
            <p>
              如果你关注视觉理解、多模态智能、大模型应用或真实场景系统落地，欢迎通过邮件联系团队老师。来信可简要说明研究兴趣、已有项目经历和希望参与的方向。
            </p>
          </div>
          <div class="contact-list" id="contact">
            <a href="mailto:zhou_wei@xtu.edu.cn">
              <GraduationCap :size="22" />
              <span>
                <strong>周维 教授</strong>
                zhou_wei@xtu.edu.cn
              </span>
              <ArrowUpRight :size="18" />
            </a>
            <a href="mailto:haixiaxu@xtu.edu.cn">
              <GraduationCap :size="22" />
              <span>
                <strong>许海霞 教授</strong>
                haixiaxu@xtu.edu.cn
              </span>
              <ArrowUpRight :size="18" />
            </a>
            <p>
              <MapPin :size="22" />
              <span>
                <strong>实验室地址</strong>
                工科楼 N403 / S408
              </span>
            </p>
          </div>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <span>Happy Computer Vision Lab</span>
      <span class="footer-meta">
        <Users :size="16" />
        AI · Computer Vision · Multimodal Learning
      </span>
    </footer>
  </div>
</template>
