<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  Award,
  BriefcaseBusiness,
  ChevronRight,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-vue-next'
import { studentProfiles, type StudentProfile, type StudentStatus } from '../data/students/index'
import { memberApi } from '../utils/api'
import { useAuth } from '../utils/useAuth'
import { publicAsset, resolvePhotoUrl } from '../utils/publicAsset'
import PhotoUploader from '../components/PhotoUploader.vue'

type EditorMode = 'create' | 'edit'
type MemberForm = Omit<StudentProfile, 'research' | 'achievements' | 'experiences'> & {
  researchText: string
  achievementsText: string
  experiencesText: string
}

const allCohorts = '全部'

const members = ref<StudentProfile[]>(studentProfiles)
const apiError = ref('')
const isLoadingMembers = ref(false)
const activeCohort = ref(allCohorts)
const searchText = ref('')
const statusFilter = ref<'全部' | 'current' | 'alumni'>('全部')
const cohortSortAsc = ref(true)
const nameSortAsc = ref(true)
const selectedMember = ref<StudentProfile | null>(null)
const bioExpanded = ref(false)

const statusFilterLabels: Record<string, string> = { '全部': '全部', 'current': '在读', 'alumni': '毕业' }
const statusFilterCycle = ['全部', 'current', 'alumni'] as const

function cycleStatusFilter() {
  const idx = statusFilterCycle.indexOf(statusFilter.value)
  statusFilter.value = statusFilterCycle[(idx + 1) % statusFilterCycle.length]
}

function toggleCohortSort() {
  cohortSortAsc.value = !cohortSortAsc.value
}

function toggleNameSort() {
  nameSortAsc.value = !nameSortAsc.value
}
const editorMode = ref<EditorMode>('create')
const isEditorOpen = ref(false)
const editorError = ref('')
const isSavingMember = ref(false)
const editorForm = ref<MemberForm>(createEmptyForm())
const labLife = publicAsset('gallery/lab/lab-life.jpg')

const { isMember } = useAuth()

// ---- 籍贯级联选择 ----

interface RegionCity {
  name: string
  cities: string[]
}

