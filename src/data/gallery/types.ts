export type GalleryCategory = string

export interface GalleryItem {
  id: string
  year: string
  category: GalleryCategory
  title: string
  date: string
  location: string
  image: string
  thumbnail?: string
  featured?: boolean
}
