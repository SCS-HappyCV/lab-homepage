export type GalleryCategory = string

export interface GalleryPhoto {
  id: string
  image: string
  thumbnail?: string
  caption?: string
}

export interface GalleryEvent {
  id: string
  year: string
  categories: GalleryCategory[]
  title: string
  date: string
  location: string
  description?: string
  coverImage: string
  coverThumbnail?: string
  photos: GalleryPhoto[]
  featured?: boolean
}