const regionData: RegionCity[] = [
  { name: '北京', cities: ['东城区', '西城区', '朝阳区', '丰台区', '石景山区', '海淀区', '顺义区', '通州区', '大兴区', '房山区', '昌平区', '怀柔区', '密云区', '延庆区', '平谷区', '门头沟区'] },
  { name: '天津', cities: ['和平区', '河东区', '河西区', '南开区', '河北区', '红桥区', '东丽区', '西青区', '津南区', '北辰区', '武清区', '宝坻区', '滨海新区', '宁河区', '静海区', '蓟州区'] },
  { name: '上海', cities: ['黄浦区', '徐汇区', '长宁区', '静安区', '普陀区', '虹口区', '杨浦区', '浦东新区', '闵行区', '宝山区', '嘉定区', '金山区', '松江区', '青浦区', '奉贤区', '崇明区'] },
  { name: '重庆', cities: ['万州区', '涪陵区', '渝中区', '大渡口区', '江北区', '沙坪坝区', '九龙坡区', '南岸区', '北碚区', '綦江区', '大足区', '渝北区', '巴南区', '黔江区', '长寿区', '江津区', '合川区', '永川区', '南川区', '璧山区', '铜梁区', '潼南区', '荣昌区', '开州区', '梁平区', '武隆区'] },
  { name: '河北', cities: ['石家庄', '唐山', '秦皇岛', '邯郸', '邢台', '保定', '张家口', '承德', '沧州', '廊坊', '衡水'] },
  { name: '山西', cities: ['太原', '大同', '阳泉', '长治', '晋城', '朔州', '晋中', '运城', '忻州', '临汾', '吕梁'] },
  { name: '内蒙古', cities: ['呼和浩特', '包头', '乌海', '赤峰', '通辽', '鄂尔多斯', '呼伦贝尔', '巴彦淖尔', '乌兰察布', '兴安盟', '锡林郭勒', '阿拉善'] },
  { name: '辽宁', cities: ['沈阳', '大连', '鞍山', '抚顺', '本溪', '丹东', '锦州', '营口', '阜新', '辽阳', '盘锦', '铁岭', '朝阳', '葫芦岛'] },
  { name: '吉林', cities: ['长春', '吉林', '四平', '辽源', '通化', '白山', '松原', '白城', '延边'] },
  { name: '黑龙江', cities: ['哈尔滨', '齐齐哈尔', '鸡西', '鹤岗', '双鸭山', '大庆', '伊春', '佳木斯', '七台河', '牡丹江', '黑河', '绥化', '大兴安岭'] },
  { name: '江苏', cities: ['南京', '无锡', '徐州', '常州', '苏州', '南通', '连云港', '淮安', '盐城', '扬州', '镇江', '泰州', '宿迁'] },
  { name: '浙江', cities: ['杭州', '宁波', '温州', '嘉兴', '湖州', '绍兴', '金华', '衢州', '舟山', '台州', '丽水'] },
  { name: '安徽', cities: ['合肥', '芜湖', '蚌埠', '淮南', '马鞍山', '淮北', '铜陵', '安庆', '黄山', '滁州', '阜阳', '宿州', '六安', '亳州', '池州', '宣城'] },
  { name: '福建', cities: ['福州', '厦门', '莆田', '三明', '泉州', '漳州', '南平', '龙岩', '宁德'] },
  { name: '江西', cities: ['南昌', '景德镇', '萍乡', '九江', '新余', '鹰潭', '赣州', '吉安', '宜春', '抚州', '上饶'] },
  { name: '山东', cities: ['济南', '青岛', '淄博', '枣庄', '东营', '烟台', '潍坊', '济宁', '泰安', '威海', '日照', '临沂', '德州', '聊城', '滨州', '菏泽'] },
  { name: '河南', cities: ['郑州', '开封', '洛阳', '平顶山', '安阳', '鹤壁', '新乡', '焦作', '濮阳', '许昌', '漯河', '三门峡', '南阳', '商丘', '信阳', '周口', '驻马店', '济源'] },
  { name: '湖北', cities: ['武汉', '黄石', '十堰', '宜昌', '襄阳', '鄂州', '荆门', '孝感', '荆州', '黄冈', '咸宁', '随州', '恩施', '仙桃', '潜江', '天门', '神农架'] },
  { name: '湖南', cities: ['长沙', '株洲', '湘潭', '衡阳', '邵阳', '岳阳', '常德', '张家界', '益阳', '郴州', '永州', '怀化', '娄底', '湘西'] },
  { name: '广东', cities: ['广州', '韶关', '深圳', '珠海', '汕头', '佛山', '江门', '湛江', '茂名', '肇庆', '惠州', '梅州', '汕尾', '河源', '阳江', '清远', '东莞', '中山', '潮州', '揭阳', '云浮'] },
  { name: '广西', cities: ['南宁', '柳州', '桂林', '梧州', '北海', '防城港', '钦州', '贵港', '玉林', '百色', '贺州', '河池', '来宾', '崇左'] },
  { name: '海南', cities: ['海口', '三亚', '三沙', '儋州', '五指山', '琼海', '文昌', '万宁', '东方', '定安', '屯昌', '澄迈', '临高', '白沙', '昌江', '乐东', '陵水', '保亭', '琼中'] },
  { name: '四川', cities: ['成都', '自贡', '攀枝花', '泸州', '德阳', '绵阳', '广元', '遂宁', '内江', '乐山', '南充', '眉山', '宜宾', '广安', '达州', '雅安', '巴中', '资阳', '阿坝', '甘孜', '凉山'] },
  { name: '贵州', cities: ['贵阳', '六盘水', '遵义', '安顺', '毕节', '铜仁', '黔西南', '黔东南', '黔南'] },
  { name: '云南', cities: ['昆明', '曲靖', '玉溪', '保山', '昭通', '丽江', '普洱', '临沧', '楚雄', '红河', '文山', '西双版纳', '大理', '德宏', '怒江', '迪庆'] },
  { name: '西藏', cities: ['拉萨', '日喀则', '昌都', '林芝', '山南', '那曲', '阿里'] },
  { name: '陕西', cities: ['西安', '铜川', '宝鸡', '咸阳', '渭南', '延安', '汉中', '榆林', '安康', '商洛'] },
  { name: '甘肃', cities: ['兰州', '嘉峪关', '金昌', '白银', '天水', '武威', '张掖', '平凉', '酒泉', '庆阳', '定西', '陇南', '临夏', '甘南'] },
  { name: '青海', cities: ['西宁', '海东', '海北', '黄南', '海南', '果洛', '玉树', '海西'] },
  { name: '宁夏', cities: ['银川', '石嘴山', '吴忠', '固原', '中卫'] },
  { name: '新疆', cities: ['乌鲁木齐', '克拉玛依', '吐鲁番', '哈密', '昌吉', '博尔塔拉', '巴音郭楞', '阿克苏', '克孜勒苏', '喀什', '和田', '伊犁', '塔城', '阿勒泰', '石河子'] },
  { name: '香港', cities: ['中西区', '湾仔区', '东区', '南区', '油尖旺区', '深水埗区', '九龙城区', '黄大仙区', '观塘区', '荃湾区', '屯门区', '元朗区', '北区', '大埔区', '西贡区', '沙田区', '葵青区', '离岛区'] },
  { name: '澳门', cities: ['花地玛堂区', '圣安多尼堂区', '大堂区', '望德堂区', '风顺堂区', '嘉模堂区', '圣方济各堂区'] },
  { name: '台湾', cities: ['台北', '高雄', '新北', '台中', '台南', '桃园', '新竹', '基隆', '嘉义', '彰化', '屏东', '宜兰', '花莲', '台东', '澎湖', '金门', '连江'] },
]

