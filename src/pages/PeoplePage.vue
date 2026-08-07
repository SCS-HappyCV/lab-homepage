<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Award,
  BriefcaseBusiness,
  Calendar,
  ChevronLeft,
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
import type { StudentProfile, StudentStatus } from '../data/students/types'
import { memberApi } from '../utils/api'
import { useAuth } from '../utils/useAuth'
import { publicAsset, resolvePhotoUrl } from '../utils/publicAsset'
import PhotoUploader from '../components/PhotoUploader.vue'

type EditorMode = 'create' | 'edit'
type MemberForm = Omit<StudentProfile, 'research' | 'achievements' | 'experiences'> & {
  coverPhoto: string
  researchText: string
  achievementsText: string
  experiencesText: string
}

const allCohorts = '全部'
const allResearchDirections = '全部'
const allAdvisors = '全部'

// 研究方向按每行两个的固定顺序排列
const researchDirectionKeywords = ['点云', '大模型', '高光谱', '变化检测', '目标检测', '语义分割']

const statusOptions = [
  { value: '全部' as const, label: '全部' },
  { value: 'current' as const, label: '在读' },
  { value: 'alumni' as const, label: '毕业' },
]

const members = ref<StudentProfile[]>([])
const apiError = ref('')
const isLoadingMembers = ref(false)
const activeCohorts = ref<string[]>([allCohorts])
const activeResearchDirections = ref<string[]>([allResearchDirections])
const advisorFilter = ref(allAdvisors)
const searchText = ref('')
const statusFilter = ref<'全部' | 'current' | 'alumni'>('全部')
const cohortSortAsc = ref(false)
const nameSortAsc = ref(true)
const selectedMember = ref<StudentProfile | null>(null)
const activeTab = ref<'bio' | 'achievements' | 'experiences'>('bio')

function toggleCohortSort() {
  cohortSortAsc.value = !cohortSortAsc.value
}

function toggleNameSort() {
  nameSortAsc.value = !nameSortAsc.value
}

function selectStatus(status: '全部' | 'current' | 'alumni') {
  statusFilter.value = status
}

function toggleCohortSelection(cohort: string) {
  if (cohort === allCohorts) {
    // 点击"全部"时，清除其他选择，只选"全部"
    activeCohorts.value = [allCohorts]
  } else {
    // 移除"全部"选项
    const filtered = activeCohorts.value.filter((c) => c !== allCohorts)

    if (filtered.includes(cohort)) {
      // 如果已选中，则取消选中
      const newSelection = filtered.filter((c) => c !== cohort)
      // 如果取消后没有选中任何项，则恢复"全部"
      activeCohorts.value = newSelection.length > 0 ? newSelection : [allCohorts]
    } else {
      // 如果未选中，则添加选中
      activeCohorts.value = [...filtered, cohort]
    }
  }
}

function toggleResearchDirection(direction: string) {
  if (direction === allResearchDirections) {
    activeResearchDirections.value = [allResearchDirections]
  } else {
    const filtered = activeResearchDirections.value.filter((d) => d !== allResearchDirections)

    if (filtered.includes(direction)) {
      const newSelection = filtered.filter((d) => d !== direction)
      activeResearchDirections.value = newSelection.length > 0 ? newSelection : [allResearchDirections]
    } else {
      activeResearchDirections.value = [...filtered, direction]
    }
  }
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

// ---- 出生日期三级联 ----

const birthYear = ref('')
const birthMonth = ref('')
const birthDay = ref('')

const birthYears = computed(() => {
  const current = new Date().getFullYear()
  const years: string[] = []
  for (let y = current - 60; y <= current; y++) {
    years.push(String(y))
  }
  return years.reverse()
})

const birthMonths = computed(() =>
  Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')),
)

const birthDays = computed(() => {
  if (!birthYear.value || !birthMonth.value) return []
  const daysInMonth = new Date(Number(birthYear.value), Number(birthMonth.value), 0).getDate()
  return Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))
})

watch([birthYear, birthMonth, birthDay], ([year, month, day]) => {
  if (year && month && day) {
    editorForm.value.birthDate = `${year}-${month}-${day}`
  } else {
    editorForm.value.birthDate = ''
  }
})

