import type { GalleryCategory, GalleryEvent, GalleryPhoto } from './types'

const modules = import.meta.glob<{ default: GalleryEvent[] }>('./years/*.ts', { eager: true })

export const galleryEvents: GalleryEvent[] = Object.keys(modules)
  .sort((a, b) => b.localeCompare(a))
  .flatMap((path) => modules[path].default)

export const galleryYears = Array.from(new Set(galleryEvents.map((event) => event.year))).sort(
  (a, b) => Number(b) - Number(a),
)

export const galleryCategories: GalleryCategory[] = Array.from(
  new Set(galleryEvents.flatMap((event) => event.categories)),
).sort()

export const featuredEvents = galleryEvents.filter((event) => event.featured)

export function getEventById(id: string): GalleryEvent | undefined {
  return galleryEvents.find((event) => event.id === id)
}

export function getEventPhotoById(
  event: GalleryEvent,
  photoId: string,
): GalleryPhoto | undefined {
  return event.photos.find((photo) => photo.id === photoId)
}

export function getAllPhotosFromEvents(events: GalleryEvent[]): GalleryPhoto[] {
  return events.flatMap((event) =>
    event.photos.map((photo) => ({
      ...photo,
      caption: photo.caption || `${event.title} · ${event.location}`,
    })),
  )
}
