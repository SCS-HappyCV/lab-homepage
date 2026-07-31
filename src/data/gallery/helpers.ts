import { publicAsset } from '../../utils/publicAsset'
import type { GalleryPhoto } from './types'

function thumbnailFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '.webp')
}

export function labPhoto(yearOrFileName: string, fileName?: string) {
  return publicAsset(fileName ? `gallery/lab/${yearOrFileName}/${fileName}` : `gallery/lab/${yearOrFileName}`)
}

export function labThumbnail(yearOrFileName: string, fileName?: string) {
  return publicAsset(
    fileName
      ? `gallery/lab/${yearOrFileName}/thumbs/${thumbnailFileName(fileName)}`
      : `gallery/lab/thumbs/${thumbnailFileName(yearOrFileName)}`,
  )
}

export function labImage(yearOrFileName: string, fileName?: string) {
  return {
    image: labPhoto(yearOrFileName, fileName),
    thumbnail: labThumbnail(yearOrFileName, fileName),
  }
}

export function makeLabPhoto(yearOrFileName: string, fileName?: string, caption?: string): GalleryPhoto {
  const resolvedFileName = fileName ?? yearOrFileName
  const year = fileName ? yearOrFileName : ''
  return {
    id: `${year ? `${year}-` : ''}${resolvedFileName.replace(/\.[^.]+$/, '')}`,
    ...labImage(yearOrFileName, fileName),
    caption,
  }
}