function parseBirthDate(raw: string | undefined) {
  birthYear.value = ''
  birthMonth.value = ''
  birthDay.value = ''
  if (!raw) return
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return
  const [, y, m, d] = match
  birthYear.value = y
  birthMonth.value = m
  birthDay.value = d
}

const cohortOrder = computed(() =>
  Array.from(new Set(members.value.map((member) => member.cohort))).sort((a, b) => b.localeCompare(a)),
)

const cohorts = computed(() => [allCohorts, ...cohortOrder.value])

const researchDirectionGroups = computed(() => {
  const groups: string[][] = []
  for (let i = 0; i < researchDirectionKeywords.length; i += 2) {
    groups.push(researchDirectionKeywords.slice(i, i + 2))
  }
  return groups
})

const filteredMembers = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()

  return members.value.filter((member) => {
    const matchesStatus = statusFilter.value === '全部' || member.status === statusFilter.value
    const matchesCohort = activeCohorts.value.includes(allCohorts) || activeCohorts.value.includes(member.cohort)
    const matchesResearchDirection =
      activeResearchDirections.value.includes(allResearchDirections) ||
      activeResearchDirections.value.some((dir) => member.research.some((item) => item.includes(dir)))
    const matchesAdvisor = advisorFilter.value === allAdvisors || member.advisor === advisorFilter.value
    const text = [
      member.name,
      member.cohort,
      member.degree,
      member.advisor,
      member.nativePlace,
      member.wechat,
      member.destination,
      member.email,
      ...member.research,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return (
      matchesStatus &&
      matchesCohort &&
      matchesResearchDirection &&
      matchesAdvisor &&
      (!keyword || text.includes(keyword))
    )
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

// 当前可见成员的扁平顺序，用于详情弹窗左右切换
const orderedMembers = computed(() => groupedMembers.value.flatMap((group) => group.members))

const stats = computed(() => {
  const alumni = members.value.filter((member) => member.status === 'alumni').length
  const current = members.value.filter((member) => member.status === 'current').length

  return [
    { label: '成员档案', value: members.value.length },
    { label: '在读学生', value: current },
    { label: '历届毕业生', value: alumni },
    { label: '年级数量', value: cohorts.value.length - 1 },
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
  activeTab.value = 'bio'
}

function clearSelectedMember() {
  selectedMember.value = null
  activeTab.value = 'bio'
}

function selectPrevMember() {
  if (!selectedMember.value || orderedMembers.value.length <= 1) return
  const index = orderedMembers.value.findIndex((member) => member.id === selectedMember.value!.id)
  const prevIndex = index <= 0 ? orderedMembers.value.length - 1 : index - 1
  selectedMember.value = orderedMembers.value[prevIndex]
  activeTab.value = 'bio'
}

function selectNextMember() {
  if (!selectedMember.value || orderedMembers.value.length <= 1) return
  const index = orderedMembers.value.findIndex((member) => member.id === selectedMember.value!.id)
  const nextIndex = index === -1 || index >= orderedMembers.value.length - 1 ? 0 : index + 1
  selectedMember.value = orderedMembers.value[nextIndex]
  activeTab.value = 'bio'
}

const hasContactInfo = computed(() => {
  if (!selectedMember.value) return false
  return !!(selectedMember.value.phone || selectedMember.value.email)
})

async function loadMembers() {
  isLoadingMembers.value = true
  apiError.value = ''

  try {
    members.value = await memberApi.listStudents()
  } catch {
    members.value = []
    apiError.value = '成员数据服务暂时不可用，请稍后刷新重试。'
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
  birthYear.value = ''
  birthMonth.value = ''
  birthDay.value = ''
  editorError.value = ''
  isEditorOpen.value = true
}

function openEditEditor(member: StudentProfile) {
  editorMode.value = 'edit'
  editorForm.value = toForm(member)
  editorForm.value.advisor = ''
  parseNativePlace(member.nativePlace ?? '')
  parseDestination(member.destination ?? '')
  parseBirthDate(member.birthDate ?? '')
  editorError.value = ''
  isEditorOpen.value = true
}

function closeEditor() {
  isEditorOpen.value = false
  editorError.value = ''
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
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    editorError.value = message
      ? `保存失败：${message}`
      : '保存失败，请确认后端服务可用且登录状态有效。'
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
    advisor: '',
    researchText: '',
    email: '',
    phone: '',
    wechat: '',
    nativePlace: '',
    birthDate: '',
    photo: '',
    coverPhoto: '',
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
    birthDate: member.birthDate ?? '',
    photo: member.photo ?? '',
    coverPhoto: member.coverPhoto ?? '',
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
    advisor: form.advisor.trim(),
    research: lines(form.researchText),
    email: form.email.trim(),
    phone: form.phone?.trim(),
    wechat: form.wechat?.trim(),
    nativePlace: form.nativePlace?.trim(),
    birthDate: form.birthDate?.trim(),
    photo: form.photo?.trim(),
    coverPhoto: form.coverPhoto?.trim(),
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
        <p>汇集在读学生与历届毕业生，集中展示照片、研究方向、代表成果、个人经历、联系方式和毕业去向。</p>
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
          <p v-if="apiError" class="api-state warning">{{ apiError }}</p>
        </div>
      </div>

      <div class="cohort-layout">
        <aside class="filter-panel" aria-label="成员筛选与排序">
          <label class="people-search filter-panel-search">
            <Search :size="18" />
            <input v-model="searchText" type="search" placeholder="搜索姓名、方向、邮箱或去向" />
          </label>

          <div class="filter-group">
            <h3 class="filter-panel-title">排序</h3>
            <div class="sort-group sort-group-vertical">
              <button type="button" class="sort-btn" @click="toggleNameSort">
                按姓氏
                <component :is="nameSortAsc ? ArrowUp : ArrowDown" :size="14" />
              </button>
              <button type="button" class="sort-btn" @click="toggleCohortSort">
                按年级
                <component :is="cohortSortAsc ? ArrowUp : ArrowDown" :size="14" />
              </button>
            </div>
          </div>

          <h3 class="filter-panel-title">筛选</h3>

          <div class="filter-group">
            <span class="filter-group-label">导师</span>
            <div class="filter-pill-row advisor-row">
              <button
                v-for="advisor in [allAdvisors, '周维', '许海霞']"
                :key="advisor"
                type="button"
                :class="['filter-pill', { active: advisorFilter === advisor }]"
                @click="advisorFilter = advisor"
              >
                {{ advisor }}
              </button>
            </div>
          </div>

          <div class="filter-group">
            <span class="filter-group-label">状态</span>
            <div class="filter-pill-row">
              <button
                v-for="item in statusOptions"
                :key="item.value"
                type="button"
                :class="['filter-pill', { active: statusFilter === item.value }]"
                @click="selectStatus(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
          </div>

          <div class="filter-group">
            <span class="filter-group-label">年级</span>
            <div class="filter-pill-grid">
              <button
                v-for="cohort in cohorts"
                :key="cohort"
                type="button"
                :class="['filter-pill', { active: activeCohorts.includes(cohort) }]"
                @click="toggleCohortSelection(cohort)"
              >
                {{ cohort }}
              </button>
            </div>
          </div>

          <div class="filter-group research-directions">
            <span class="filter-group-label">研究方向</span>
            <div class="filter-pill-flex">
              <button
                type="button"
                :class="['filter-pill', { active: activeResearchDirections.includes(allResearchDirections) }]"
                @click="toggleResearchDirection(allResearchDirections)"
              >
                {{ allResearchDirections }}
              </button>
            </div>
            <div v-for="(group, index) in researchDirectionGroups" :key="index" class="filter-pill-flex">
              <button
                v-for="direction in group"
                :key="direction"
                type="button"
                :class="['filter-pill', { active: activeResearchDirections.includes(direction) }]"
                @click="toggleResearchDirection(direction)"
              >
                {{ direction }}
              </button>
            </div>
          </div>

          <button v-if="isMember" class="member-create-btn" type="button" @click="openCreateEditor">
            <Plus :size="20" />
            <span>新增成员</span>
          </button>
        </aside>

        <div class="member-groups">
          <div v-if="isLoadingMembers" class="member-loading">
            <span>加载中…</span>
            <span class="loading-dots" aria-hidden="true"></span>
            <span>Loading...</span>
          </div>

          <section v-for="group in groupedMembers" :key="group.cohort" class="member-group">
            <div class="member-group-heading">
              <h3>{{ group.cohort }}级</h3>
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
                      <span v-if="isMember && member.birthDate">
                        <Calendar :size="15" />
                        {{ member.birthDate }}
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

          <div v-if="groupedMembers.length === 0 && !isLoadingMembers" class="empty-state">
            <UserRound :size="36" />
            <h3>没有匹配的成员</h3>
            <p>可以清空搜索词，或调整年级筛选。</p>
          </div>
        </div>
      </div>
    </section>

    <div v-if="selectedMember" class="modal-portal">
      <div class="modal-backdrop" @click="clearSelectedMember"></div>
      <div class="modal-stage">
        <button class="modal-nav modal-nav-prev" type="button" aria-label="上一个成员" :disabled="orderedMembers.length <= 1" @click="selectPrevMember">
          <ChevronLeft :size="24" />
        </button>
        <aside class="member-modal" role="dialog" aria-modal="true" aria-label="成员详情" @keydown.esc="clearSelectedMember" @keydown.left="selectPrevMember" @keydown.right="selectNextMember">
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
                      <div class="modal-native-row">
                        <p v-if="selectedMember.nativePlace" class="modal-native">
                          {{ selectedMember.nativePlace }}
                        </p>
                        <p v-if="selectedMember.advisor" class="modal-advisor"><strong>导师</strong>：{{ selectedMember.advisor }}</p>
                      </div>
                      <div class="modal-degree-row">
                        <p class="modal-degree">{{ selectedMember.degree }} · {{ selectedMember.cohort }}级</p>
                        <p v-if="isMember && selectedMember.birthDate" class="modal-birth">
                          <Calendar :size="14" />
                          {{ selectedMember.birthDate }}
                        </p>
                      </div>
                    </div>
                    <div v-if="isMember && selectedMember.status === 'alumni' && selectedMember.destination" class="modal-destination-header">
                      <div class="destination-line">
                        <BriefcaseBusiness :size="16" />
                        <span class="destination-unit">{{ parseDestinationDisplay(selectedMember.destination).unit }}</span>
                      </div>
                      <div class="destination-line">
                        <MapPin :size="16" />
                        <span class="destination-city">{{ parseDestinationDisplay(selectedMember.destination).city }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="modal-tags">
                    <span v-for="tag in selectedMember.research" :key="tag">{{ tag }}</span>
                  </div>

                  <div v-if="isMember && hasContactInfo" class="modal-contact-grid">
                    <div v-if="selectedMember.phone" class="modal-contact-item contact-phone">
                      <div class="contact-icon">
                        <Phone :size="18" />
                      </div>
                      <div class="contact-content">
                        <span class="contact-label">电话</span>
                        <span class="contact-value">{{ selectedMember.phone }}</span>
                      </div>
                    </div>
                    <div v-if="selectedMember.email" class="modal-contact-item contact-email">
                      <div class="contact-icon">
                        <Mail :size="18" />
                      </div>
                      <div class="contact-content">
                        <span class="contact-label">邮箱</span>
                        <span class="contact-value">{{ selectedMember.email }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="modal-tabs" :class="{ 'no-contact': !hasContactInfo || !isMember }">
                    <button type="button" class="modal-tab" :class="{ active: activeTab === 'bio' }" @click="activeTab = 'bio'">
                      <UserRound :size="15" />
                      个人简介
                    </button>
                    <button type="button" class="modal-tab" :class="{ active: activeTab === 'achievements' }" @click="activeTab = 'achievements'">
                      <Award :size="15" />
                      代表成果
                    </button>
                    <button type="button" class="modal-tab" :class="{ active: activeTab === 'experiences' }" @click="activeTab = 'experiences'">
                      <BriefcaseBusiness :size="15" />
                      个人经历
                    </button>
                  </div>

                  <div class="modal-tab-content">
                    <div v-if="activeTab === 'bio'" class="modal-tab-panel">
                      <p v-if="selectedMember.bio" class="modal-bio-text">{{ selectedMember.bio }}</p>
                      <p v-else class="modal-empty-text">暂无个人简介</p>
                    </div>
                    <div v-else-if="activeTab === 'achievements'" class="modal-tab-panel">
                      <ul v-if="selectedMember.achievements.length > 0" class="modal-list">
                        <li v-for="(item, index) in selectedMember.achievements" :key="index">{{ item }}</li>
                      </ul>
                      <p v-else class="modal-empty-text">暂无代表成果</p>
                    </div>
                    <div v-else-if="activeTab === 'experiences'" class="modal-tab-panel">
                      <ul v-if="selectedMember.experiences.length > 0" class="modal-list">
                        <li v-for="(item, index) in selectedMember.experiences" :key="index">{{ item }}</li>
                      </ul>
                      <p v-else class="modal-empty-text">暂无个人经历</p>
                    </div>
                  </div>
                </div>

                <div class="modal-photo">
                  <img v-if="selectedMember.coverPhoto" :src="resolvePhotoUrl(selectedMember.coverPhoto)" :alt="selectedMember.name" />
                  <img v-else-if="selectedMember.photo" :src="resolvePhotoUrl(selectedMember.photo)" :alt="selectedMember.name" />
                  <span v-else class="modal-photo-initials">{{ initials(selectedMember.name) }}</span>
                </div>
              </div>
            </aside>
            <button class="modal-nav modal-nav-next" type="button" aria-label="下一个成员" :disabled="orderedMembers.length <= 1" @click="selectNextMember">
              <ChevronRight :size="24" />
            </button>
        </div>
    </div>

    <div v-if="isEditorOpen" class="editor-portal">
      <div class="editor-backdrop" @click="closeEditor"></div>
      <aside class="member-editor-card" role="dialog" aria-modal="true" aria-label="编辑成员">
        <form class="member-editor-form" @submit.prevent="saveMember">
          <div class="editor-header">
            <div class="editor-heading">
              <h2>{{ editorMode === 'create' ? '新增成员' : '编辑成员' }}</h2>
            </div>
            <button class="editor-close" type="button" aria-label="关闭编辑器" @click="closeEditor">
              <X :size="22" />
            </button>
          </div>

          <div class="editor-body">
            <div class="editor-photo-section">
              <span class="editor-section-label">成员头像</span>
              <PhotoUploader
                v-model="editorForm.photo"
                :member-name="editorForm.name"
                mode="avatar"
                @upload-error="handlePhotoUploadError"
              />
            </div>

            <div class="editor-photo-section">
              <span class="editor-section-label">背景图片</span>
              <PhotoUploader
                v-model="editorForm.coverPhoto"
                :member-name="editorForm.name"
                mode="cover"
                @upload-error="handlePhotoUploadError"
              />
            </div>

            <div class="editor-grid">
              <label>
                <span>姓名 <em class="required-hint">(必填)</em></span>
                <input v-model="editorForm.name" type="text" required />
              </label>
              <label>
                <span>年级 <em class="required-hint">(必填)</em></span>
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
                <span>导师</span>
                <select v-model="editorForm.advisor">
                  <option value="">请选择</option>
                  <option value="周维">周维</option>
                  <option value="许海霞">许海霞</option>
                </select>
              </label>
              <label>
                <span>&nbsp;</span>
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
                <span>出生日期</span>
                <select v-model="birthYear" @change="birthMonth = ''; birthDay = ''">
                  <option value="">年</option>
                  <option v-for="y in birthYears" :key="y" :value="y">{{ y }}</option>
                </select>
              </label>
              <label>
                <span>&nbsp;</span>
                <div class="birth-date-row">
                  <select v-model="birthMonth" :disabled="!birthYear" @change="birthDay = ''">
                    <option value="">月</option>
                    <option v-for="m in birthMonths" :key="m" :value="m">{{ m }}</option>
                  </select>
                  <select v-model="birthDay" :disabled="!birthYear || !birthMonth">
                    <option value="">日</option>
                    <option v-for="d in birthDays" :key="d" :value="d">{{ d }}</option>
                  </select>
                </div>
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
          </div>

          <div class="editor-footer">
            <button type="submit" class="login-btn login-btn-confirm" :disabled="isSavingMember">
              <Save :size="17" />
              {{ isSavingMember ? '保存中...' : '保存' }}
            </button>
            <button type="button" class="login-btn login-btn-cancel" @click="closeEditor">取消</button>
          </div>
        </form>
      </aside>
    </div>
  </main>
</template>
