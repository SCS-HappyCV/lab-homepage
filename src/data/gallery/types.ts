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

export interface Photo {
  id: string
  albumId: string
  imageUrl: string
  thumbUrl: string
  caption: string
  sortOrder: number
  createdAt: string
}

export interface AlbumBase {
  id: string
  title: string
  year: string
  date: string
  location: string
  description: string
  categories: string[]
  coverUrl: string
  coverThumb: string
  featured: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface AlbumListItem extends AlbumBase {
  photosCount: number
}

export interface Album extends AlbumBase {
  photos: Photo[]
}

export interface AlbumInput {
  title: string
  year: string
  date?: string
  location?: string
  description?: string
  categories?: string[]
  featured?: boolean
  sortOrder?: number
}