const nativeProvince = ref('')
const nativeCity = ref('')
const destProvince = ref('')
const destCity = ref('')

const nativeCities = computed(() => {
  if (!nativeProvince.value) return []
  const region = regionData.find((r) => r.name === nativeProvince.value)
  return region ? region.cities : []
})

const destCities = computed(() => {
  if (!destProvince.value) return []
  const region = regionData.find((r) => r.name === destProvince.value)
  return region ? region.cities : []
})

function parseNativePlace(raw: string) {
  nativeProvince.value = ''
  nativeCity.value = ''
  if (!raw) return
  // Match the longest known province from the start
  const sorted = regionData.map((r) => r.name).sort((a, b) => b.length - a.length)
  for (const p of sorted) {
    if (raw.startsWith(p)) {
      nativeProvince.value = p
      nativeCity.value = raw.slice(p.length)
      return
    }
  }
}

function parseDestination(raw: string) {
  destProvince.value = ''
  destCity.value = ''
  editorForm.value.destination = ''
  if (!raw) return
  const sorted = regionData.map((r) => r.name).sort((a, b) => b.length - a.length)
  for (const p of sorted) {
    if (raw.startsWith(p)) {
      destProvince.value = p
      const remaining = raw.slice(p.length)
      const region = regionData.find((r) => r.name === p)
      if (region) {
        const citySorted = region.cities.sort((a, b) => b.length - a.length)
        for (const c of citySorted) {
          if (remaining.startsWith(c)) {
            destCity.value = c
            editorForm.value.destination = remaining.slice(c.length)
            return
          }
        }
      }
      editorForm.value.destination = remaining
      return
    }
  }
  // No province match, treat whole thing as unit name
  editorForm.value.destination = raw
}

watch([nativeProvince, nativeCity], () => {
  if (nativeProvince.value) {
    editorForm.value.nativePlace = nativeProvince.value + (nativeCity.value || '')
  } else {
    editorForm.value.nativePlace = ''
  }
})

