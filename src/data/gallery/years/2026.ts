import { labImage, makeLabPhoto } from '../helpers'
import type { GalleryEvent } from '../types'

export default [
  {
    id: '2026-graduation',
    year: '2026',
    categories: ['毕业照'],
    title: '2026 届毕业合影',
    date: '2026-06',
    location: '湘潭大学',
    description: '记录 2026 届毕业生在实验室、校园里的珍贵瞬间，包含信息楼、铜像广场、三拱门等地标合影。',
    featured: true,
    coverImage: labImage('2026', 'DSC_1795.JPG').image,
    coverThumbnail: labImage('2026', 'DSC_1795.JPG').thumbnail,
    photos: [
      makeLabPhoto('2026', 'DSC_1795.JPG', '信息科技大楼'),
      makeLabPhoto('2026', 'DSC_1759.JPG', '工科楼'),
      makeLabPhoto('2026', 'DSC_1773.JPG', '信息楼'),
      makeLabPhoto('2026', 'DSC_1780.JPG', '信息楼'),
      makeLabPhoto('2026', 'DSC_1838.JPG', '信息科技大楼 632'),
      makeLabPhoto('2026', 'DSC_1850.JPG', '信息科技大楼 616'),
      makeLabPhoto('2026', 'DSC_1824.JPG', '信息科技大楼'),
      makeLabPhoto('2026', 'DSC_1820.JPG', '信息科技大楼'),
      makeLabPhoto('2026', '1.jpg', '诗词碑'),
      makeLabPhoto('2026', '2.jpg', '铜像广场'),
      makeLabPhoto('2026', '3.jpg', '铜像广场'),
      makeLabPhoto('2026', '4.jpg', '铜像广场'),
      makeLabPhoto('2026', '5.jpg', '铜像广场'),
      makeLabPhoto('2026', '6.jpg', '铜像广场'),
      makeLabPhoto('2026', '7.jpg', '南门'),
      makeLabPhoto('2026', '8.jpg', '南门'),
      makeLabPhoto('2026', '9.jpg', '南门'),
      makeLabPhoto('2026', '10.jpg', '南门'),
      makeLabPhoto('2026', '11.jpg', '三拱门'),
    ],
  },
] satisfies GalleryEvent[]
