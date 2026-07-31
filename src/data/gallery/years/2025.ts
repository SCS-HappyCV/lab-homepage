import { labImage, makeLabPhoto } from '../helpers'
import type { GalleryEvent } from '../types'

export default [
  {
    id: '2025-summer-life',
    year: '2025',
    categories: ['生活照'],
    title: '夏季户外合影',
    date: '2025-06',
    location: '湘潭大学校园',
    description: '2025 年夏季实验室成员户外合影，记录轻松愉快的团队时光。',
    featured: true,
    coverImage: labImage('lab-life.jpg').image,
    coverThumbnail: labImage('lab-life.jpg').thumbnail,
    photos: [makeLabPhoto('lab-life.jpg')],
  },
  {
    id: '2025-campus-moment',
    year: '2025',
    categories: ['生活照'],
    title: '校园生活片段',
    date: '2025-06',
    location: '湘潭大学校园湖畔',
    description: '校园湖畔的日常随拍，捕捉实验室生活的温馨瞬间。',
    featured: true,
    coverImage: labImage('campus-moment.jpg').image,
    coverThumbnail: labImage('campus-moment.jpg').thumbnail,
    photos: [makeLabPhoto('campus-moment.jpg')],
  },
] satisfies GalleryEvent[]