const cohortOrder = computed(() =>
  Array.from(new Set(members.value.map((member) => member.cohort))).sort((a, b) => b.localeCompare(a)),
)

const cohorts = computed(() => [allCohorts, ...cohortOrder.value])

const filteredMembers = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()

  return members.value.filter((member) => {
    const matchesStatus = statusFilter.value === '全部' || member.status === statusFilter.value
    const matchesCohort = activeCohort.value === allCohorts || member.cohort === activeCohort.value
    const text = [
      member.name,
      member.cohort,
      member.degree,
      member.nativePlace,
      member.wechat,
      member.destination,
      member.email,
      ...member.research,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return matchesStatus && matchesCohort && (!keyword || text.includes(keyword))
  })
})

const groupedMembers = computed(() => {
  const orderedCohorts = [...cohortOrder.value].sort((a, b) =>
    cohortSortAsc.value ? a.localeCompare(b) : b.localeCompare(a),
  )

  return orderedCohorts
    .map((cohort) => ({
      cohort,
      members: filteredMembers.value
        .filter((member) => member.cohort === cohort)
        .sort((a, b) => {
          const cmp = a.name.localeCompare(b.name, 'zh')
          return nameSortAsc.value ? cmp : -cmp
        }),
    }))
    .filter((group) => group.members.length > 0)
})

const stats = computed(() => {
  const alumni = members.value.filter((member) => member.status === 'alumni').length
  const current = members.value.filter((member) => member.status === 'current').length

  return [
    { label: '成员档案', value: members.value.length },
    { label: '在读学生', value: current },
    { label: '历届毕业生', value: alumni },
    { label: '届别分组', value: cohorts.value.length - 1 },
  ]
})

function statusLabel(status: StudentStatus) {
  return status === 'current' ? '在读' : '毕业'
}

function parseDestinationDisplay(raw: string | undefined): { city: string; unit: string } {
  if (!raw) return { city: '', unit: '' }

  const sorted = regionData.map((r) => r.name).sort((a, b) => b.length - a.length)
  for (const p of sorted) {
    if (raw.startsWith(p)) {
      const remaining = raw.slice(p.length)
      const region = regionData.find((r) => r.name === p)
      if (region) {
        const citySorted = region.cities.sort((a, b) => b.length - a.length)
        for (const c of citySorted) {
          if (remaining.startsWith(c)) {
            return { city: c, unit: remaining.slice(c.length) }
          }
        }
      }
      return { city: p, unit: remaining }
    }
  }
  return { city: '', unit: raw }
}

function initials(name: string) {
  return name.replace(/\d{4}届/g, '').replace(/\s+/g, '').slice(0, 2).toUpperCase()
}

function selectMember(member: StudentProfile) {
  selectedMember.value = member
}

function clearSelectedMember() {
  selectedMember.value = null
  bioExpanded.value = false
}

async function loadMembers() {
  isLoadingMembers.value = true
  apiError.value = ''

  try {
    members.value = await memberApi.listStudents()
  } catch {
    members.value = studentProfiles
    apiError.value = '成员数据服务暂时不可用，当前显示内置备份数据。'
  } finally {
    isLoadingMembers.value = false
  }
}

function openCreateEditor() {
  editorMode.value = 'create'
  editorForm.value = createEmptyForm()
  nativeProvince.value = ''
  nativeCity.value = ''
  destProvince.value = ''
  destCity.value = ''
  editorError.value = ''
  isEditorOpen.value = true
}

function openEditEditor(member: StudentProfile) {
  editorMode.value = 'edit'
  editorForm.value = toForm(member)
  parseNativePlace(member.nativePlace ?? '')
  parseDestination(member.destination ?? '')
  editorError.value = ''
  isEditorOpen.value = true
}

function closeEditor() {
  isEditorOpen.value = false
  editorError.value = ''
}

