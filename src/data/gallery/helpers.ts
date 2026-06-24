import { publicAsset } from '../../utils/publicAsset'

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
