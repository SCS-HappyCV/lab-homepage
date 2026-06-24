import type { GalleryItem } from './types'

export { labPhoto } from './helpers'
export type { GalleryCategory, GalleryItem } from './types'

const modules = import.meta.glob<{ default: GalleryItem[] }>('./years/*.ts', { eager: true })

export const galleryItems = Object.keys(modules)
  .sort((a, b) => b.localeCompare(a))
  .flatMap((path) => modules[path].default)

export const galleryYears = Array.from(new Set(galleryItems.map((item) => item.year))).sort((a, b) =>
  b.localeCompare(a),
)

export const galleryCategories = Array.from(new Set(galleryItems.map((item) => item.category)))

export const sortedGalleryItems = [...galleryItems].sort((a, b) => b.date.localeCompare(a.date))
