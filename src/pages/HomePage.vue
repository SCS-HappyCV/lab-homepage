<script setup lang="ts">
import { RouterLink } from 'vue-router'
import {
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  Code2,
  Database,
  Eye,
  FileBadge2,
  GraduationCap,
  Images,
  Layers3,
  Mail,
  MapPin,
  Microscope,
  Sparkles,
  Users,
} from 'lucide-vue-next'
import { sortedGalleryItems } from '../data/gallery/index'
import { publicAsset } from '../utils/publicAsset'

const heroGroup = publicAsset('gallery/lab/hero-group.jpg')

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

const homeGallery = sortedGalleryItems.slice(0, 3)
</script>

<template>
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
          <!-- <a class="button button-primary" href="#research">
            <Sparkles :size="18" />
            研究方向
          </a> -->
          <RouterLink class="button button-secondary" to="/people">
            <Users :size="18" />
            团队成员
          </RouterLink>
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
        <p>集中展示团队在论文、数据集、软件工具与知识产权等方面的阶段性成果。</p>
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
        <p>记录团队合影、日常活动与学术交流，并提供成员档案和照片墙入口。</p>
      </div>

      <figure class="team-photo">
        <img :src="heroGroup" alt="Happy Computer Vision Lab 2025 毕业合影" />
        <figcaption>Happy Computer Vision Lab · 2025</figcaption>
      </figure>

      <div class="team-entry">
        <div>
          <h3>查看完整成员档案</h3>
          <p>按届别展示在读学生与历届毕业生，包含照片、成果、经历、联系方式与毕业去向。</p>
        </div>
        <RouterLink class="button button-dark" to="/people">
          团队成员
          <ArrowUpRight :size="18" />
        </RouterLink>
      </div>

      <div class="team-entry gallery-entry">
        <div>
          <h3>最新照片墙</h3>
          <p>毕业照、生活照、比赛参会照和组会活动按时间归档，记录实验室共同成长的瞬间。</p>
        </div>
        <RouterLink class="button button-dark" to="/gallery">
          <Images :size="18" />
          查看照片墙
        </RouterLink>
      </div>

      <!-- <div class="gallery-grid home-gallery-grid">
        <figure v-for="photo in homeGallery" :key="photo.id" class="gallery-item">
          <img :src="photo.image" :alt="photo.title" />
          <figcaption>
            <strong>{{ photo.title }}</strong>
            <span>{{ photo.date }} · {{ photo.category }} · {{ photo.location }}</span>
          </figcaption>
        </figure>
      </div> -->
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
              信息科技大楼 632 / 工科楼 S408
            </span>
          </p>
        </div>
      </div>
    </section>
  </main>
</template>