function handlePhotoUploadSuccess(photo: string) {
  editorForm.value.photo = photo
}

function handlePhotoUploadError(error: string) {
  editorError.value = error
}

async function saveMember() {
  editorError.value = ''
  isSavingMember.value = true

  try {
    // 合并毕业去向：省+市+单位名称
    if (editorForm.value.status !== 'current') {
      const parts = [destProvince.value, destCity.value, editorForm.value.destination].filter(Boolean).join('')
      editorForm.value.destination = parts
    } else {
      editorForm.value.destination = ''
    }
    const payload = fromForm(editorForm.value)
    if (editorMode.value === 'create') {
      await memberApi.createStudent(payload)
    } else {
      await memberApi.updateStudent(payload.id, payload)
    }
    closeEditor()
    await loadMembers()
    if (selectedMember.value?.id === payload.id) {
      selectedMember.value = members.value.find((member) => member.id === payload.id) ?? null
    }
  } catch {
    editorError.value = '保存失败，请确认后端服务可用且登录状态有效。'
  } finally {
    isSavingMember.value = false
  }
}

async function deleteMember(member: StudentProfile) {
  if (!window.confirm(`确认删除 ${member.name} 吗？此操作会更新公开成员数据。`)) return

  try {
    await memberApi.deleteStudent(member.id)
    if (selectedMember.value?.id === member.id) clearSelectedMember()
    await loadMembers()
  } catch {
    editorError.value = '删除失败，请确认后端服务可用且登录状态有效。'
  }
}

function createEmptyForm(): MemberForm {
  return {
    id: '',
    name: '',
    cohort: '',
    degree: '',
    status: 'current',
    researchText: '',
    email: '',
    phone: '',
    wechat: '',
    nativePlace: '',
    photo: '',
    destination: '',
    bio: '',
    achievementsText: '',
    experiencesText: '',
  }
}

function toForm(member: StudentProfile): MemberForm {
  return {
    ...member,
    phone: member.phone ?? '',
    wechat: member.wechat ?? '',
    nativePlace: member.nativePlace ?? '',
    photo: member.photo ?? '',
    destination: member.destination ?? '',
    researchText: member.research.join('\n'),
    achievementsText: member.achievements.join('\n'),
    experiencesText: member.experiences.join('\n'),
  }
}

function fromForm(form: MemberForm): StudentProfile {
  const id = form.id.trim() || createMemberId(form)

  return {
    id,
    name: form.name.trim(),
    cohort: form.cohort.trim(),
    degree: form.degree.trim(),
    status: form.status,
    research: lines(form.researchText),
    email: form.email.trim(),
    phone: form.phone?.trim(),
    wechat: form.wechat?.trim(),
    nativePlace: form.nativePlace?.trim(),
    photo: form.photo?.trim(),
    destination: form.destination?.trim(),
    bio: form.bio.trim(),
    achievements: lines(form.achievementsText),
    experiences: lines(form.experiencesText),
  }
}

