<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Award,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  GraduationCap,
  Mail,
  Phone,
  Search,
  Sparkles,
  UserRound,
  X,
} from 'lucide-vue-next'
import labLife from '../assets/lab/lab-life.jpg'
import { cohortOrder, studentProfiles, type StudentProfile, type StudentStatus } from '../data/students'

type StatusFilter = 'all' | StudentStatus

const activeCohort = ref('全部')
const activeStatus = ref<StatusFilter>('all')
const searchText = ref('')
const selectedMember = ref<StudentProfile | null>(null)

const cohorts = computed(() => ['全部', ...cohortOrder.filter((cohort) => studentProfiles.some((item) => item.cohort === cohort))])

const filteredMembers = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()

  return studentProfiles.filter((member) => {
    const matchesCohort = activeCohort.value === '全部' || member.cohort === activeCohort.value
    const matchesStatus = activeStatus.value === 'all' || member.status === activeStatus.value
    const text = [member.name, member.cohort, member.degree, member.role, member.destination, member.email, ...member.research]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return matchesCohort && matchesStatus && (!keyword || text.includes(keyword))
  })
})

const groupedMembers = computed(() =>
  cohortOrder
    .map((cohort) => ({
      cohort,
      members: filteredMembers.value.filter((member) => member.cohort === cohort),
    }))
    .filter((group) => group.members.length > 0),
)

const stats = computed(() => {
  const alumni = studentProfiles.filter((member) => member.status === 'alumni').length
  const current = studentProfiles.filter((member) => member.status === 'current').length

  return [
    { label: '成员档案', value: studentProfiles.length },
    { label: '在读学生', value: current },
    { label: '历届毕业生', value: alumni },
    { label: '届别分组', value: cohorts.value.length - 1 },
  ]
})

function statusLabel(status: StudentStatus) {
  return status === 'current' ? 'Current' : 'Alumni'
}

function initials(name: string) {
  const placeholderMatch = name.match(/成员\s*([a-z0-9一-龥])/i)

  if (placeholderMatch?.[1]) {
    return placeholderMatch[1].toUpperCase()
  }

  return name.replace(/\d{4}届/g, '').replace(/\s+/g, '').slice(0, 2).toUpperCase()
}

function selectMember(member: StudentProfile) {
  selectedMember.value = member
}

function clearSelectedMember() {
  selectedMember.value = null
}
</script>

