import { labImage } from '../helpers'
import type { GalleryItem } from '../types'

export default [
  {
    id: '2025-summer-life',
    year: '2025',
    category: '生活照',
    title: '夏季户外合影',
    date: '2025-06',
    location: '湘潭大学校园',
    ...labImage('lab-life.jpg'),
    featured: true,
  },
  {
    id: '2025-campus-moment',
    year: '2025',
    category: '生活照',
    title: '校园生活片段',
    date: '2025-06',
    location: '湘潭大学校园湖畔',
    ...labImage('campus-moment.jpg'),
    featured: true,
  },
] satisfies GalleryItem[]
