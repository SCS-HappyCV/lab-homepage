import campusMoment from '../assets/lab/campus-moment.jpg'
import heroGroup from '../assets/lab/hero-group.jpg'
import labLife from '../assets/lab/lab-life.jpg'

export type GalleryCategory = string

export interface GalleryItem {
  id: string
  year: string
  category: GalleryCategory
  title: string
  date: string
  location: string
  image: string
  people?: string
  photographer?: string
  featured?: boolean
}

export const galleryItems: GalleryItem[] = [
  {
    id: '2025-graduation-group',
    year: '2025',
    category: '毕业照',
    title: '2025 届毕业合影',
    date: '2025-06',
    location: '湘潭大学工科楼',
    image: heroGroup,
    people: '全体在校成员与毕业生',
    photographer: '实验室成员',
    featured: true,
  },
  {
    id: '2025-summer-life',
    year: '2025',
    category: '生活照',
    title: '夏季户外合影',
    date: '2025-06',
    location: '湘潭大学校园',
    image: labLife,
    people: '实验室成员',
    photographer: '实验室成员',
    featured: true,
  },
  {
    id: '2025-campus-moment',
    year: '2025',
    category: '生活照',
    title: '校园生活片段',
    date: '2025-06',
    location: '湘潭大学校园湖畔',
    image: campusMoment,
    people: '实验室成员',
    featured: true,
  },
  {
    id: '2024-graduation-memory',
    year: '2024',
    category: '毕业照',
    title: '2024 毕业季回顾',
    date: '2024-06',
    location: '实验室与学院楼',
    image: heroGroup,
    people: '2024 届毕业生',
  },
  {
    id: '2024-group-meeting',
    year: '2024',
    category: '组会活动',
    title: '年度组会交流',
    date: '2024-11',
    location: '实验室会议区',
    image: labLife,
    people: '实验室成员',
  },
  {
    id: '2023-conference-record',
    year: '2023',
    category: '比赛参会',
    title: '比赛参会记录',
    date: '2023-10',
    location: '会议/比赛现场',
    image: campusMoment,
    people: '参会成员',
  },
  {
    id: '2022-lab-life-review',
    year: '2022',
    category: '生活照',
    title: '实验室生活回顾',
    date: '2022-09',
    location: '湘潭大学',
    image: labLife,
    people: '实验室成员',
  },
  {
    id: '2021-group-discussion',
    year: '2021',
    category: '组会活动',
    title: '课题讨论瞬间',
    date: '2021-12',
    location: '实验室',
    image: heroGroup,
    people: '实验室成员',
  },
]

export const galleryYears = Array.from(new Set(galleryItems.map((item) => item.year))).sort((a, b) =>
  b.localeCompare(a),
)

export const galleryCategories = Array.from(new Set(galleryItems.map((item) => item.category)))

export const sortedGalleryItems = [...galleryItems].sort((a, b) => b.date.localeCompare(a.date))