<template>
  <main class="people-page">
    <section class="people-hero" aria-labelledby="people-title">
      <img :src="labLife" alt="" aria-hidden="true" />
      <div class="people-hero-overlay"></div>
      <div class="people-hero-content">
        <p class="eyebrow">People Directory</p>
        <h1 id="people-title">团队成员</h1>
        <p>
          按届别管理在读学生与历届毕业生，集中展示照片、研究方向、代表成果、个人经历、联系方式和毕业去向。
        </p>
        <div class="people-stats" aria-label="成员概览">
          <article v-for="item in stats" :key="item.label">
            <strong>{{ item.value }}</strong>
            <span>{{ item.label }}</span>
          </article>
        </div>
      </div>
    </section>

    <section class="people-directory" aria-label="成员列表">
      <div class="directory-toolbar">
        <div>
          <p class="section-kicker">Directory</p>
          <h2>按届别浏览成员档案</h2>
        </div>
        <label class="people-search">
          <Search :size="18" />
          <input v-model="searchText" type="search" placeholder="搜索姓名、方向、邮箱或去向" />
        </label>
      </div>

      <div class="filter-row" aria-label="状态筛选">
        <button type="button" :class="{ active: activeStatus === 'all' }" @click="activeStatus = 'all'">全部</button>
        <button type="button" :class="{ active: activeStatus === 'current' }" @click="activeStatus = 'current'">在读</button>
        <button type="button" :class="{ active: activeStatus === 'alumni' }" @click="activeStatus = 'alumni'">已毕业</button>
      </div>

      <div class="cohort-layout">
        <aside class="cohort-panel" aria-label="届别筛选">
          <button
            v-for="cohort in cohorts"
            :key="cohort"
            type="button"
            :class="{ active: activeCohort === cohort }"
            @click="activeCohort = cohort"
          >
            <span>{{ cohort }}</span>
            <ChevronRight :size="16" />
          </button>
          <p>成员信息按届别归档，已毕业同学展示毕业去向，在读同学展示主要研究方向与联系方式。</p>
        </aside>

        <div class="member-groups">
          <section v-for="group in groupedMembers" :key="group.cohort" class="member-group">
            <div class="member-group-heading">
              <h3>{{ group.cohort }}</h3>
              <span>{{ group.members.length }} 人</span>
            </div>

            <div class="member-grid">
              <article v-for="member in group.members" :key="member.id" class="member-card">
                <button type="button" class="member-card-main" @click="selectMember(member)">
                  <div class="member-photo">
                    <img v-if="member.photo" :src="member.photo" :alt="member.name" />
                    <span v-else>{{ initials(member.name) }}</span>
                  </div>
                  <div class="member-info">
                    <div class="member-title-row">
                      <h4>{{ member.name }}</h4>
                      <span class="status-badge" :class="member.status">{{ statusLabel(member.status) }}</span>
                    </div>
                    <p>{{ member.degree }} · {{ member.role }}</p>
                    <div class="tag-list">
                      <span v-for="tag in member.research" :key="tag">{{ tag }}</span>
                    </div>
                    <div class="member-facts">
                      <span>
                        <Award :size="15" />
                        成果 {{ member.achievements.length }}
                      </span>
                      <span>
                        <CalendarDays :size="15" />
                        {{ member.cohort }}
                      </span>
                    </div>
                    <p v-if="member.destination" class="destination">
                      <BriefcaseBusiness :size="15" />
                      毕业去向：{{ member.destination }}
                    </p>
                  </div>
                </button>

                <div class="member-actions">
                  <a :href="`mailto:${member.email}`" aria-label="发送邮件">
                    <Mail :size="17" />
                  </a>
                  <a v-if="member.phone" :href="`tel:${member.phone}`" aria-label="拨打电话">
                    <Phone :size="17" />
                  </a>
                  <button v-else type="button" aria-label="电话未公开" disabled>
                    <Phone :size="17" />
                  </button>
                  <button type="button" @click="selectMember(member)">详情</button>
                </div>
              </article>
            </div>
          </section>

          <div v-if="groupedMembers.length === 0" class="empty-state">
            <UserRound :size="36" />
            <h3>没有匹配的成员</h3>
            <p>可以清空搜索词，或切换届别与状态筛选。</p>
          </div>
        </div>
      </div>
    </section>

    <div v-if="selectedMember" class="drawer-backdrop" @click="clearSelectedMember"></div>
    <aside v-if="selectedMember" class="profile-drawer" role="dialog" aria-modal="true" aria-label="成员详情">
      <button class="drawer-close" type="button" aria-label="关闭成员详情" @click="clearSelectedMember">
        <X :size="22" />
      </button>

      <div class="drawer-profile">
        <div class="drawer-photo">
          <img v-if="selectedMember.photo" :src="selectedMember.photo" :alt="selectedMember.name" />
          <span v-else>{{ initials(selectedMember.name) }}</span>
        </div>
        <div>
          <span class="status-badge" :class="selectedMember.status">{{ statusLabel(selectedMember.status) }}</span>
          <h2>{{ selectedMember.name }}</h2>
          <p>{{ selectedMember.degree }} · {{ selectedMember.cohort }}</p>
        </div>
      </div>

      <div class="drawer-section">
        <h3>个人简介</h3>
        <p>{{ selectedMember.bio }}</p>
      </div>

      <div class="drawer-section">
        <h3>研究方向</h3>
        <div class="tag-list">
          <span v-for="tag in selectedMember.research" :key="tag">{{ tag }}</span>
        </div>
      </div>

      <div class="drawer-section">
        <h3>代表成果</h3>
        <ul>
          <li v-for="item in selectedMember.achievements" :key="item">
            <Sparkles :size="16" />
            <span>{{ item }}</span>
          </li>
        </ul>
      </div>

      <div class="drawer-section">
        <h3>个人经历</h3>
        <ul>
          <li v-for="item in selectedMember.experiences" :key="item">
            <GraduationCap :size="16" />
            <span>{{ item }}</span>
          </li>
        </ul>
      </div>

      <div v-if="selectedMember.destination" class="drawer-section destination-panel">
        <h3>毕业去向</h3>
        <p>{{ selectedMember.destination }}</p>
      </div>

      <div class="drawer-contact">
        <a :href="`mailto:${selectedMember.email}`">
          <Mail :size="18" />
          {{ selectedMember.email }}
        </a>
        <a v-if="selectedMember.phone" :href="`tel:${selectedMember.phone}`">
          <Phone :size="18" />
          {{ selectedMember.phone }}
        </a>
        <p v-else>
          <Phone :size="18" />
          电话未公开
        </p>
      </div>
    </aside>
  </main>
</template>