function lines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function createMemberId(form: MemberForm) {
  const namePart = form.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${form.cohort.trim() || 'member'}-${namePart || Date.now()}`
}

onMounted(() => {
  void loadMembers()
})
</script>

<template>
  <main class="people-page">
    <section class="people-hero" aria-labelledby="people-title">
      <img :src="labLife" alt="" aria-hidden="true" />
      <div class="people-hero-overlay"></div>
      <div class="people-hero-content">
        <p class="eyebrow">People Directory</p>
        <h1 id="people-title">团队成员</h1>
        <p>按届别管理在读学生与历届毕业生，集中展示照片、研究方向、代表成果、个人经历、联系方式和毕业去向。</p>
        <div class="people-stats" aria-label="成员概览">
          <article v-for="item in stats" :key="item.label">
            <strong>{{ item.value }}</strong>
            <span>{{ item.label }}</span>
          </article>
        </div>
      </div>
    </section>

    <section class="people-directory" aria-label="成员列表">
      <div class="directory-toolbar member-admin-toolbar">
        <div>
          <p class="section-kicker">Directory</p>
          <h2>团队成员档案</h2>
          <p v-if="isLoadingMembers" class="api-state">正在同步成员数据...</p>
          <p v-else-if="apiError" class="api-state warning">{{ apiError }}</p>
        </div>
        <div class="member-admin-actions">
          <label class="people-search">
            <Search :size="18" />
            <input v-model="searchText" type="search" placeholder="搜索姓名、方向、邮箱或去向" />
          </label>
        </div>
      </div>

      <div class="member-admin-bar" aria-label="成员管理">
        <div class="admin-bar-left">
          <span class="filter-label">状态</span>
          <button
            type="button"
            class="status-toggle-btn"
            :class="{ active: statusFilter !== '全部' }"
            @click="cycleStatusFilter"
          >{{ statusFilterLabels[statusFilter] }}</button>
          <span class="filter-label">排序</span>
          <div class="sort-group">
            <button
              type="button"
              class="sort-btn active"
              @click="toggleNameSort"
            >按姓氏{{ nameSortAsc ? ' ↑' : ' ↓' }}</button>
            <button
              type="button"
              class="sort-btn active"
              @click="toggleCohortSort"
            >按年级{{ cohortSortAsc ? ' ↑' : ' ↓' }}</button>
          </div>
        </div>
        <button v-if="isMember" class="member-create-btn" type="button" @click="openCreateEditor">
          <Plus :size="20" />
          <span>新增成员</span>
        </button>
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
          <p>成员信息按届别归档。认证后可在本页新增、编辑或删除成员资料。</p>
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
                    <img v-if="member.photo" :src="resolvePhotoUrl(member.photo)" :alt="member.name" />
                    <span v-else>{{ initials(member.name) }}</span>
                  </div>
                  <div class="member-info">
                    <div class="member-title-row">
                      <h4>{{ member.name }}</h4>
                      <span class="status-badge" :class="member.status">{{ statusLabel(member.status) }}</span>
                    </div>
                    <p>{{ member.degree }}</p>
                    <div class="tag-list">
                      <span v-for="tag in member.research" :key="tag">{{ tag }}</span>
                    </div>
                    <div class="member-facts">
                      <span>
                        <Award :size="15" />
                        成果 {{ member.achievements.length }}
                      </span>
                      <span v-if="isMember && member.nativePlace">
                        <MapPin :size="15" />
                        {{ member.nativePlace }}
                      </span>
                    </div>
                    <div v-if="isMember && member.destination" class="destination">
                      <BriefcaseBusiness :size="15" />
                      <span>{{ [parseDestinationDisplay(member.destination).city, parseDestinationDisplay(member.destination).unit].filter(Boolean).join('/') }}</span>
                    </div>
                  </div>
                </button>

                <div class="member-actions">
                  <template v-if="isMember">
                    <button type="button" aria-label="编辑成员" @click="openEditEditor(member)">
                      <Pencil :size="16" />
                    </button>
                    <button type="button" aria-label="删除成员" @click="deleteMember(member)">
                      <Trash2 :size="16" />
                    </button>
                  </template>
                  <button v-else type="button" aria-label="成员专属" disabled class="locked-hint">
                    <Lock :size="15" />
                  </button>
                  <button type="button" @click="selectMember(member)">详情</button>
                </div>
              </article>
            </div>
          </section>

          <div v-if="groupedMembers.length === 0" class="empty-state">
            <UserRound :size="36" />
            <h3>没有匹配的成员</h3>
            <p>可以清空搜索词，或切换届别筛选。</p>
          </div>
        </div>
      </div>
    </section>

    <div v-if="selectedMember" class="modal-backdrop" @click="clearSelectedMember"></div>
    <aside v-if="selectedMember" class="member-modal" role="dialog" aria-modal="true" aria-label="成员详情" @keydown.esc="clearSelectedMember">
      <button class="modal-close" type="button" aria-label="关闭成员详情" @click="clearSelectedMember">
        <X :size="22" />
      </button>

      <div class="modal-body">
        <div class="modal-info">
          <div class="modal-header">
            <div class="modal-avatar">
              <img v-if="selectedMember.photo" :src="resolvePhotoUrl(selectedMember.photo)" :alt="selectedMember.name" />
              <span v-else>{{ initials(selectedMember.name) }}</span>
            </div>
            <div class="modal-header-text">
              <div class="modal-name-row">
                <h2>{{ selectedMember.name }}</h2>
                <span class="status-badge" :class="selectedMember.status">{{ statusLabel(selectedMember.status) }}</span>
              </div>
              <p v-if="selectedMember.nativePlace" class="modal-native">{{ selectedMember.nativePlace }}</p>
              <p class="modal-degree">{{ selectedMember.degree }} · {{ selectedMember.cohort }}</p>
            </div>
            <div v-if="selectedMember.status === 'alumni' && selectedMember.destination" class="modal-destination-header">
              <BriefcaseBusiness :size="14" />
              <span class="destination-value">{{ [parseDestinationDisplay(selectedMember.destination).city, parseDestinationDisplay(selectedMember.destination).unit].filter(Boolean).join('/') }}</span>
            </div>
          </div>

          <div class="modal-tags">
            <span v-for="tag in selectedMember.research" :key="tag">{{ tag }}</span>
          </div>

          <div class="modal-divider"></div>

          <div v-if="isMember" class="modal-contact-grid">
            <div v-if="selectedMember.phone" class="modal-contact-item">
              <div class="contact-icon">
                <Phone :size="15" />
              </div>
              <div class="contact-content">
                <span class="contact-label">电话</span>
                <span class="contact-value">{{ selectedMember.phone }}</span>
              </div>
            </div>
            <div v-if="selectedMember.email" class="modal-contact-item">
              <div class="contact-icon">
                <Mail :size="15" />
              </div>
              <div class="contact-content">
                <span class="contact-label">邮箱</span>
                <span class="contact-value">{{ selectedMember.email }}</span>
              </div>
            </div>
          </div>

          <div class="modal-bio-section">
            <h4 class="modal-section-title">
              <UserRound :size="16" />
              个人简介
            </h4>
            <div class="modal-bio" :class="{ expanded: bioExpanded }">
              <p>{{ selectedMember.bio }}</p>
              <button v-if="selectedMember.bio && selectedMember.bio.length > 100" type="button" class="bio-toggle" @click="bioExpanded = !bioExpanded">
                {{ bioExpanded ? '收起' : '展开全部' }}
              </button>
            </div>
          </div>

          <div v-if="selectedMember.achievements.length > 0" class="modal-section">
            <h4 class="modal-section-title">
              <Award :size="16" />
              代表成果
            </h4>
            <ul class="modal-list">
              <li v-for="(item, index) in selectedMember.achievements" :key="index">{{ item }}</li>
            </ul>
          </div>

          <div v-if="selectedMember.experiences.length > 0" class="modal-section">
            <h4 class="modal-section-title">
              <BriefcaseBusiness :size="16" />
              个人经历
            </h4>
            <ul class="modal-list">
              <li v-for="(item, index) in selectedMember.experiences" :key="index">{{ item }}</li>
            </ul>
          </div>
        </div>

        <div class="modal-photo">
          <img v-if="selectedMember.photo" :src="resolvePhotoUrl(selectedMember.photo)" :alt="selectedMember.name" />
          <span v-else class="modal-photo-initials">{{ initials(selectedMember.name) }}</span>
        </div>
      </div>
    </aside>

    <div v-if="isEditorOpen" class="drawer-backdrop" @click="closeEditor"></div>
    <aside v-if="isEditorOpen" class="profile-drawer member-editor" role="dialog" aria-modal="true" aria-label="编辑成员">
      <button class="drawer-close" type="button" aria-label="关闭编辑器" @click="closeEditor">
        <X :size="22" />
      </button>

      <form class="member-editor-form" @submit.prevent="saveMember">
        <div class="editor-heading">
          <h2>{{ editorMode === 'create' ? '新增成员' : '编辑成员' }}</h2>
        </div>

        <div v-if="editorMode === 'edit'" class="editor-photo-section">
          <span class="editor-section-label">成员照片</span>
          <PhotoUploader
            v-model="editorForm.photo"
            :member-id="editorForm.id"
            :member-name="editorForm.name"
            @upload-success="handlePhotoUploadSuccess"
            @upload-error="handlePhotoUploadError"
          />
        </div>

        <div class="editor-grid">
          <label>
            <span>姓名 <em class="required-hint">(必填)</em></span>
            <input v-model="editorForm.name" type="text" required />
          </label>
          <label>
            <span>届别 <em class="required-hint">(必填)</em></span>
            <input v-model="editorForm.cohort" type="text" required />
          </label>
        </div>
        <div class="editor-grid">
          <label>
            <span>学位</span>
            <select v-model="editorForm.degree">
              <option value="">请选择</option>
              <option value="硕士">硕士</option>
              <option value="博士">博士</option>
            </select>
          </label>
          <label>
            <span>状态</span>
            <select v-model="editorForm.status">
              <option value="current">在读</option>
              <option value="alumni">已毕业</option>
            </select>
          </label>
        </div>
        <div class="editor-grid">
          <label>
            <span>籍贯</span>
            <select v-model="nativeProvince" @change="nativeCity = ''">
              <option value="">请选择省份</option>
              <option v-for="r in regionData" :key="r.name" :value="r.name">{{ r.name }}</option>
            </select>
          </label>
          <label>
            <span>&nbsp;</span>
            <select v-model="nativeCity" :disabled="!nativeProvince">
              <option value="">请选择城市</option>
              <option v-for="c in nativeCities" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
        </div>
        <div class="editor-grid">
          <label>
            <span>电话</span>
            <input v-model="editorForm.phone" type="text" />
          </label>
          <label>
            <span>邮箱</span>
            <input v-model="editorForm.email" type="email" />
          </label>
        </div>

        <div v-if="editorForm.status !== 'current'" class="editor-destination">
          <span class="editor-section-label">毕业去向</span>
          <div class="editor-grid">
            <label>
              <select v-model="destProvince" @change="destCity = ''">
                <option value="">单位所在省</option>
                <option v-for="r in regionData" :key="r.name" :value="r.name">{{ r.name }}</option>
              </select>
            </label>
            <label>
              <select v-model="destCity" :disabled="!destProvince">
                <option value="">单位所在市</option>
                <option v-for="c in destCities" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
          </div>
          <label class="editor-destination-unit">
            <input v-model="editorForm.destination" type="text" placeholder="单位名称" />
          </label>
        </div>

        <label>
          <span>研究方向（每行一个）</span>
          <textarea v-model="editorForm.researchText" rows="3"></textarea>
        </label>
        <label>
          <span>个人简介</span>
          <textarea v-model="editorForm.bio" rows="4"></textarea>
        </label>
        <label>
          <span>代表成果（每行一个）</span>
          <textarea v-model="editorForm.achievementsText" rows="4"></textarea>
        </label>
        <label>
          <span>个人经历（每行一个）</span>
          <textarea v-model="editorForm.experiencesText" rows="4"></textarea>
        </label>

        <p v-if="editorError" class="login-error">{{ editorError }}</p>

        <div class="login-actions">
          <button type="submit" class="login-btn login-btn-confirm" :disabled="isSavingMember">
            <Save :size="17" />
            {{ isSavingMember ? '保存中...' : '保存' }}
          </button>
          <button type="button" class="login-btn login-btn-cancel" @click="closeEditor">取消</button>
        </div>
      </form>
    </aside>
  </main>
</template>
